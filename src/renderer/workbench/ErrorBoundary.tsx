// Barriere contro gli errori di React: un pannello che si rompe mostra «Il pannello si è bloccato» invece di
// lasciare bianca tutta la finestra; la barriera della radice offre «Ricarica la finestra». Ogni blocco
// finisce nel registro delle attività.
import { Component, createElement, Fragment, type ErrorInfo, type FunctionComponent, type ReactNode } from 'react'
import { AlertTriangle, Copy, RefreshCw, RotateCcw } from 'lucide-react'
import { t } from '../i18n'
import { logActivity } from './activity'

interface BoundaryProps {
  /** Nome del pannello, per il messaggio e il registro. */
  name: string
  children: ReactNode
  /** 'panel' = riapre il pannello; 'app' = ricarica la finestra. */
  scope?: 'panel' | 'app'
}

interface BoundaryState {
  error: Error | null
  componentStack: string
  attempt: number
}

function detailsOf(name: string, error: Error, componentStack: string): string {
  return [`${name}: ${error.message}`, error.stack ?? '', componentStack.trim()].filter(Boolean).join('\n\n')
}

export class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null, componentStack: '', attempt: 0 }

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const err = error instanceof Error ? error : new Error(String(error))
    const componentStack = info.componentStack ?? ''
    this.setState({ componentStack })
    console.error(error)
    try {
      logActivity('error', err.message, {
        title: this.props.scope === 'app' ? t('boundary.appTitle') : t('boundary.logged', { panel: this.props.name }),
        details: detailsOf(this.props.name, err, componentStack),
        source: this.props.name
      })
    } catch {
      /* il registro non deve mai far fallire la barriera */
    }
  }

  private reopen = () => this.setState((state) => ({ error: null, componentStack: '', attempt: state.attempt + 1 }))

  private copy = () => {
    const { error, componentStack } = this.state
    if (error) void navigator.clipboard?.writeText(detailsOf(this.props.name, error, componentStack)).catch(() => undefined)
  }

  render(): ReactNode {
    const { error, attempt } = this.state
    if (!error) return createElement(Fragment, { key: attempt }, this.props.children)
    const app = this.props.scope === 'app'
    return (
      <div className={`boundary${app ? ' boundary-app' : ''}`} role="alert" data-testid={app ? 'app-crashed' : 'panel-crashed'}>
        <AlertTriangle size={app ? 28 : 22} color="var(--danger)" />
        <strong>{app ? t('boundary.appTitle') : t('boundary.title')}</strong>
        <p>{app ? t('boundary.appText') : t('boundary.text')}</p>
        <pre>{error.message}</pre>
        <div className="boundary-actions">
          {app ? (
            <button className="btn primary" onClick={() => window.location.reload()} data-testid="boundary-reload">
              <RefreshCw size={14} /> {t('boundary.reload')}
            </button>
          ) : (
            <button className="btn primary" onClick={this.reopen} data-testid="boundary-reopen">
              <RotateCcw size={14} /> {t('boundary.reopen')}
            </button>
          )}
          <button className="btn" onClick={this.copy} data-testid="boundary-copy">
            <Copy size={14} /> {t('boundary.copy')}
          </button>
        </div>
      </div>
    )
  }
}

/** Avvolge il componente di un pannello dockview in una barriera (lo usa registerPanel). */
export function withPanelBoundary<P extends { api?: { title?: string } }>(id: string, Render: FunctionComponent<P>): FunctionComponent<P> {
  const Bounded: FunctionComponent<P> = (props) => (
    <ErrorBoundary name={props.api?.title ?? id}>
      <Render {...props} />
    </ErrorBoundary>
  )
  Bounded.displayName = `Panel(${id})`
  return Bounded
}
