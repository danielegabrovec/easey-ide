// Cronologia delle esecuzioni del Laboratorio (1.6, come la Cronologia delle query di Easey DB): ogni «Esegui» della
// Scrittura rapida (non le esecuzioni automatiche mentre si scrive) con linguaggio, codice, esito, durata e la prima
// riga dell'output. Puro: la lista si salva nel renderer.
import type { QuickLanguage } from '../contracts/quick'

export type RunOutcome = 'ok' | 'error' | 'timeout' | 'stopped'

export interface RunRecord {
  id: string
  /** Quando è finita (ms dal 1970). */
  at: number
  language: QuickLanguage
  code: string
  outcome: RunOutcome
  durationMs: number
  /** Prima riga dell'output (o dell'errore), già accorciata. */
  preview: string
}

export const HISTORY_MAX = 50
const PREVIEW_MAX = 80

/** Prima riga non vuota, accorciata con «…». */
export function previewOf(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim() !== '')?.trim() ?? ''
  return line.length > PREVIEW_MAX ? `${line.slice(0, PREVIEW_MAX - 1)}…` : line
}

/**
 * Aggiunge un'esecuzione in cima. Se è lo stesso codice nello stesso linguaggio dell'ultima, la sostituisce
 * (rieseguire tre volte di fila non fa tre righe uguali). Al massimo `max` righe.
 */
export function addRun(list: RunRecord[], record: RunRecord, max = HISTORY_MAX): RunRecord[] {
  const [last, ...rest] = list
  const base = last && last.language === record.language && last.code === record.code ? rest : list
  return [record, ...base].slice(0, max)
}

/** Lista letta da localStorage: solo le righe ben fatte, al massimo `max`. */
export function parseHistory(raw: string | null, max = HISTORY_MAX): RunRecord[] {
  if (!raw) return []
  try {
    const value = JSON.parse(raw) as unknown
    if (!Array.isArray(value)) return []
    return value
      .filter((r): r is RunRecord => !!r && typeof r === 'object' && typeof r.id === 'string' && typeof r.code === 'string' && typeof r.language === 'string' && typeof r.at === 'number')
      .slice(0, max)
  } catch {
    return []
  }
}
