// Console dell'anteprima: log, avvisi, errori (con riga del sorgente) e riga di comando.
import { useEffect, useRef, useState } from 'react'
import { AlertCircle, AlertTriangle, Ban, ChevronRight, Info } from 'lucide-react'
import { executeCommand } from '../../workbench/commands'
import { t } from '../../i18n'
import { useConsole, type ConsoleEntry } from './console-store'
import { evaluateInPreview, usePreview } from './preview-state'
import { TableView, ValueView } from './ValueView'

function EntryIcon({ kind }: { kind: ConsoleEntry['kind'] }) {
  if (kind === 'error') return <AlertCircle size={13} color="var(--danger)" />
  if (kind === 'warn') return <AlertTriangle size={13} color="var(--warning)" />
  if (kind === 'info') return <Info size={13} color="var(--info)" />
  if (kind === 'input') return <ChevronRight size={13} color="var(--accent-strong)" />
  if (kind === 'result') return <span style={{ color: 'var(--text-faint)', width: 13, textAlign: 'center' }}>←</span>
  return <span style={{ width: 13 }} />
}

function matches(entry: ConsoleEntry, filter: string): boolean {
  if (filter === 'all') return true
  if (filter === 'error') return entry.kind === 'error'
  if (filter === 'warn') return entry.kind === 'warn'
  return entry.kind !== 'error' && entry.kind !== 'warn'
}

export function ConsolePanel() {
  const entries = useConsole((s) => s.entries)
  const clear = useConsole((s) => s.clear)
  const add = useConsole((s) => s.add)
  const filter = usePreview((s) => s.filter)
  const setFilter = usePreview((s) => s.setFilter)
  const clearOnRun = usePreview((s) => s.clearOnRun)
  const setClearOnRun = usePreview((s) => s.setClearOnRun)
  const hasPreview = usePreview((s) => s.url !== null)
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  useEffect(() => {
    const list = listRef.current
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight
  }, [entries])

  const errors = entries.filter((e) => e.kind === 'error').length
  const warnings = entries.filter((e) => e.kind === 'warn').length
  const visible = entries.filter((e) => matches(e, filter))

  const submit = () => {
    const code = input.trim()
    if (!code) return
    add({ kind: 'input', args: [{ t: 'string', v: code }], group: 0 })
    if (!evaluateInPreview(code)) add({ kind: 'system', args: [{ t: 'string', v: t('console.noPreview') }], group: 0 })
    setHistory((h) => [code, ...h.filter((x) => x !== code)].slice(0, 50))
    setHistoryIndex(-1)
    setInput('')
  }

  return (
    <div className="panel console-panel">
      <div className="panel-toolbar">
        <button className="icon-btn" title={t('console.clear')} onClick={clear} data-testid="console-clear">
          <Ban size={14} />
        </button>
        <div className="segmented" role="tablist">
          {(['all', 'error', 'warn', 'log'] as const).map((value) => (
            <button key={value} className={filter === value ? 'active' : undefined} onClick={() => setFilter(value)} role="tab" aria-selected={filter === value}>
              {value === 'all' ? t('console.all') : value === 'error' ? `${t('console.errors')} ${errors || ''}` : value === 'warn' ? `${t('console.warnings')} ${warnings || ''}` : t('console.logs')}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <label className="hint" style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <input type="checkbox" checked={clearOnRun} onChange={(e) => setClearOnRun(e.target.checked)} />
          {t('console.clearOnRun')}
        </label>
      </div>
      <div
        className="panel-body console-list"
        ref={listRef}
        data-testid="console-list"
        onScroll={(e) => {
          const el = e.currentTarget
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
        }}
      >
        {visible.length === 0 && <div className="console-empty hint">{t('console.empty')}</div>}
        {visible.map((entry) => (
          <div key={entry.id} className={`console-entry ${entry.kind}`} style={{ paddingLeft: 8 + entry.group * 16 }} data-kind={entry.kind}>
            <EntryIcon kind={entry.kind} />
            {entry.repeat > 1 && <span className="repeat">{entry.repeat}</span>}
            <div className="console-args">
              {entry.kind === 'table' && entry.args[0] ? (
                <TableView value={entry.args[0]} />
              ) : (
                entry.args.map((arg, index) => (
                  <span key={index} className="console-arg">
                    <ValueView value={arg} topLevel />
                  </span>
                ))
              )}
            </div>
            {entry.location && (
              <button
                className="console-location"
                title={t('console.goTo')}
                onClick={() => executeCommand('editor.reveal', { path: entry.location!.path, line: entry.location!.line, column: entry.location!.column })}
              >
                {entry.location.path}:{entry.location.line}
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="console-input">
        <ChevronRight size={14} color="var(--accent-strong)" />
        <input
          value={input}
          disabled={!hasPreview}
          placeholder={hasPreview ? t('console.inputPlaceholder') : t('console.noPreview')}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          data-testid="console-input"
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            else if (e.key === 'ArrowUp' && history.length) {
              e.preventDefault()
              const next = Math.min(history.length - 1, historyIndex + 1)
              setHistoryIndex(next)
              setInput(history[next] ?? '')
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              const next = historyIndex - 1
              setHistoryIndex(Math.max(-1, next))
              setInput(next >= 0 ? (history[next] ?? '') : '')
            }
          }}
        />
      </div>
    </div>
  )
}
