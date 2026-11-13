// Contesto della chat AI laterale: il documento aperto (testo o selezione con il suo intervallo) si
// cattura all'invio, così «Applica al documento» sa dove va il codice anche se nel frattempo l'utente
// cambia scheda o modifica il file. Logica pura, collaudata in tests/unit.
import type { EditorProblem, EditorRange } from '../contracts/editor'
import { offsetAt } from './suggest'

/** Quanto codice al massimo va nel prompt. */
export const CONTEXT_MAX_CHARS = 12000

/** Fotografia del documento al momento dell'invio. */
export interface ChatContextSnapshot {
  path: string
  language: string
  /** Testo intero del file all'invio (serve per capire se è cambiato prima di «Applica»). */
  text: string
  /** null: si lavora sul file intero. */
  selection: { text: string; range: EditorRange } | null
  /** Problemi del file allegati (vuoto se il chip «Problemi» è staccato). */
  problems: EditorProblem[]
}

/** Intervallo che copre tutto il testo. */
export function wholeFileRange(text: string): EditorRange {
  const lines = text.split('\n')
  return { startLine: 1, startColumn: 1, endLine: lines.length, endColumn: lines[lines.length - 1]!.length + 1 }
}

/**
 * Righe da mostrare per una selezione («selezione righe 3-10»): se la selezione finisce all'inizio di
 * una riga (colonna 1, come quando si selezionano righe intere) quella riga non conta.
 */
export function selectionLineSpan(range: EditorRange): { start: number; end: number } {
  const end = range.endColumn === 1 && range.endLine > range.startLine ? range.endLine - 1 : range.endLine
  return { start: range.startLine, end }
}

/** Riga e colonna (a base 1) di una posizione nel testo. */
export function positionAt(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, Math.max(0, Math.min(offset, text.length)))
  const lines = before.split('\n')
  return { line: lines.length, column: lines[lines.length - 1]!.length + 1 }
}

/** Testo compreso in un intervallo (righe/colonne a base 1). */
export function textInRange(text: string, range: EditorRange): string {
  return text.slice(offsetAt(text, range.startLine, range.startColumn), offsetAt(text, range.endLine, range.endColumn))
}

/**
 * Prompt da inviare: la domanda, poi il codice (selezione o file, tagliato a 12000 caratteri) con la
 * sua intestazione e, se allegati, i problemi del file.
 */
export function buildContextPrompt(question: string, snapshot: ChatContextSnapshot | null, labels: { header: string; problems: string }): string {
  if (!snapshot) return question
  const code = snapshot.selection?.text ?? snapshot.text
  const parts = [question, '', labels.header, `\`\`\`${snapshot.language}`, code.slice(0, CONTEXT_MAX_CHARS), '```']
  if (snapshot.problems.length) {
    parts.push('', labels.problems, ...snapshot.problems.slice(0, 20).map((p) => `- ${p.line}:${p.column} ${p.severity}: ${p.message}`))
  }
  return parts.join('\n')
}

/**
 * I blocchi di codice delle risposte non finiscono mai con un a capo: se il pezzo sostituito ne aveva
 * uno (righe intere selezionate, file intero) lo si conserva, così la riga dopo non si attacca.
 */
export function keepTrailingNewline(original: string, code: string): string {
  return original.endsWith('\n') && !code.endsWith('\n') ? `${code}\n` : code
}

/** Dove applicare il codice di una risposta e da quale testo parte il confronto. */
export interface ResolvedTarget {
  /**
   * - `same`: il file è com'era all'invio;
   * - `moved`: il file è cambiato ma il pezzo selezionato c'è ancora (una volta sola): intervallo aggiornato;
   * - `changed`: il file è cambiato e il pezzo non si ritrova: il confronto parte dal testo attuale.
   */
  status: 'same' | 'moved' | 'changed'
  range: EditorRange
  /** Testo attuale nell'intervallo (lato «prima» del confronto). */
  original: string
}

/** Intervallo di destinazione di «Applica» rispetto al testo attuale del file. */
export function resolveApplyTarget(snapshot: ChatContextSnapshot, currentText: string): ResolvedTarget {
  const selection = snapshot.selection
  if (currentText === snapshot.text) {
    return selection ? { status: 'same', range: selection.range, original: selection.text } : { status: 'same', range: wholeFileRange(currentText), original: currentText }
  }
  if (!selection) return { status: 'changed', range: wholeFileRange(currentText), original: currentText }
  const first = selection.text ? currentText.indexOf(selection.text) : -1
  if (first >= 0 && currentText.indexOf(selection.text, first + 1) < 0) {
    const start = positionAt(currentText, first)
    const end = positionAt(currentText, first + selection.text.length)
    return { status: 'moved', range: { startLine: start.line, startColumn: start.column, endLine: end.line, endColumn: end.column }, original: selection.text }
  }
  // Il pezzo non si ritrova: stesso intervallo, riportato dentro il testo attuale.
  const startOffset = offsetAt(currentText, selection.range.startLine, selection.range.startColumn)
  const endOffset = Math.max(startOffset, offsetAt(currentText, selection.range.endLine, selection.range.endColumn))
  const start = positionAt(currentText, startOffset)
  const end = positionAt(currentText, endOffset)
  return {
    status: 'changed',
    range: { startLine: start.line, startColumn: start.column, endLine: end.line, endColumn: end.column },
    original: currentText.slice(startOffset, endOffset)
  }
}
