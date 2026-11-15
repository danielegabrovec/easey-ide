// Il guscio dell'IDE: barra superiore, area a pannelli con il pannello laterale destro (chat AI),
// barra di stato e host di dialoghi/menu/avvisi.
// Non contiene logica di dominio: tutte le azioni passano dai comandi registrati dai moduli.
import { useCallback, useEffect, useState } from 'react'
import { DockviewReact, themeDark, themeLight, type DockviewReadyEvent } from 'dockview'
import { AlertCircle, AlertTriangle, Copy, History, X, Command as CommandIcon, Moon, Play, Settings2, Sun, SquareTerminal, TerminalSquare, Globe, PenTool, Database, Zap, PanelLeftClose, PanelLeftOpen, PanelBottomClose, PanelBottomOpen } from 'lucide-react'
import { executeCommand } from './commands'
import { buildDefaultLayout, panelComponents, setDockApi, useLayout } from './layout'
import { useWorkbench } from './store'
import { CommandPalette } from './CommandPalette'
import { SidePanelHost } from './SidePanel'
import { DialogHost } from '../ui/dialogs'
import { ContextMenuHost } from '../ui/ContextMenu'
import { TourHost } from '../ui/Tour'
import { Slot } from './slots'
import { useToasts, type Toast } from './notifications'
import { useActivity } from './activity'
import { ErrorBoundary } from './ErrorBoundary'
import { t } from '../i18n'
import logo from '../assets/logo.svg'

/** Esplora (Ctrl+B) e anteprima + console (Ctrl+J): sempre un clic per riaverli. */
function LayoutToggles() {
  const sidebar = useLayout((s) => s.sidebar)
  const panels = useLayout((s) => s.panels)
  return (
    <>
      <button
        className="icon-btn"
        title={`${sidebar ? t('toolbar.sidebarHide') : t('toolbar.sidebarShow')} (Ctrl+B)`}
        aria-pressed={sidebar}
        onClick={() => executeCommand('workbench.toggleSidebar')}
        data-testid="toggle-sidebar"
      >
        {sidebar ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
      </button>
      <button
        className="icon-btn"
        title={`${panels ? t('toolbar.panelsHide') : t('toolbar.panelsShow')} (Ctrl+J)`}
        aria-pressed={panels}
        onClick={() => executeCommand('workbench.togglePanels')}
        data-testid="toggle-panels"
      >
        {panels ? <PanelBottomClose size={16} /> : <PanelBottomOpen size={16} />}
      </button>
    </>
  )
}

function Toolbar() {
  const project = useWorkbench((s) => s.project)
  const theme = useWorkbench((s) => s.settings.theme)
  return (
    <div className="toolbar">
      <div className="brand">
        <img className="logo" src={logo} alt="" />
        <span>Easey</span>
      </div>
      <LayoutToggles />
      <div className="divider" />
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
      <ActivityButton />
      {dirtyCount > 0 && <span className="item">{t('status.unsaved', { count: dirtyCount })}</span>}
      <span className="item">{autoSave ? t('status.autoSaveOn') : t('status.autoSaveOff')}</span>
      {cursor && <span className="item">{t('status.cursor', { line: cursor.line, column: cursor.column })}</span>}
    </div>
  )
}

function ToastView({ toast }: { toast: Toast }) {
  const dismiss = useToasts((s) => s.dismiss)
  const [open, setOpen] = useState(false)
  // Gli errori restano finché non si chiudono con ✕: un clic per selezionare il testo non li fa sparire.
  const sticky = toast.kind === 'error'
  const text = [toast.title, toast.message, toast.details && toast.details !== toast.message ? toast.details : null].filter(Boolean).join('\n\n')
  return (
    <div
      className={`toast ${toast.kind}${open ? ' open' : ''}`}
      role={toast.kind === 'error' ? 'alert' : 'status'}
      onClick={sticky ? undefined : () => dismiss(toast.id)}
      data-testid="toast"
      data-kind={toast.kind}
    >
      <div className="toast-body">
        {toast.title && <strong className="toast-title">{toast.title}</strong>}
        <span className="toast-message">{toast.message}</span>
        {open && <pre className="toast-details">{toast.details ?? toast.message}</pre>}
      </div>
      {sticky && (
        <div className="toast-actions">
          <button className="btn ghost" onClick={() => void navigator.clipboard?.writeText(text).catch(() => undefined)} data-testid="toast-copy">
            <Copy size={12} /> {t('toast.copy')}
          </button>
          <button className="btn ghost" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="toast-details">
            {open ? t('toast.hideDetails') : t('toast.details')}
          </button>
          <span style={{ flex: 1 }} />
          <button className="icon-btn" title={t('toast.dismiss')} aria-label={t('toast.dismiss')} onClick={() => dismiss(toast.id)} data-testid="toast-dismiss">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

function Toasts() {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <ToastView key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

/** Registro delle attività: ogni avviso ed errore della sessione, con il pallino degli errori non visti. */
function ActivityButton() {
  const unseen = useActivity((s) => s.unseenErrors)
  return (
    <button className={`item${unseen ? ' tone-error' : ''}`} onClick={() => executeCommand('workbench.activity')} title={t('activity.statusTitle')} data-testid="status-activity">
      <History size={13} /> {t('activity.status')}
      {unseen > 0 && <span className="activity-badge">{unseen}</span>}
    </button>
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
      <div className="workbench-main">
        <div className="dock-host">
          <DockviewReact components={panelComponents()} onReady={onReady} theme={theme === 'dark' ? themeDark : themeLight} />
          <Toasts />
        </div>
        <ErrorBoundary name={t('activity.sidePanel')}>
          <SidePanelHost />
        </ErrorBoundary>
      </div>
      <StatusBar />
      <CommandPalette />
      <DialogHost />
      <ContextMenuHost />
      <Slot name="workbench.overlay" />
      <TourHost />
    </div>
  )
}
