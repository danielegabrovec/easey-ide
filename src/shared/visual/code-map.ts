// Mappa elemento grafico ↔ righe del codice generato (blocchi e nodi), per la vista affiancata
// grafica ↔ codice. Il codice «con i passi» contiene una riga `__labStep("id");` prima di ogni
// istruzione: togliendo quelle righe (e la funzione di servizio) si ottiene il codice pulito che si
// mostra al principiante, e si sa a quali righe corrisponde ogni nodo o blocco. Logica pura.
import { STEP_HELPER } from './program'

export interface LineRange {
  /** Righe del codice pulito, da 1. */
  startLine: number
  endLine: number
}

export interface CodeMap {
  /** Codice senza i segnali dei passi (quello da mostrare). */
  clean: string
  ranges: Record<string, LineRange>
}

const STEP_LINE = /^\s*__labStep\((["'])(.*?)\1\);\s*$/

/**
 * `headerIds`: nodi «intestazione» (eventi, avvio, timer) il cui segnale sta subito DENTRO il blocco
 * che aprono: per loro conta la riga precedente (`…addEventListener(…, () => {`).
 */
export function mapSteps(code: string, headerIds: ReadonlySet<string> = new Set()): CodeMap {
  const helper = STEP_HELPER.trimEnd()
  let text = code
  const at = text.indexOf(helper)
  // La funzione di servizio e la riga vuota che la separa dal resto.
  if (at >= 0) text = text.slice(0, at) + text.slice(at + helper.length).replace(/^\n\n/, '')
  const out: string[] = []
  const ranges: Record<string, LineRange> = {}
  const pending: string[] = []
  for (const line of text.split('\n')) {
    const step = STEP_LINE.exec(line)
    if (step) {
      const id = step[2]!
      if (headerIds.has(id) && out.length) ranges[id] ??= { startLine: out.length, endLine: out.length }
      else pending.push(id)
      continue
    }
    out.push(line)
    for (const id of pending.splice(0)) ranges[id] ??= { startLine: out.length, endLine: out.length }
  }
  return { clean: out.join('\n'), ranges }
}

/** Elemento grafico che corrisponde a una riga del codice pulito (l'ultimo che inizia lì o prima, nella stessa riga). */
export function idAtLine(ranges: Record<string, LineRange>, line: number): string | null {
  let best: { id: string; range: LineRange } | null = null
  for (const [id, range] of Object.entries(ranges)) {
    if (line < range.startLine || line > range.endLine) continue
    if (!best || range.startLine >= best.range.startLine) best = { id, range }
  }
  return best?.id ?? null
}
