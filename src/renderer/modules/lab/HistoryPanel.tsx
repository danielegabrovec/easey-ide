// Pannello «Esecuzioni» del Laboratorio (a destra, sopra l'assistente AI): le ultime esecuzioni della Scrittura
// rapida. Clic = il codice torna nell'editor; doppio clic = torna e si esegue; ✓/✕ dice com'è andata.
import { CheckCircle2, CircleSlash, History, Play, Timer, Trash2, XCircle } from 'lucide-react'
import { QUICK_LANGUAGE_INFO } from '@shared/contracts/quick'
import type { RunRecord } from '@shared/quick/run-history'
import { executeCommand } from '../../workbench/commands'
import { t } from '../../i18n'
import { useRunHistory } from './history-store'

function when(at: number): string {
  const date = new Date(at)
  const today = new Date()
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return date.toDateString() === today.toDateString() ? time : `${date.toLocaleDateString()} ${time}`
}

function OutcomeIcon({ record }: { record: RunRecord }) {
  if (record.outcome === 'ok') return <CheckCircle2 size={13} className="lab-run-ok" aria-label={t('lab.outcomeOk')} />
  if (record.outcome === 'timeout') return <Timer size={13} className="lab-run-error" aria-label={t('lab.outcomeTimeout')} />
  if (record.outcome === 'stopped') return <CircleSlash size={13} className="lab-run-muted" aria-label={t('lab.outcomeStopped')} />
  return <XCircle size={13} className="lab-run-error" aria-label={t('lab.outcomeError')} />
}

export function HistoryPanel() {
  const runs = useRunHistory((s) => s.runs)
  const clear = useRunHistory((s) => s.clear)
  const back = (record: RunRecord, run: boolean) => void executeCommand('quick.insertCode', { code: record.code, language: record.language, run })
  return (
    <div className="panel lab-history" data-testid="lab-history">
      <div className="panel-toolbar">
        <History size={14} />
        <span className="title" style={{ flex: 1 }}>
          {t('lab.historyTitle')}
        </span>
        <button className="icon-btn" title={t('lab.historyClear')} onClick={clear} disabled={runs.length === 0} data-testid="lab-history-clear">
          <Trash2 size={14} />
        </button>
      </div>
      <div className="panel-body">
        {runs.length === 0 ? (
          <p className="hint lab-history-empty">{t('lab.historyEmpty')}</p>
        ) : (
          <ul className="lab-runs">
            {runs.map((record) => (
              <li key={record.id}>
                <button
                  className="lab-run"
                  title={`${t('lab.historyHint')}\n\n${record.code.slice(0, 400)}`}
                  onClick={() => back(record, false)}
                  onDoubleClick={() => back(record, true)}
                  data-testid="lab-run"
                  data-outcome={record.outcome}
                >
                  <span className="lab-run-head">
                    <OutcomeIcon record={record} />
                    <span className="lab-run-lang">{QUICK_LANGUAGE_INFO[record.language]?.short ?? record.language}</span>
                    <span className="lab-run-when">{when(record.at)}</span>
                    <span className="lab-run-time">{t('lab.duration', { ms: record.durationMs })}</span>
                  </span>
                  <code className="lab-run-code">{record.code.trim().split('\n').find((l) => l.trim() && !/^\s*(\/\/|#|--|<!--)/.test(l))?.trim() ?? record.code.trim().split('\n')[0]}</code>
                  {record.preview && <span className="lab-run-preview">{record.preview}</span>}
                </button>
                <button className="icon-btn lab-run-again" title={t('lab.runAgain')} aria-label={t('lab.runAgain')} onClick={() => back(record, true)}>
                  <Play size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
