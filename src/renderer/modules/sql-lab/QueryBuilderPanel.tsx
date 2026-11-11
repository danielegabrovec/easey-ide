// Costruttore visuale di query: trascini le tabelle, colleghi le colonne per le JOIN, spunti le colonne,
// scegli filtri, aggregati e ordinamento. Il testo SQL si genera dal vivo; si può anche importare una
// SELECT dall'editor e modificarla qui.
import { useEffect, useMemo } from 'react'
import { Handle, Position, useNodesState, type Connection, type Edge, type Node, type NodeProps } from '@xyflow/react'
import { ClipboardPaste, FilePlus2, Play, Plus, Trash2, Eraser, KeyRound } from 'lucide-react'
import type { DbTable } from '@shared/contracts/db'
import type { EditorContext } from '@shared/contracts/editor'
import { buildSql, EMPTY_MODEL, nextAlias, OPERATORS, UnsupportedQuery, type Aggregate, type FilterOperator, type QmColumn, type QueryModel, type SortOrder } from '@shared/sql/query-model'
import { statementAt } from '@shared/sql/split'
import { GraphCanvas } from '../../graph-canvas/GraphCanvas'
import { executeCommand } from '../../workbench/commands'
import { notify, notifyError } from '../../workbench/notifications'
import { t } from '../../i18n'
import { activeConnection, builderFor, useSql } from './sql-store'
import { parseToModel } from './sql-parse'

type BuilderNode = Node<{ alias: string; table: DbTable | undefined; selected: string[]; toggle: (column: string) => void; remove: () => void }, 'qbTable'>

function BuilderTable({ data }: NodeProps<BuilderNode>) {
  return (
    <div className="er-table qb-table" data-qb-table={data.alias}>
      <div className="er-head">
        <strong>{data.alias === data.table?.name ? data.alias : `${data.table?.name ?? '?'} AS ${data.alias}`}</strong>
        <button className="icon-btn nodrag" title={t('sql.removeTable')} onClick={data.remove}>
          <Trash2 size={12} />
        </button>
      </div>
      {(data.table?.columns ?? []).map((column) => (
        <label key={column.name} className="er-col nodrag" style={{ height: 22 }} data-qb-column={`${data.alias}.${column.name}`}>
          <Handle type="target" position={Position.Left} id={column.name} className="er-handle" />
          <input type="checkbox" checked={data.selected.includes(column.name)} onChange={() => data.toggle(column.name)} />
          {column.primaryKey && <KeyRound size={11} color="var(--warning)" />}
          <span>{column.name}</span>
          <span className="er-type">{column.type.toLowerCase()}</span>
          <Handle type="source" position={Position.Right} id={column.name} className="er-handle" />
        </label>
      ))}
    </div>
  )
}

const nodeTypes = { qbTable: BuilderTable }

