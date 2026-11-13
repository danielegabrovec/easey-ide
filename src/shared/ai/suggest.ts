// «Chiedi suggerimento»: l'utente scrive cosa gli serve e l'AI locale propone il codice per un punto
// preciso del file. Qui solo logica pura (prompt e applicazione al testo), collaudata in tests/unit.
// L'interfaccia sta in src/renderer/modules/ai-assist/SuggestDialog.tsx.
import type { EditorRange } from '../contracts/editor'

/**
 * Dove va il suggerimento:
 * - `cursor`: codice nuovo da inserire al cursore (completa una riga o aggiunge righe);
 * - `selection`: le righe selezionate vengono riscritte;
 * - `file`: tutto il file viene riscritto.
 */
export type SuggestScope = 'cursor' | 'selection' | 'file'

export const CURSOR_MARK = '⟦QUI⟧'

export interface SuggestInput {
  request: string
  scope: SuggestScope
  language: string
  path: string
  text: string
  /** Riga e colonna a base 1. */
  cursor: { line: number; column: number }
  selection: EditorRange | null
  /** Contesto in più (es. schema del database per i file SQL), già pronto come testo. */
  context?: string
}

/** Posizione (0-based) nel testo di una riga/colonna a base 1. */
export function offsetAt(text: string, line: number, column: number): number {
  const lines = text.split('\n')
  // Oltre l'ultima riga si va alla fine del testo.
  if (line > lines.length) return text.length
  const row = Math.max(line, 1)
  let offset = 0
  for (let i = 0; i < row - 1; i++) offset += lines[i]!.length + 1
  return offset + Math.min(Math.max(column - 1, 0), lines[row - 1]!.length)
}

/** Ambito proposto all'apertura: la selezione se c'è, altrimenti il cursore. */
export function defaultScope(selection: EditorRange | null): SuggestScope {
  return selection ? 'selection' : 'cursor'
}

const SCOPE_RULE: Record<SuggestScope, string> = {
  cursor: `Scrivi SOLO il codice da inserire nel punto segnato con ${CURSOR_MARK} (può essere il resto di una riga o più righe). Non ripetere il codice che c'è già prima o dopo.`,
  selection: 'Riscrivi SOLO il pezzo indicato come «DA RISCRIVERE»: restituisci la sua nuova versione completa, che lo sostituirà.',
  file: 'Restituisci il file intero, completo e aggiornato.'
}

/** Messaggi per la chat del modello: sistema + richiesta con il codice e il punto preciso. */
export function buildSuggestMessages(input: SuggestInput, systemPrompt: string): { role: 'system' | 'user'; content: string }[] {
  const fence = (body: string) => `\`\`\`${input.language}\n${body}\n\`\`\``
  const parts = [`Richiesta: ${input.request.trim()}`, '', `File: ${input.path} (linguaggio: ${input.language})`]
  if (input.context?.trim()) parts.push('', 'Contesto:', input.context.trim())
  if (input.scope === 'cursor') {
    const at = offsetAt(input.text, input.cursor.line, input.cursor.column)
    parts.push('', 'Codice del file, con il punto di inserimento:', fence(input.text.slice(0, at) + CURSOR_MARK + input.text.slice(at)))
  } else if (input.scope === 'selection' && input.selection) {
    const start = offsetAt(input.text, input.selection.startLine, input.selection.startColumn)
    const end = offsetAt(input.text, input.selection.endLine, input.selection.endColumn)
    parts.push('', 'Codice del file:', fence(input.text), '', `DA RISCRIVERE (righe ${input.selection.startLine}-${input.selection.endLine}):`, fence(input.text.slice(start, end)))
  } else {
    parts.push('', 'Codice del file:', fence(input.text))
  }
  parts.push('', SCOPE_RULE[input.scope], 'Rispondi con un solo blocco di codice ``` e, sotto, al massimo due righe di spiegazione.')
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: parts.join('\n') }
  ]
}

/** Primo blocco di codice della risposta (o il testo intero), senza il segnaposto se il modello l'ha ricopiato. */
export function codeFromAnswer(answer: string): string {
  const match = /```[\w+#.-]*[^\n]*\n([\s\S]*?)```/.exec(answer)
  const code = match ? match[1]! : answer
  return code.replace(CURSOR_MARK, '').replace(/\s+$/, '')
}

/** Testo del file dopo il suggerimento (per il confronto prima/dopo e per applicarlo). */
export function applySuggestion(input: Pick<SuggestInput, 'scope' | 'text' | 'cursor' | 'selection'>, code: string): string {
  if (input.scope === 'file') return input.text.endsWith('\n') && !code.endsWith('\n') ? code + '\n' : code
  if (input.scope === 'selection' && input.selection) {
    const start = offsetAt(input.text, input.selection.startLine, input.selection.startColumn)
    const end = offsetAt(input.text, input.selection.endLine, input.selection.endColumn)
    return input.text.slice(0, start) + code + input.text.slice(end)
  }
  const at = offsetAt(input.text, input.cursor.line, input.cursor.column)
  return input.text.slice(0, at) + code + input.text.slice(at)
}
