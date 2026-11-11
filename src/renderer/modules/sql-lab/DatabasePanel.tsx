// Pannello Database: scelta della connessione, albero dello schema, strumenti grafici, sandbox,
// e generazione di SQL da una descrizione in italiano (AI locale).
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Database, Eye, History, KeyRound, Link2, Network, Plus, RefreshCw, Save, Sparkles, SquareTerminal, Table2, Trash2, Wand2, Workflow } from 'lucide-react'
import type { DbSnapshot, DbTable } from '@shared/contracts/db'
import { schemaToDdl } from '@shared/sql/ddl'
import { ide } from '../../ipc'
import { executeCommand } from '../../workbench/commands'
import { notify, notifyError } from '../../workbench/notifications'
import { useWorkbench } from '../../workbench/store'
import { showContextMenu } from '../../ui/ContextMenu'
import { confirm, Modal, openDialog } from '../../ui/dialogs'
import { activeModels, extractCode, streamChat } from '../../services/ai-client'
import { t } from '../../i18n'
import { activeConnection, MEMORY_ID, useSql } from './sql-store'

function TableItem({ table }: { table: DbTable }) {
  const [open, setOpen] = useState(false)
  const fkColumns = new Map(table.foreignKeys.map((f) => [f.column, `${f.refTable}.${f.refColumn}`]))
  return (
    <>
      <div
        className="tree-row"
        onClick={() => setOpen(!open)}
        onDoubleClick={() => executeCommand('sql.showData', { table: table.name })}
        data-db-table={table.name}
        onContextMenu={(event) =>
          showContextMenu(event, [
            { label: t('sql.showData'), run: () => executeCommand('sql.showData', { table: table.name }) },
            { label: t('sql.newQueryOn', { name: table.name }), run: () => executeCommand('sql.openInEditor', { sql: `SELECT *\nFROM ${table.name}\nLIMIT 20;` }) },
            ...(table.kind === 'table'
              ? [
                  { label: t('sql.addColumns'), run: () => executeCommand('sql.addColumns', { table: table.name }) },
                  'separator' as const,
                  { label: t('sql.dropTable'), danger: true, run: () => executeCommand('sql.dropTable', { table: table.name }) }
                ]
              : [])
          ])
        }
        style={{ paddingLeft: 6 }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {table.kind === 'view' ? <Eye size={13} /> : <Table2 size={13} />}
        <span className="tree-name">{table.name}</span>
        {table.rowCount !== null && <span className="hint" style={{ marginLeft: 'auto' }}>{table.rowCount}</span>}
      </div>
      {open &&
        table.columns.map((column) => (
          <div key={column.name} className="tree-row db-column" style={{ paddingLeft: 34 }} title={fkColumns.get(column.name) ? `→ ${fkColumns.get(column.name)}` : undefined}>
            {column.primaryKey ? <KeyRound size={11} color="var(--warning)" /> : fkColumns.has(column.name) ? <Link2 size={11} color="var(--accent-strong)" /> : <span style={{ width: 11 }} />}
            <span className="tree-name">{column.name}</span>
            <span className="hint" style={{ marginLeft: 'auto' }}>
              {column.type.toLowerCase()}
              {column.notNull && !column.primaryKey ? ' · obblig.' : ''}
            </span>
          </div>
        ))}
    </>
  )
}

function SnapshotsDialog({ id, close }: { id: string; close: () => void }) {
  const [list, setList] = useState<DbSnapshot[] | null>(null)
  useEffect(() => {
    void ide.invoke('db:snapshots', id).then(setList, notifyError)
  }, [id])
  return (
    <Modal title={t('sql.restoreTitle')} onClose={close} footer={<button className="btn" onClick={close}>{t('common.close')}</button>}>
      {list === null ? (
        <div className="hint">{t('common.loading')}</div>
      ) : list.length === 0 ? (
        <div className="hint">{t('sql.noSnapshots')}</div>
      ) : (
        <ul className="history-list">
          {list.map((snapshot) => (
            <li key={snapshot.id}>
              <button
                onClick={async () => {
                  const ok = await confirm({ title: t('sql.restoreTitle'), message: t('sql.restoreConfirm', { when: new Date(snapshot.at).toLocaleString('it-IT') }), confirmLabel: t('sql.restore'), danger: true })
                  if (!ok) return
                  await ide.invoke('db:restore', id, snapshot.id)
                  await useSql.getState().loadSchema(id)
                  notify(t('sql.restored'), 'success')
                  close()
                }}
              >
                {new Date(snapshot.at).toLocaleString('it-IT')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

function NaturalLanguage() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const aiReady = !!activeModels().chat
  const generate = async () => {
    const connection = activeConnection()
    if (!connection || !text.trim()) return
    setBusy(true)
    try {
      const schema = useSql.getState().schemas[connection.id] ?? (await useSql.getState().loadSchema(connection.id))
      const dialect = connection.engine === 'postgres' ? 'PostgreSQL' : 'SQLite'
      const stream = streamChat(
        [
          { role: 'system', content: t('sql.nlSystem', { dialect }) },
          { role: 'user', content: t('sql.nlPrompt', { dialect, schema: schema ? schemaToDdl(schema) : '-', request: text.trim() }) }
        ],
        () => undefined
      )
      const answer = await stream.done
      const sql = extractCode(answer)
      await executeCommand('sql.openInEditor', { sql: `-- ${text.trim()}\n${sql.endsWith(';') ? sql : `${sql};`}` })
      notify(t('sql.nlDone'), 'success')
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="db-nl">
      <label className="hint">
        <Sparkles size={12} /> {t('sql.nlLabel')}
      </label>
      <textarea
        rows={2}
        value={text}
        disabled={!aiReady || busy}
        placeholder={aiReady ? t('sql.nlPlaceholder') : t('ai.statusOff')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void generate()
          }
        }}
        data-testid="sql-nl"
      />
      <button className="btn" disabled={!aiReady || busy || !text.trim()} onClick={generate}>
        <Wand2 size={13} /> {busy ? t('sql.nlBusy') : t('sql.nlGenerate')}
      </button>
    </div>
  )
}

export function DatabasePanel() {
  const project = useWorkbench((s) => s.project)
  const connections = useSql((s) => s.connections)
  const activeId = useSql((s) => s.activeId)
  const schema = useSql((s) => s.schemas[s.activeId])
  const setActive = useSql((s) => s.setActive)

  useEffect(() => {
    void useSql.getState().refresh()
  }, [project?.root])

  useEffect(() => {
    if (!schema) void useSql.getState().loadSchema(activeId)
  }, [activeId, schema])

  const connection = connections.find((c) => c.id === activeId)

  return (
    <div className="panel db-panel">
      <div className="panel-toolbar">
        <Database size={14} color="var(--text-muted)" />
        <select value={activeId} onChange={(e) => setActive(e.target.value)} style={{ flex: 1, minWidth: 0 }} data-testid="db-select" aria-label={t('sql.connection')}>
          {connections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.engine === 'sqlite' ? 'SQLite' : 'PostgreSQL'}
            </option>
          ))}
        </select>
        <button className="icon-btn" title={t('sql.newDb')} disabled={!project} onClick={() => executeCommand('sql.newDatabase')} data-testid="db-new">
          <Plus size={15} />
        </button>
        <button className="icon-btn" title={t('sql.refresh')} onClick={() => useSql.getState().refresh().then(() => useSql.getState().loadSchema())}>
          <RefreshCw size={13} />
        </button>
      </div>
      <div className="db-tools">
        <button className="btn ghost" onClick={() => executeCommand('sql.newTable')} data-testid="db-new-table">
          <Plus size={13} /> {t('sql.newTable')}
        </button>
        <button className="btn ghost" onClick={() => executeCommand('sql.er')}>
          <Network size={13} /> {t('sql.er')}
        </button>
        <button className="btn ghost" onClick={() => executeCommand('sql.builder')} data-testid="db-builder">
          <Workflow size={13} /> {t('sql.builder')}
        </button>
        <button className="btn ghost" onClick={() => executeCommand('sql.terminal')} data-testid="db-terminal">
          <SquareTerminal size={13} /> {t('sql.terminal')}
        </button>
        <button className="btn ghost" onClick={() => executeCommand('sql.newQuery')}>
          <Plus size={13} /> {t('sql.newQuery')}
        </button>
      </div>
      <div className="panel-body tree" role="tree">
        {schema?.tables.length === 0 && <div className="hint" style={{ padding: 10 }}>{t('sql.noTables')}</div>}
        {schema?.tables.map((table) => (
          <TableItem key={table.name} table={table} />
        ))}
      </div>
      {connection && connection.id !== MEMORY_ID && (
        <div className="db-sandbox">
          <span className="hint">{t('sql.sandbox')}</span>
          <button
            className="btn ghost"
            title={t('sql.snapshotHint')}
            onClick={async () => {
              try {
                await ide.invoke('db:snapshot', connection.id)
                notify(t('sql.snapshotSaved'), 'success')
              } catch (error) {
                notifyError(error)
              }
            }}
            data-testid="db-snapshot"
          >
            <Save size={13} /> {t('sql.snapshot')}
          </button>
          <button className="btn ghost" onClick={() => openDialog((close) => <SnapshotsDialog id={connection.id} close={close} />)}>
            <History size={13} /> {t('sql.restore')}
          </button>
          <button className="icon-btn" title={t('sql.deleteDb')} onClick={() => executeCommand('sql.deleteDatabase')}>
            <Trash2 size={13} />
          </button>
        </div>
      )}
      <NaturalLanguage />
    </div>
  )
}
