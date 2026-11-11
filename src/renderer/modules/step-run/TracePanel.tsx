// Pannello "Passo passo": scorre i passi registrati, evidenzia la riga nell'editor, mostra la pila
// delle chiamate con le variabili (quelle appena cambiate sono evidenziate) e l'output fino a quel punto.
import { useEffect, useRef } from 'react'
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Footprints, RotateCw } from 'lucide-react'
import { create } from 'zustand'
import type { TraceFrame, TraceResult } from '@shared/contracts/trace'
import { executeCommand } from '../../workbench/commands'
import { t } from '../../i18n'

interface TraceState {
  result: TraceResult | null
  index: number
  running: boolean
  set: (patch: Partial<Pick<TraceState, 'result' | 'index' | 'running'>>) => void
}

export const useTrace = create<TraceState>((set) => ({
  result: null,
  index: 0,
  running: false,
  set: (patch) => set(patch)
}))

export function goTo(index: number): void {
  const { result } = useTrace.getState()
  if (!result || result.steps.length === 0) return
  const next = Math.max(0, Math.min(result.steps.length - 1, index))
  useTrace.getState().set({ index: next })
  void executeCommand('editor.highlightLine', { path: result.path, line: result.steps[next]!.line })
}

function Frame({ frame, previous, current }: { frame: TraceFrame; previous: TraceFrame | undefined; current: boolean }) {
  const before = new Map(previous?.vars ?? [])
  return (
    <div className={`trace-frame ${current ? 'current' : ''}`} data-frame={frame.name}>
      <div className="trace-frame-title">
        <strong>{frame.name === 'Globale' ? t('trace.global') : `${frame.name}()`}</strong>
        {frame.line > 0 && <span className="hint">{t('trace.line', { line: frame.line })}</span>}
      </div>
      {frame.vars.length === 0 ? (
        <div className="hint trace-empty">{t('trace.noVars')}</div>
      ) : (
        <table>
          <tbody>
            {frame.vars.map(([name, value]) => {
              const changed = previous !== undefined && before.get(name) !== value
              return (
                <tr key={name} className={changed ? 'changed' : undefined} data-var={name}>
                  <td className="trace-name">{name}</td>
                  <td className="trace-value">{value}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function TracePanel() {
  const result = useTrace((s) => s.result)
  const index = useTrace((s) => s.index)
  const running = useTrace((s) => s.running)
  const outputRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [index])
  // Chiudendo il pannello l'evidenziazione sparisce.
  useEffect(() => () => void executeCommand('editor.highlightLine', { path: '', line: null }), [])

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') goTo(index + 1)
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') goTo(index - 1)
    else if (event.key === 'Home') goTo(0)
    else if (event.key === 'End') goTo(Number.MAX_SAFE_INTEGER)
    else return
    event.preventDefault()
  }

  if (!result) return <div className="panel trace-panel empty-state hint">{running ? t('trace.running') : t('trace.empty')}</div>
  const steps = result.steps
  const step = steps[index]
  const previous = index > 0 ? steps[index - 1] : undefined
  const atEnd = index === steps.length - 1
  const frames = step ? [...step.frames].reverse() : []
  const prevFrames = previous ? new Map(previous.frames.map((f, i) => [`${i}:${f.name}`, f])) : new Map<string, TraceFrame>()
  const output = step ? result.output.slice(0, atEnd ? result.output.length : step.output) : result.output

  return (
    <div className="panel trace-panel" tabIndex={0} onKeyDown={onKey} data-testid="trace-panel">
      <div className="trace-toolbar">
        <Footprints size={15} />
        <strong>{result.path}</strong>
        <button className="icon-btn" onClick={() => goTo(0)} disabled={index === 0} title={t('trace.first')}>
          <ChevronFirst size={16} />
        </button>
        <button className="icon-btn" onClick={() => goTo(index - 1)} disabled={index === 0} title={`${t('trace.prev')} (←)`} data-testid="trace-prev">
          <ChevronLeft size={16} />
        </button>
        <button className="icon-btn" onClick={() => goTo(index + 1)} disabled={atEnd} title={`${t('trace.next')} (→)`} data-testid="trace-next">
          <ChevronRight size={16} />
        </button>
        <button className="icon-btn" onClick={() => goTo(steps.length - 1)} disabled={atEnd} title={t('trace.last')} data-testid="trace-last">
          <ChevronLast size={16} />
        </button>
        <input type="range" min={0} max={Math.max(0, steps.length - 1)} value={index} onChange={(e) => goTo(Number(e.target.value))} aria-label={t('trace.slider')} />
        <span className="trace-counter" data-testid="trace-counter">
          {steps.length ? t('trace.counter', { n: index + 1, total: steps.length, line: step?.line ?? '—' }) : t('trace.noSteps')}
        </span>
        <button className="btn ghost" onClick={() => executeCommand('trace.run', { path: result.path })} title={t('trace.rerun')}>
          <RotateCw size={14} /> {t('trace.rerun')}
        </button>
      </div>
      <div className="trace-body">
        <div className="trace-stack">
          <div className="trace-section">{t('trace.stack')}</div>
          {frames.map((frame, i) => {
            const depth = frames.length - 1 - i
            return <Frame key={`${depth}:${frame.name}`} frame={frame} previous={prevFrames.get(`${depth}:${frame.name}`)} current={i === 0} />
          })}
          {result.truncated && atEnd && <div className="trace-note warn">{t('trace.truncated', { n: steps.length })}</div>}
          {result.error && atEnd && (
            <div className="trace-note error" data-testid="trace-error">
              {result.error.line ? t('trace.errorAt', { line: result.error.line }) : ''} {result.error.message}
            </div>
          )}
        </div>
        <div className="trace-output">
          <div className="trace-section">{t('trace.output')}</div>
          <pre ref={outputRef} data-testid="trace-output">{output.join('\n')}</pre>
        </div>
      </div>
    </div>
  )
}
