// Modulo SQL Lab: database del progetto (SQLite e PostgreSQL incorporato), esecuzione dei file .sql,
// risultati, terminale SQL, designer di tabelle, diagramma ER, costruttore visuale, piano di esecuzione.
import * as monaco from 'monaco-editor'
import type { EditorContext } from '@shared/contracts/editor'
import { extensionOf } from '@shared/paths'
import { statementAt } from '@shared/sql/split'
import { dropTableSql } from '@shared/sql/ddl'
import { ide } from '../../ipc'
import { executeCommand, registerCommand } from '../../workbench/commands'
import { on } from '../../workbench/events'
import { registerPanel, showPanel } from '../../workbench/layout'
import { registerFileOpener } from '../../workbench/openers'
import { notify, notifyError } from '../../workbench/notifications'
import { workbench } from '../../workbench/store'
import { confirm, openDialog } from '../../ui/dialogs'
import { t } from '../../i18n'
import { DatabasePanel } from './DatabasePanel'
import { ErDiagramPanel } from './ErDiagramPanel'
import { NewDatabaseDialog } from './NewDatabaseDialog'
import { QueryBuilderPanel } from './QueryBuilderPanel'
import { ResultsPanel } from './ResultsPanel'
import { SqlTerminalPanel } from './SqlTerminalPanel'
import { TableDesigner } from './TableDesigner'
import { registerSqlCompletion } from './sql-completion'
import { activeConnection, MEMORY_ID, useSql } from './sql-store'

const DB_EXTENSIONS = ['db', 'sqlite', 'sqlite3']

const showDatabase = () => showPanel({ id: 'sql-db', component: 'sql-db', title: t('panel.database'), area: 'left' })
const showResults = () => showPanel({ id: 'sql-results', component: 'sql-results', title: t('panel.results'), area: 'bottom' })

/** Testo da eseguire dall'editor: selezione, istruzione sotto il cursore o file intero. */
async function sqlFromEditor(whole: boolean): Promise<string | null> {
  const context = (await executeCommand('editor.getContext')) as EditorContext | null
  if (!context || extensionOf(context.path) !== 'sql') {
    notify(t('sql.openSqlFile'), 'error')
    return null
  }
  if (whole) return context.text
  if (context.selection) return context.selection.text
  const lines = context.text.split('\n')
  const offset = lines.slice(0, context.cursor.line - 1).reduce((sum, l) => sum + l.length + 1, 0) + context.cursor.column - 1
  return statementAt(context.text, offset)?.text ?? null
}

async function nextQueryPath(): Promise<string> {
  const tree = workbench().tree
  const names = new Set(tree.find((e) => e.name === 'query')?.children?.map((c) => c.name) ?? [])
  let n = 1
  while (names.has(`query-${n}.sql`)) n++
  return `query/query-${n}.sql`
}

function updateStatus(): void {
  const connection = activeConnection()
  const { connections } = useSql.getState()
  if (!workbench().project || connections.length <= 1) {
    workbench().removeStatusItem('sql')
    return
  }
  workbench().setStatusItem({ id: 'sql', text: `⛁ ${connection?.name ?? '—'}`, title: t('sql.statusTitle'), command: 'sql.show' })
}

