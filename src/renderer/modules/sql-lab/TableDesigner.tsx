// Designer grafico delle tabelle: colonne, tipi, chiavi, vincoli e riferimenti, con anteprima del DDL.
import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { DbSchema, SqlDialect } from '@shared/contracts/db'
import { addColumnSql, COLUMN_TYPES, createTableSql, emptyColumn, validateDraft, type ColumnDraft, type TableDraft } from '@shared/sql/ddl'
import { Modal } from '../../ui/dialogs'
import { notify } from '../../workbench/notifications'
import { t } from '../../i18n'
import { useSql } from './sql-store'

interface Props {
  connectionId: string
  dialect: SqlDialect
  schema: DbSchema | null
  /** Se presente: aggiunta di colonne a una tabella esistente. */
  existingTable?: string
  close: () => void
}

export function TableDesigner({ connectionId, dialect, schema, existingTable, close }: Props) {
  const [draft, setDraft] = useState<TableDraft>(() =>
    existingTable
      ? { name: existingTable, columns: [{ ...emptyColumn() }] }
      : { name: '', columns: [{ ...emptyColumn(), name: 'id', type: 'INTEGER', primaryKey: true, autoIncrement: true }, { ...emptyColumn(), name: '', type: 'TEXT' }] }
  )
  const [error, setError] = useState<string | null>(null)
  const types = COLUMN_TYPES[dialect]
  const references = useMemo(() => (schema?.tables ?? []).filter((t) => t.kind === 'table').flatMap((t) => t.columns.filter((c) => c.primaryKey || c.unique).map((c) => `${t.name}.${c.name}`)), [schema])
  const existing = (schema?.tables ?? []).map((t) => t.name)

  const errors = existingTable ? (draft.columns.some((c) => c.name.trim()) ? [] : [t('sql.designerNeedColumn')]) : validateDraft(draft, existing)
  const sql = existingTable
    ? draft.columns
        .filter((c) => c.name.trim())
        .map((c) => addColumnSql(existingTable, c, dialect))
        .join('\n')
    : createTableSql(draft, dialect)

  const update = (index: number, patch: Partial<ColumnDraft>) =>
    setDraft((d) => ({ ...d, columns: d.columns.map((c, i) => (i === index ? { ...c, ...patch, ...(patch.primaryKey === false ? { autoIncrement: false } : {}) } : c)) }))

  const create = async () => {
    setError(null)
    const outcomes = await useSql.getState().run(sql, connectionId)
    const failure = outcomes.find((o) => o.kind === 'error')
    if (failure && failure.kind === 'error') {
      setError(failure.message)
      return
    }
    notify(existingTable ? t('sql.columnsAdded') : t('sql.tableCreated', { name: draft.name.trim() }), 'success')
    close()
  }

  return (
    <Modal
      title={existingTable ? t('sql.addColumnsTitle', { name: existingTable }) : t('sql.newTableTitle')}
      wide
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" disabled={errors.length > 0} onClick={create} data-testid="designer-create">
            {existingTable ? t('sql.addColumns') : t('sql.createTable')}
          </button>
        </>
      }
    >
      {!existingTable && (
        <div className="field">
          <label>{t('sql.tableName')}</label>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} spellCheck={false} autoFocus data-testid="designer-name" />
        </div>
      )}
      <table className="designer-grid">
        <thead>
          <tr>
            <th>{t('sql.colName')}</th>
            <th>{t('sql.colType')}</th>
            {!existingTable && <th title={t('sql.colPkHint')}>PK</th>}
            {!existingTable && <th title={t('sql.colAiHint')}>Auto</th>}
            <th title={t('sql.colNnHint')}>Obblig.</th>
            {!existingTable && <th title={t('sql.colUqHint')}>Unico</th>}
            <th>{t('sql.colDefault')}</th>
            <th>{t('sql.colRef')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {draft.columns.map((column, index) => (
            <tr key={index} data-testid="designer-row">
              <td>
                <input value={column.name} onChange={(e) => update(index, { name: e.target.value })} spellCheck={false} placeholder="nome_colonna" />
              </td>
              <td>
                <input list={`types-${dialect}`} value={column.type} onChange={(e) => update(index, { type: e.target.value })} spellCheck={false} />
              </td>
              {!existingTable && (
                <td className="center">
                  <input type="checkbox" checked={column.primaryKey} onChange={(e) => update(index, { primaryKey: e.target.checked })} />
                </td>
              )}
              {!existingTable && (
                <td className="center">
                  <input type="checkbox" checked={column.autoIncrement} disabled={!column.primaryKey} onChange={(e) => update(index, { autoIncrement: e.target.checked })} />
                </td>
              )}
              <td className="center">
                <input type="checkbox" checked={column.notNull} onChange={(e) => update(index, { notNull: e.target.checked })} />
              </td>
              {!existingTable && (
                <td className="center">
                  <input type="checkbox" checked={column.unique} onChange={(e) => update(index, { unique: e.target.checked })} />
                </td>
              )}
              <td>
                <input value={column.defaultValue} onChange={(e) => update(index, { defaultValue: e.target.value })} spellCheck={false} placeholder="—" />
              </td>
              <td>
                <select value={column.references} onChange={(e) => update(index, { references: e.target.value })}>
                  <option value="">—</option>
                  {references.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <button className="icon-btn" title={t('sql.removeColumn')} onClick={() => setDraft((d) => ({ ...d, columns: d.columns.filter((_, i) => i !== index) }))}>
                  <Trash2 size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <datalist id={`types-${dialect}`}>
        {types.map((type) => (
          <option key={type} value={type} />
        ))}
      </datalist>
      <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setDraft((d) => ({ ...d, columns: [...d.columns, emptyColumn()] }))} data-testid="designer-add-column">
        <Plus size={13} /> {t('sql.addColumn')}
      </button>
      <div className="field">
        <label>{t('sql.ddlPreview')}</label>
        <pre className="ddl-preview" data-testid="designer-ddl">
          {sql}
        </pre>
      </div>
      {errors.length > 0 && <div className="error-text">{errors.join(' ')}</div>}
      {error && <div className="error-text">{error}</div>}
    </Modal>
  )
}
