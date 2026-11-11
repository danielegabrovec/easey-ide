// Contratto dei comandi dell'editor usati da altri moduli (AI, didattica, designer…).

export interface EditorRange {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

export interface EditorProblem {
  line: number
  column: number
  message: string
  severity: 'error' | 'warning' | 'info'
}

/** Risultato del comando `editor.getContext`. */
export interface EditorContext {
  path: string
  language: string
  text: string
  /** null se non c'è testo selezionato. */
  selection: { text: string; range: EditorRange } | null
  cursor: { line: number; column: number }
  problems: EditorProblem[]
}

/** Argomenti di `editor.replaceRange`. */
export interface ReplaceRangeArgs {
  path: string
  range: EditorRange
  text: string
}