export function activateSqlLab(): void {
  registerPanel('sql-db', DatabasePanel)
  registerPanel('sql-results', ResultsPanel)
  registerPanel('sql-terminal', SqlTerminalPanel)
  registerPanel('sql-er', ErDiagramPanel)
  registerPanel('sql-builder', QueryBuilderPanel)
  registerSqlCompletion()

  const category = 'SQL'
  const hasProject = () => workbench().project !== null
  const isSqlFile = () => extensionOf(workbench().activeFile ?? '') === 'sql'

  registerCommand({ id: 'sql.show', title: t('cmd.sqlShow'), category, keybinding: 'Ctrl+Shift+D', run: () => showDatabase() })
  registerCommand({ id: 'sql.showResults', title: t('cmd.sqlResults'), category, run: () => showResults() })
  registerCommand({
    id: 'sql.run',
    title: t('cmd.sqlRun'),
    category,
    keybinding: 'Ctrl+Enter',
    when: isSqlFile,
    run: async () => {
      const sql = await sqlFromEditor(false)
      if (!sql) return
      showResults()
      await useSql.getState().run(sql)
    }
  })
  registerCommand({
    id: 'sql.runFile',
    title: t('cmd.sqlRunFile'),
    category,
    keybinding: 'Ctrl+Shift+Enter',
    when: isSqlFile,
    run: async () => {
      const sql = await sqlFromEditor(true)
      if (!sql) return
      showResults()
      await useSql.getState().run(sql)
    }
  })
  registerCommand({
    id: 'sql.explain',
    title: t('cmd.sqlExplain'),
    category,
    keybinding: 'Ctrl+Alt+E',
    when: isSqlFile,
    run: async () => {
      const sql = await sqlFromEditor(false)
      if (!sql) return
      showResults()
      await useSql.getState().explain(sql)
    }
  })
  registerCommand({
    id: 'sql.aiExplainQuery',
    title: t('sql.aiExplainQuery'),
    category,
    when: isSqlFile,
    run: async () => {
      const sql = await sqlFromEditor(false)
      if (sql) await executeCommand('ai.ask', { prompt: t('sql.aiExplainQueryPrompt', { sql }), display: t('sql.aiExplainQuery') })
    }
  })
  registerCommand({ id: 'sql.newDatabase', title: t('cmd.sqlNewDb'), category, when: hasProject, run: () => openDialog((close) => <NewDatabaseDialog close={close} />) })
  registerCommand({
    id: 'sql.deleteDatabase',
    title: t('sql.deleteDb'),
    category,
    when: () => useSql.getState().activeId !== MEMORY_ID,
    run: async () => {
      const connection = activeConnection()
      if (!connection) return
      const ok = await confirm({ title: t('sql.deleteDb'), message: t('sql.deleteDbConfirm', { name: connection.name, path: connection.path }), confirmLabel: t('explorer.delete'), danger: true })
      if (!ok) return
      await ide.invoke('db:delete', connection.id)
      await useSql.getState().refresh()
      notify(t('sql.dbDeleted'), 'success')
    }
  })
  registerCommand({
    id: 'sql.newTable',
    title: t('cmd.sqlNewTable'),
    category,
    run: async () => {
      const { activeId } = useSql.getState()
      const schema = useSql.getState().schemas[activeId] ?? (await useSql.getState().loadSchema(activeId))
      openDialog((close) => <TableDesigner connectionId={activeId} dialect={activeConnection()?.engine ?? 'sqlite'} schema={schema} close={close} />)
    }
  })
  registerCommand<{ table: string }>({
    id: 'sql.addColumns',
    title: t('sql.addColumns'),
    palette: false,
    run: (args) => {
      if (!args) return
      const { activeId, schemas } = useSql.getState()
      openDialog((close) => <TableDesigner connectionId={activeId} dialect={activeConnection()?.engine ?? 'sqlite'} schema={schemas[activeId] ?? null} existingTable={args.table} close={close} />)
    }
  })
  registerCommand<{ table: string }>({
    id: 'sql.dropTable',
    title: t('sql.dropTable'),
    palette: false,
    run: async (args) => {
      if (!args) return
      const ok = await confirm({ title: t('sql.dropTable'), message: t('sql.dropTableConfirm', { name: args.table }), confirmLabel: t('explorer.delete'), danger: true })
      if (!ok) return
      showResults()
      await useSql.getState().run(dropTableSql(args.table, activeConnection()?.engine ?? 'sqlite'))
    }
  })
  registerCommand<{ table: string }>({
    id: 'sql.showData',
    title: t('sql.showData'),
    palette: false,
    run: async (args) => {
      if (!args) return
      showResults()
      const quoted = /^[A-Za-z_][\w]*$/.test(args.table) ? args.table : `"${args.table.replace(/"/g, '""')}"`
      await useSql.getState().run(`SELECT * FROM ${quoted} LIMIT 200;`)
    }
  })
  registerCommand({ id: 'sql.er', title: t('cmd.sqlEr'), category, run: () => showPanel({ id: 'sql-er', component: 'sql-er', title: t('panel.er'), area: 'center' }) })
  registerCommand({ id: 'sql.builder', title: t('cmd.sqlBuilder'), category, run: () => showPanel({ id: 'sql-builder', component: 'sql-builder', title: t('panel.builder'), area: 'center' }) })
  registerCommand({ id: 'sql.terminal', title: t('cmd.sqlTerminal'), category, run: () => showPanel({ id: 'sql-terminal', component: 'sql-terminal', title: t('panel.sqlTerminal'), area: 'bottom', renderer: 'always' }) })
  registerCommand<{ sql?: string }>({
    id: 'sql.openInEditor',
    title: t('cmd.sqlNewQuery'),
    palette: false,
    when: hasProject,
    run: async (args) => {
      const path = await nextQueryPath()
      const connection = activeConnection()
      const header = `-- Database: ${connection?.name ?? ''} (${connection?.engine === 'postgres' ? 'PostgreSQL' : 'SQLite'})\n-- Ctrl+Invio esegue l’istruzione sotto il cursore, Ctrl+Maiusc+Invio tutto il file.\n\n`
      await ide.invoke('workspace:createFile', path, header + (args?.sql ?? ''))
      await executeCommand('editor.open', { path })
    }
  })
  registerCommand({
    id: 'sql.newQuery',
    title: t('cmd.sqlNewQuery'),
    category,
    when: hasProject,
    run: async () => {
      const schema = useSql.getState().schemas[useSql.getState().activeId]
      const first = schema?.tables[0]?.name
      await executeCommand('sql.openInEditor', { sql: first ? `SELECT *\nFROM ${first}\nLIMIT 20;\n` : 'SELECT 1;\n' })
    }
  })
  registerCommand<{ path: string }>({
    id: 'sql.openDatabase',
    title: 'sql.openDatabase',
    palette: false,
    run: async (args) => {
      if (!args) return
      await useSql.getState().refresh()
      const connection = useSql.getState().connections.find((c) => c.path === args.path)
      if (connection) useSql.getState().setActive(connection.id)
      showDatabase()
    }
  })
  registerCommand({
    id: 'sql.activeSchema',
    title: 'sql.activeSchema',
    palette: false,
    run: async () => {
      const { activeId, schemas } = useSql.getState()
      return { connection: activeConnection() ?? null, schema: schemas[activeId] ?? (await useSql.getState().loadSchema(activeId)) }
    }
  })
  registerFileOpener({ id: 'sqlite', matches: (path) => DB_EXTENSIONS.includes(extensionOf(path)), command: 'sql.openDatabase' })

  // Voci nel menu del tasto destro dei file .sql.
  const actions: [string, string, string, number[]][] = [
    ['lab.sql.run', t('cmd.sqlRun'), 'sql.run', [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter]],
    ['lab.sql.runFile', t('cmd.sqlRunFile'), 'sql.runFile', []],
    ['lab.sql.explain', t('cmd.sqlExplain'), 'sql.explain', []],
    ['lab.sql.ai', `✦ ${t('sql.aiExplainQuery')}`, 'sql.aiExplainQuery', []]
  ]
  actions.forEach(([id, label, command], index) =>
    monaco.editor.addEditorAction({ id, label, precondition: 'editorLangId == sql', contextMenuGroupId: '0_sql', contextMenuOrder: index, run: () => void executeCommand(command) })
  )

  useSql.subscribe((state, previous) => {
    if (state.activeId !== previous.activeId || state.connections !== previous.connections) updateStatus()
  })
  on('project:opened', () => {
    useSql.getState().reset()
    void useSql.getState().refresh().then(() => useSql.getState().loadSchema())
  })
  on('project:closed', () => {
    useSql.getState().reset()
    updateStatus()
  })
  on('files:changed', ({ paths }) => {
    if (paths.some((p) => DB_EXTENSIONS.includes(extensionOf(p)))) void useSql.getState().refresh().catch(notifyError)
  })
}
