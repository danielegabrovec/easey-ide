// Esecuzione passo-passo di un file JS/TS: ogni passo è una riga eseguita con la pila delle chiamate
// e le variabili visibili in quel momento (anteprime testuali dei valori).

export interface TraceFrame {
  /** "Globale" per il programma, altrimenti il nome della funzione. */
  name: string
  /** Riga corrente in questa chiamata. */
  line: number
  vars: [name: string, preview: string][]
}

export interface TraceStep {
  line: number
  /** frames[0] = globale, l'ultimo = chiamata in corso. */
  frames: TraceFrame[]
  /** Quante righe di output esistono a questo passo. */
  output: number
}

export interface TraceResult {
  path: string
  steps: TraceStep[]
  output: string[]
  error?: { message: string; line?: number }
  /** true se il programma ha superato il numero massimo di passi. */
  truncated: boolean
}

export const MAX_TRACE_STEPS = 3000
