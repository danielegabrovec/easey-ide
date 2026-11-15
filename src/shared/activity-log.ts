// Registro delle attività: le ultime notifiche (avvisi, errori, pannelli bloccati) con l'ora, perché
// un errore non sparisca mai. Codice puro: il registro in memoria è in src/renderer/workbench/activity.ts.

export type ActivityKind = 'info' | 'success' | 'warning' | 'error'

export interface ActivityEntry {
  id: number
  /** Millisecondi dall'epoca (Date.now()). */
  at: number
  kind: ActivityKind
  /** Prima riga in evidenza (es. il titolo dell'errore spiegato). */
  title?: string
  message: string
  /** Testo lungo: spiegazione, passi, messaggio originale, istruzione. */
  details?: string
  /** Chi l'ha prodotta (es. «SQL», «Pannello Database»). */
  source?: string
}

export const ACTIVITY_LIMIT = 200

/** Aggiunge in coda tenendo al massimo `limit` voci (le più vecchie escono). Non modifica l'elenco ricevuto. */
export function appendBounded<T>(list: readonly T[], item: T, limit = ACTIVITY_LIMIT): T[] {
  if (limit <= 0) return []
  const next = list.length >= limit ? list.slice(list.length - limit + 1) : list.slice()
  next.push(item)
  return next
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Ora locale «AAAA-MM-GG HH:MM:SS». */
export function formatActivityTime(at: number): string {
  const d = new Date(at)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const LABEL: Record<ActivityKind, string> = { info: 'INFO', success: 'OK', warning: 'AVVISO', error: 'ERRORE' }

/** Una voce come testo da copiare. */
export function activityEntryText(entry: ActivityEntry): string {
  const head = `[${formatActivityTime(entry.at)}] ${LABEL[entry.kind]}${entry.source ? ` · ${entry.source}` : ''}`
  const lines = [head]
  if (entry.title && entry.title !== entry.message) lines.push(entry.title)
  lines.push(entry.message)
  if (entry.details && entry.details !== entry.message) lines.push(entry.details)
  return lines.join('\n')
}

/** Tutto il registro come testo, dalla più recente. */
export function activityText(entries: readonly ActivityEntry[]): string {
  return [...entries].reverse().map(activityEntryText).join('\n\n')
}
