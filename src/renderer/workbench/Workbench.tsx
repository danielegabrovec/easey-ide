// Il guscio dell'IDE: barra superiore, area a pannelli, barra di stato e host di dialoghi/menu/avvisi.
// Non contiene logica di dominio: tutte le azioni passano dai comandi registrati dai moduli.
import { useCallback, useEffect } from 'react'
import { DockviewReact, themeDark, themeLight, type DockviewReadyEvent } from 'dockview'
import { AlertCircle, AlertTriangle, Command as CommandIcon, Moon, Play, Settings2, Sun, SquareTerminal, TerminalSquare, Globe, PenTool, Database, Zap } from 'lucide-react'
import { executeCommand } from './commands'
import { buildDefaultLayout, panelComponents, setDockApi } from './layout'
import { useWorkbench } from './store'
import { CommandPalette } from './CommandPalette'
import { DialogHost } from '../ui/dialogs'
import { ContextMenuHost } from '../ui/ContextMenu'
import { useToasts } from './notifications'
import { t } from '../i18n'
import logo from '../assets/logo.svg'

function Toolbar() {
  const project = useWorkbench((s) => s.project)
  const theme = useWorkbench((s) => s.settings.theme)
  return (
    <div className="toolbar">
      <div className="brand">
        <img className="logo" src={logo} alt="" />
        <span>Easey</span>
      </div>
      <button className="btn run" title={`${t('toolbar.run')} (F5)`} disabled={!project} onClick={() => executeCommand('run.project')} data-testid="run-project">
        <Play size={14} fill="currentColor" />
        {t('toolbar.run')}
      </button>
      <button className="btn ghost" title={`${t('toolbar.preview')}`} disabled={!project} onClick={() => executeCommand('run.preview')}>
        <Globe size={15} />
        {t('toolbar.preview')}
      </button>
      <button className="btn ghost" title={`${t('toolbar.runInTerminal')} (Ctrl+F5)`} disabled={!project} onClick={() => executeCommand('run.fileInTerminal')} data-testid="run-terminal">
        <TerminalSquare size={15} />
        {t('toolbar.runInTerminal')}
      </button>
      <div className="divider" />
      <button className="btn ghost" title={`${t('toolbar.designer')} (Ctrl+Shift+G)`} disabled={!project} onClick={() => executeCommand('designer.open')} data-testid="open-designer">
        <PenTool size={15} />
        {t('toolbar.designer')}
      </button>
      <button className="btn ghost" title={`${t('toolbar.database')} (Ctrl+Shift+D)`} disabled={!project} onClick={() => executeCommand('sql.show')}>
        <Database size={15} />
        {t('toolbar.database')}
      </button>
      <div className="divider" />
      <button className="btn ghost" title={`${t('toolbar.quickHint')} (Ctrl+Shift+Q)`} onClick={() => executeCommand('quick.open')} data-testid="open-quick">
        <Zap size={15} />
        {t('toolbar.quick')}
      </button>
      <div className="divider" />
      <button className="icon-btn" title={`${t('toolbar.newTerminal')} (Ctrl+Shift+\`)`} onClick={() => executeCommand('terminal.new')}>
        <SquareTerminal size={16} />
      </button>
      <div className="spacer" />
      {project && (
        <span className="project-name" title={project.root}>
          {project.name}
        </span>
      )}
      <div className="divider" />
      <button className="icon-btn" title={`${t('toolbar.palette')} (Ctrl+Shift+P)`} onClick={() => executeCommand('workbench.commandPalette')}>
        <CommandIcon size={16} />
      </button>
      <button className="icon-btn" title={t('toolbar.theme')} onClick={() => executeCommand('workbench.toggleTheme')}>
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <button className="icon-btn" title={t('toolbar.settings')} onClick={() => executeCommand('workbench.settings')}>
        <Settings2 size={16} />
      </button>
    </div>
  )
}

function StatusBar() {
  const project = useWorkbench((s) => s.project)
  const activeFile = useWorkbench((s) => s.activeFile)
  const cursor = useWorkbench((s) => s.cursor)
  const errors = useWorkbench((s) => s.problems.errors)
  const warnings = useWorkbench((s) => s.problems.warnings)
  const dirtyCount = useWorkbench((s) => s.dirty.length)
  const autoSave = useWorkbench((s) => s.settings.autoSave)
  const items = useWorkbench((s) => s.statusItems)
  return (
    <div className="statusbar">
      <button className="item" onClick={() => executeCommand('editor.showProblems')} title={t('status.problems')} data-testid="status-problems">
        <AlertCircle size={13} color={errors ? 'var(--danger)' : undefined} /> {errors}
        <AlertTriangle size={13} color={warnings ? 'var(--warning)' : undefined} /> {warnings}
      </button>
      {project && <span className="item">{project.config.run.mode === 'web' ? t('status.modeWeb') : t('status.modeTerminal')}</span>}
      {activeFile && <span className="item">{activeFile}</span>}
      <span className="push" />
      {items.map((item) =>
        item.command ? (
          <button key={item.id} className={`item tone-${item.tone ?? 'normal'}`} title={item.title} onClick={() => executeCommand(item.command!)} data-status-item={item.id}>
            {item.text}
          </button>
        ) : (
          <span key={item.id} className={`item tone-${item.tone ?? 'normal'}`} title={item.title} data-status-item={item.id}>
            {item.text}
          </span>
        )
      )}
      {dirtyCount > 0 && <span className="item">{t('status.unsaved', { count: dirtyCount })}</span>}
      <span className="item">{autoSave ? t('status.autoSaveOn') : t('status.autoSaveOff')}</span>
      {cursor && <span className="item">{t('status.cursor', { line: cursor.line, column: cursor.column })}</span>}
    </div>
  )
}

function Toasts() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`} onClick={() => dismiss(toast.id)} role={toast.kind === 'error' ? 'alert' : 'status'}>
          {toast.message}
        </div>
      ))}
    </div>
  )
}

export function Workbench() {
  const theme = useWorkbench((s) => s.settings.theme)

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme
  }, [theme])

  const onReady = useCallback((event: DockviewReadyEvent) => {
    setDockApi(event.api)
    buildDefaultLayout()
  }, [])

  useEffect(() => () => setDockApi(null), [])

  return (
    <div className="shell">
      <Toolbar />
      <div className="dock-host">
        <DockviewReact components={panelComponents()} onReady={onReady} theme={theme === 'dark' ? themeDark : themeLight} />
      </div>
      <StatusBar />
      <CommandPalette />
      <DialogHost />
      <ContextMenuHost />
      <Toasts />
    </div>
  )
}