export function QueryBuilderPanel() {
  const activeId = useSql((s) => s.activeId)
  const schema = useSql((s) => s.schemas[s.activeId])
  const model = useSql((s) => s.builders[s.activeId] ?? EMPTY_MODEL)
  const dialect = activeConnection()?.engine ?? 'sqlite'
  const setModel = (next: QueryModel) => useSql.getState().setBuilder(activeId, next)
  const sql = useMemo(() => buildSql(model, dialect), [model, dialect])

  useEffect(() => {
    if (!schema) void useSql.getState().loadSchema(activeId)
  }, [schema, activeId])

  const tableOf = (alias: string) => schema?.tables.find((t) => t.name === model.tables.find((m) => m.alias === alias)?.table)
  const allColumns = model.tables.flatMap((table) => (tableOf(table.alias)?.columns ?? []).map((c) => ({ table: table.alias, column: c.name })))

  const addTable = (name: string) => {
    if (!name) return
    const current = builderFor(activeId)
    const alias = nextAlias(current, name)
    const table = schema?.tables.find((t) => t.name === name)
    const joins = [...current.joins]
    // JOIN automatiche dalle chiavi esterne verso le tabelle già presenti.
    for (const other of current.tables) {
      const otherTable = schema?.tables.find((t) => t.name === other.table)
      for (const fk of table?.foreignKeys ?? []) if (fk.refTable === other.table) joins.push({ kind: 'INNER', left: { table: other.alias, column: fk.refColumn }, right: { table: alias, column: fk.column } })
      for (const fk of otherTable?.foreignKeys ?? []) if (fk.refTable === name) joins.push({ kind: 'INNER', left: { table: alias, column: fk.refColumn }, right: { table: other.alias, column: fk.column } })
    }
    const offset = current.tables.length
    setModel({ ...current, tables: [...current.tables, { alias, table: name, x: 30 + offset * 270, y: 20 + (offset % 2) * 40 }], joins })
  }

  const toggleColumn = (alias: string, column: string) => {
    const current = builderFor(activeId)
    const exists = current.columns.some((c) => c.table === alias && c.column === column && !c.aggregate)
    setModel({
      ...current,
      columns: exists ? current.columns.filter((c) => !(c.table === alias && c.column === column && !c.aggregate)) : [...current.columns, { table: alias, column, alias: '', aggregate: '', sort: '', visible: true }]
    })
  }

  const removeTable = (alias: string) => {
    const current = builderFor(activeId)
    setModel({
      ...current,
      tables: current.tables.filter((t) => t.alias !== alias),
      columns: current.columns.filter((c) => c.table !== alias),
      joins: current.joins.filter((j) => j.left.table !== alias && j.right.table !== alias),
      filters: current.filters.filter((f) => f.table !== alias)
    })
  }

  // React Flow deve conservare le misure dei nodi: lo stato dei nodi è suo, e qui si sincronizza col modello
  // (posizione presa dal modello solo per i nodi nuovi; lo spostamento torna nel modello a fine trascinamento).
  const [nodes, setNodes, onNodesChange] = useNodesState<BuilderNode>([])
  useEffect(() => {
    setNodes((previous) =>
      model.tables.map((table) => {
        const old = previous.find((n) => n.id === table.alias)
        return {
          ...(old ?? {}),
          id: table.alias,
          type: 'qbTable' as const,
          position: old?.position ?? { x: table.x, y: table.y },
          data: {
            alias: table.alias,
            table: schema?.tables.find((t) => t.name === table.table),
            selected: model.columns.filter((c) => c.table === table.alias && !c.aggregate).map((c) => c.column),
            toggle: (column: string) => toggleColumn(table.alias, column),
            remove: () => removeTable(table.alias)
          }
        }
      })
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.tables, model.columns, schema, setNodes])
  const edges: Edge[] = model.joins.map((join, index) => ({
    id: `j${index}`,
    source: join.left.table,
    sourceHandle: join.left.column,
    target: join.right.table,
    targetHandle: join.right.column,
    label: join.kind === 'LEFT' ? 'LEFT JOIN' : 'JOIN',
    type: 'smoothstep',
    className: 'qb-edge',
    data: { index }
  }))

  const onNodeDragStop = (_event: unknown, node: BuilderNode) => {
    const current = builderFor(activeId)
    setModel({ ...current, tables: current.tables.map((t) => (t.alias === node.id ? { ...t, x: node.position.x, y: node.position.y } : t)) })
  }

  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle || connection.source === connection.target) return
    const current = builderFor(activeId)
    setModel({ ...current, joins: [...current.joins, { kind: 'INNER', left: { table: connection.source, column: connection.sourceHandle }, right: { table: connection.target, column: connection.targetHandle } }] })
  }

  const updateColumn = (index: number, patch: Partial<QmColumn>) => setModel({ ...model, columns: model.columns.map((c, i) => (i === index ? { ...c, ...patch } : c)) })

  const importFromEditor = async () => {
    const context = (await executeCommand('editor.getContext')) as EditorContext | null
    if (!context || !/\.sql$/i.test(context.path)) {
      notify(t('sql.openSqlFile'), 'error')
      return
    }
    const lines = context.text.split('\n')
    const offset = lines.slice(0, context.cursor.line - 1).reduce((sum, l) => sum + l.length + 1, 0) + context.cursor.column - 1
    const statement = context.selection?.text ?? statementAt(context.text, offset)?.text ?? ''
    try {
      setModel(await parseToModel(statement, dialect))
      notify(t('sql.imported'), 'success')
    } catch (error) {
      if (error instanceof UnsupportedQuery) notify(error.message, 'error')
      else notifyError(error)
    }
  }

  const tablesAvailable = schema?.tables ?? []

  return (
    <div className="panel qb-panel">
      <div className="panel-toolbar">
        <select value="" onChange={(e) => addTable(e.target.value)} aria-label={t('sql.addTable')} data-testid="qb-add-table">
          <option value="">{t('sql.addTable')}…</option>
          {tablesAvailable.map((table) => (
            <option key={table.name} value={table.name}>
              {table.name}
            </option>
          ))}
        </select>
        <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={model.distinct} onChange={(e) => setModel({ ...model, distinct: e.target.checked })} /> DISTINCT
        </label>
        <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          LIMIT
          <input type="number" min={0} value={model.limit ?? ''} onChange={(e) => setModel({ ...model, limit: e.target.value ? Number(e.target.value) : null })} style={{ width: 64, height: 24, padding: '0 4px' }} />
        </label>
        <span style={{ flex: 1 }} />
        <button className="btn ghost" onClick={importFromEditor} title={t('sql.importHint')}>
          <ClipboardPaste size={13} /> {t('sql.import')}
        </button>
        <button className="icon-btn" title={t('sql.clearBuilder')} onClick={() => setModel(EMPTY_MODEL)}>
          <Eraser size={14} />
        </button>
      </div>
      <div className="qb-canvas">
        {model.tables.length === 0 ? (
          <div className="empty-state">{t('sql.builderEmpty')}</div>
        ) : (
          <GraphCanvas<BuilderNode, Edge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            onEdgeClick={(_, edge) => {
              const index = (edge.data as { index: number }).index
              setModel({ ...model, joins: model.joins.map((j, i) => (i === index ? { ...j, kind: j.kind === 'INNER' ? 'LEFT' : 'INNER' } : j)) })
            }}
            onEdgesDelete={(deleted) => {
              const indexes = new Set(deleted.map((e) => (e.data as { index: number }).index))
              setModel({ ...model, joins: model.joins.filter((_, i) => !indexes.has(i)) })
            }}
            fitViewOptions={{ maxZoom: 1 }}
            fitKey={model.tables.length}
          />
        )}
      </div>
      <div className="qb-bottom">
        <div className="qb-section">
          <div className="qb-section-head">
            <strong>{t('sql.columns')}</strong>
            <button
              className="btn ghost"
              disabled={!model.tables.length}
              onClick={() => setModel({ ...model, columns: [...model.columns, { table: model.tables[0]!.alias, column: '*', alias: 'quanti', aggregate: 'COUNT', sort: '', visible: true }] })}
            >
              <Plus size={12} /> COUNT(*)
            </button>
          </div>
          <table className="designer-grid qb-grid" data-testid="qb-columns">
            <thead>
              <tr>
                <th>{t('sql.column')}</th>
                <th>{t('sql.alias')}</th>
                <th>{t('sql.aggregate')}</th>
                <th>{t('sql.sort')}</th>
                <th>{t('sql.show')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {model.columns.map((column, index) => (
                <tr key={index}>
                  <td>
                    <select value={`${column.table}.${column.column}`} onChange={(e) => {
                      const [table, ...rest] = e.target.value.split('.')
                      updateColumn(index, { table: table!, column: rest.join('.') })
                    }}>
                      {model.tables.map((t) => (
                        <option key={`${t.alias}.*`} value={`${t.alias}.*`}>{`${t.alias}.*`}</option>
                      ))}
                      {allColumns.map((c) => (
                        <option key={`${c.table}.${c.column}`} value={`${c.table}.${c.column}`}>{`${c.table}.${c.column}`}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input value={column.alias} onChange={(e) => updateColumn(index, { alias: e.target.value })} spellCheck={false} />
                  </td>
                  <td>
                    <select value={column.aggregate} onChange={(e) => updateColumn(index, { aggregate: e.target.value as Aggregate })}>
                      {['', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].map((a) => (
                        <option key={a} value={a}>{a || '—'}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select value={column.sort} onChange={(e) => updateColumn(index, { sort: e.target.value as SortOrder })}>
                      <option value="">—</option>
                      <option value="ASC">{t('sql.asc')}</option>
                      <option value="DESC">{t('sql.desc')}</option>
                    </select>
                  </td>
                  <td className="center">
                    <input type="checkbox" checked={column.visible} onChange={(e) => updateColumn(index, { visible: e.target.checked })} />
                  </td>
                  <td>
                    <button className="icon-btn" onClick={() => setModel({ ...model, columns: model.columns.filter((_, i) => i !== index) })}>
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="qb-section">
          <div className="qb-section-head">
            <strong>{t('sql.filters')}</strong>
            <button
              className="btn ghost"
              disabled={!allColumns.length}
              onClick={() => setModel({ ...model, filters: [...model.filters, { ...allColumns[0]!, operator: '=', value: '', connector: 'AND' }] })}
              data-testid="qb-add-filter"
            >
              <Plus size={12} /> {t('sql.addFilter')}
            </button>
          </div>
          {model.filters.map((filter, index) => (
            <div key={index} className="qb-filter" data-testid="qb-filter">
              {index > 0 && (
                <select value={filter.connector} onChange={(e) => setModel({ ...model, filters: model.filters.map((f, i) => (i === index ? { ...f, connector: e.target.value as 'AND' | 'OR' } : f)) })}>
                  <option value="AND">AND</option>
                  <option value="OR">OR</option>
                </select>
              )}
              <select value={`${filter.table}.${filter.column}`} onChange={(e) => {
                const [table, ...rest] = e.target.value.split('.')
                setModel({ ...model, filters: model.filters.map((f, i) => (i === index ? { ...f, table: table!, column: rest.join('.') } : f)) })
              }}>
                {allColumns.map((c) => (
                  <option key={`${c.table}.${c.column}`} value={`${c.table}.${c.column}`}>{`${c.table}.${c.column}`}</option>
                ))}
              </select>
              <select value={filter.operator} onChange={(e) => setModel({ ...model, filters: model.filters.map((f, i) => (i === index ? { ...f, operator: e.target.value as FilterOperator } : f)) })}>
                {OPERATORS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              {!filter.operator.startsWith('IS') && (
                <input value={filter.value} onChange={(e) => setModel({ ...model, filters: model.filters.map((f, i) => (i === index ? { ...f, value: e.target.value } : f)) })} placeholder={filter.operator === 'IN' ? 'a, b, c' : t('sql.value')} spellCheck={false} />
              )}
              <button className="icon-btn" onClick={() => setModel({ ...model, filters: model.filters.filter((_, i) => i !== index) })}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
        <div className="qb-section qb-sql">
          <div className="qb-section-head">
            <strong>SQL</strong>
            <span style={{ flex: 1 }} />
            <button className="btn ghost" disabled={!sql} onClick={() => executeCommand('sql.openInEditor', { sql })}>
              <FilePlus2 size={13} /> {t('sql.toEditor')}
            </button>
            <button className="btn run" disabled={!sql} onClick={() => useSql.getState().run(sql).then(() => executeCommand('sql.showResults'))} data-testid="qb-run">
              <Play size={12} fill="currentColor" /> {t('toolbar.run')}
            </button>
          </div>
          <pre data-testid="qb-sql">{sql || t('sql.builderNoSql')}</pre>
        </div>
      </div>
    </div>
  )
}
