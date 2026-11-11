// Pannello Terminale: più sessioni a schede (shell, esecuzioni, REPL).
import { useEffect, useRef } from 'react'
import { Plus, Square, Trash2, X, Eraser, TerminalSquare, Play, Braces } from 'lucide-react'
import { executeCommand } from '../../workbench/commands'
import { useWorkbench } from '../../workbench/store'
import { t } from '../../i18n'
import { applyTerminalOptions, clearTerminal, disposeSession, fitTerminal, focusTerminal, mountTerminal, useTerminals, type SessionView } from './terminals'
import { ide } from '../../ipc'

function SessionView({ session, visible }: { session: SessionView; visible: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (host.current) mountTerminal(session.id, host.current)
  }, [session.id])
  useEffect(() => {
    const element = host.current
    if (!element) return
    const observer = new ResizeObserver(() => fitTerminal(session.id))
    observer.observe(element)
    return () => observer.disconnect()
  }, [session.id])
  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => {
        fitTerminal(session.id)
        focusTerminal(session.id)
      })
    }
  }, [visible, session.id])
  return <div ref={host} className="terminal-host" style={{ display: visible ? 'block' : 'none' }} data-terminal-id={session.id} />
}

function iconFor(session: SessionView) {
  if (session.kind === 'run') return <Play size={12} />
  if (session.kind === 'repl') return <Braces size={12} />
  return <TerminalSquare size={12} />
}

export function TerminalPanel() {
  const sessions = useTerminals((s) => s.sessions)
  const active = useTerminals((s) => s.active)
  const setActive = useTerminals((s) => s.setActive)
  const theme = useWorkbench((s) => s.settings.theme)
  const fontSize = useWorkbench((s) => s.settings.fontSize)

  useEffect(() => applyTerminalOptions(theme, fontSize), [theme, fontSize])

  const current = sessions.find((s) => s.id === active)

  return (
    <div className="panel terminal-panel">
      <div className="panel-toolbar">
        <div className="terminal-tabs" role="tablist">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`terminal-tab${session.id === active ? ' active' : ''}${session.exitCode !== null ? ' exited' : ''}`}
              role="tab"
              aria-selected={session.id === active}
              onClick={() => setActive(session.id)}
              title={session.exitCode !== null ? t('terminal.exited', { code: session.exitCode }) : session.title}
            >
              {iconFor(session)}
              <span>{session.title}</span>
              {session.kind === 'run' && session.exitCode === null && <span className="running-dot" />}
              <button
                className="tab-close"
                title={t('terminal.close')}
                onClick={(e) => {
                  e.stopPropagation()
                  disposeSession(session.id)
                }}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <button className="icon-btn" title={t('terminal.new')} onClick={() => executeCommand('terminal.new')} data-testid="terminal-new">
          <Plus size={15} />
        </button>
        <button className="icon-btn" title={t('terminal.repl')} onClick={() => executeCommand('terminal.repl')}>
          <Braces size={14} />
        </button>
        <button className="icon-btn" title={t('terminal.clear')} disabled={!current} onClick={() => current && clearTerminal(current.id)}>
          <Eraser size={14} />
        </button>
        <button className="icon-btn" title={t('terminal.stop')} disabled={!current || current.exitCode !== null} onClick={() => current && ide.invoke('terminal:kill', current.id)}>
          <Square size={13} />
        </button>
        <button className="icon-btn" title={t('terminal.close')} disabled={!current} onClick={() => current && disposeSession(current.id)}>
          <Trash2 size={14} />
        </button>
      </div>
      <div className="terminal-body">
        {sessions.length === 0 && (
          <div className="empty-state">
            <div>
              <p>{t('terminal.empty')}</p>
              <button className="btn" onClick={() => executeCommand('terminal.new')}>
                <TerminalSquare size={14} /> {t('terminal.new')}
              </button>
            </div>
          </div>
        )}
        {sessions.map((session) => (
          <SessionView key={session.id} session={session} visible={session.id === active} />
        ))}
      </div>
    </div>
  )
}
