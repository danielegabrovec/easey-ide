// Cronologia delle esecuzioni del Laboratorio: ascolta la Scrittura rapida (quick-store) e registra ogni «Esegui»
// fatto dall'utente (non le esecuzioni automatiche mentre scrive). Si ricorda tra i riavvii (localStorage).
import { create } from 'zustand'
import { addRun, parseHistory, previewOf, type RunRecord } from '@shared/quick/run-history'
import type { QuickLanguage } from '@shared/contracts/quick'
import { useQuick } from '../quick-code/quick-store'
import { t } from '../../i18n'

const STORAGE_KEY = 'easey.lab.history'

function load(): RunRecord[] {
  try {
    return parseHistory(localStorage.getItem(STORAGE_KEY))
  } catch {
    return []
  }
}

interface HistoryState {
  runs: RunRecord[]
  add: (record: RunRecord) => void
  clear: () => void
}

export const useRunHistory = create<HistoryState>((set) => ({
  runs: load(),
  add: (record) => set((state) => ({ runs: addRun(state.runs, record) })),
  clear: () => set({ runs: [] })
}))

useRunHistory.subscribe((state, previous) => {
  if (state.runs === previous.runs) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.runs))
  } catch {
    /* archiviazione non disponibile: la cronologia vale per questa sessione */
  }
})

let counter = 0
const newId = () => `${Date.now().toString(36)}-${++counter}`

/** Collega la cronologia alla Scrittura rapida (una volta, all'avvio del modulo). */
export function installHistoryRecorder(): void {
  // Codice e linguaggio presi quando parte l'esecuzione (poi si può continuare a scrivere).
  let pending: { runId: string; language: QuickLanguage; code: string } | null = null
  useQuick.subscribe((state, previous) => {
    if (state.runId !== previous.runId) {
      pending = state.runId && !state.runAuto ? { runId: state.runId, language: state.language, code: state.docs[state.language].content } : null
    }
    if (pending && state.runId === pending.runId && state.summary && !previous.summary) {
      const first = state.events.find((e) => e.kind === 'error' || e.kind === 'log')
      const text = first?.kind === 'error' ? first.message : first?.kind === 'log' ? first.text : ''
      useRunHistory.getState().add({
        id: newId(),
        at: Date.now(),
        language: pending.language,
        code: pending.code,
        outcome: state.summary.status,
        durationMs: Math.round(state.summary.durationMs),
        preview: previewOf(text)
      })
      pending = null
    }
    // SQL: un'esecuzione = un nuovo `sql` non automatico.
    if (state.sql && state.sql !== previous.sql && !state.sql.auto) {
      const error = state.sql.outcomes.find((o) => o.kind === 'error')
      const last = [...state.sql.outcomes].reverse().find((o) => o.kind === 'result')
      const preview = error && error.kind === 'error' ? error.message : last && last.kind === 'result' ? t('lab.rows', { n: last.rows.length }) : ''
      useRunHistory.getState().add({
        id: newId(),
        at: Date.now(),
        language: 'sql',
        code: state.docs.sql.content,
        outcome: error ? 'error' : 'ok',
        durationMs: Math.round(state.sql.durationMs),
        preview: previewOf(preview)
      })
    }
  })
}
