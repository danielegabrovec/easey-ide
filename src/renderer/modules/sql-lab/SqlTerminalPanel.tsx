// Pannello del terminale SQL: xterm collegato alla sessione SqlTerminalSession sulla connessione attiva.
import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useWorkbench, workbench } from '../../workbench/store'
import { t } from '../../i18n'
import { SqlTerminalSession } from './sql-terminal'
import { activeConnection, useSql } from './sql-store'

export function SqlTerminalPanel() {
  const host = useRef<HTMLDivElement>(null)
  const activeId = useSql((s) => s.activeId)
  const theme = useWorkbench((s) => s.settings.theme)

  useEffect(() => {
    const element = host.current
    if (!element) return
    const dark = workbench().settings.theme === 'dark'
    const terminal = new Terminal({
      fontFamily: "'Cascadia Mono', 'Cascadia Code', Consolas, monospace",
      fontSize: Math.max(11, workbench().settings.fontSize - 1),
      cursorBlink: true,
      theme: dark ? { background: '#12141a', foreground: '#e3e6ed', cursor: '#8692ff' } : { background: '#ffffff', foreground: '#1d2230', cursor: '#4f5bea', selectionBackground: '#4f5bea33' }
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(element)
    const session = new SqlTerminalSession(
      {
        dialect: () => activeConnection()?.engine ?? 'sqlite',
        name: () => activeConnection()?.name ?? 'memoria',
        execute: (sql) => useSql.getState().run(sql, activeId),
        schema: () => useSql.getState().loadSchema(activeId)
      },
      (text) => terminal.write(text)
    )
    session.start()
    const sub = terminal.onData((data) => void session.input(data))
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown' && event.ctrlKey && event.key.toLowerCase() === 'c' && terminal.hasSelection()) {
        void navigator.clipboard.writeText(terminal.getSelection())
        return false
      }
      return true
    })
    const observer = new ResizeObserver(() => {
      if (element.clientWidth > 0 && element.clientHeight > 0) fit.fit()
    })
    observer.observe(element)
    requestAnimationFrame(() => {
      fit.fit()
      terminal.focus()
    })
    return () => {
      observer.disconnect()
      sub.dispose()
      terminal.dispose()
    }
  }, [activeId, theme])

  return (
    <div className="panel">
      <div className="panel-toolbar">
        <span className="title">{t('sql.terminalTitle', { name: activeConnection()?.name ?? '' })}</span>
      </div>
      <div className="terminal-body">
        <div ref={host} className="terminal-host" data-testid="sql-terminal" />
      </div>
    </div>
  )
}
