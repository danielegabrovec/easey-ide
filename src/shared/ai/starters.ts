// Suggerimenti d'avvio della chat AI presi dal lavoro aperto (come `starterPrompts(schema)` di Easey DB):
// con un file Python aperto si propongono domande su Python, con errori nei Problemi «perché dà errore?»,
// con righe selezionate «spiegami queste righe». Logica pura: il renderer traduce le chiavi.

export type StarterTopic = 'html' | 'css' | 'javascript' | 'typescript' | 'python' | 'c' | 'cpp' | 'csharp' | 'java' | 'rust' | 'sql' | 'start'

const BY_EXTENSION: Record<string, StarterTopic> = {
  html: 'html', htm: 'html',
  css: 'css', scss: 'css', less: 'css',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript',
  py: 'python',
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  cs: 'csharp',
  java: 'java',
  rs: 'rust',
  sql: 'sql'
}

/** Argomento dei suggerimenti per un file (o per un linguaggio della Scrittura rapida). */
export function starterTopic(fileOrLanguage: string | null | undefined): StarterTopic {
  if (!fileOrLanguage) return 'start'
  const lower = fileOrLanguage.toLowerCase()
  const extension = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : lower
  return BY_EXTENSION[extension] ?? (Object.values(BY_EXTENSION).includes(lower as StarterTopic) ? (lower as StarterTopic) : 'start')
}

export type StarterContext = 'errors' | 'selection' | 'file'

export interface StarterPlan {
  /** Suggerimenti legati alla situazione, prima di quelli dell'argomento (al massimo uno). */
  context: { kind: StarterContext; file?: string; count?: number } | null
  topic: StarterTopic
}

/**
 * Cosa proporre: con errori nel file la domanda sull'errore, con una selezione la spiegazione delle righe,
 * con un file aperto «cosa fa questo file», poi le domande sul linguaggio.
 */
export function planStarters(input: { file: string | null; errors: number; selection: boolean }): StarterPlan {
  const topic = starterTopic(input.file)
  const name = input.file ? input.file.slice(input.file.lastIndexOf('/') + 1) : undefined
  if (input.errors > 0) return { context: { kind: 'errors', count: input.errors, file: name }, topic }
  if (input.selection && input.file) return { context: { kind: 'selection', file: name }, topic }
  if (input.file && topic !== 'start') return { context: { kind: 'file', file: name }, topic }
  return { context: null, topic }
}

/** Le domande di un argomento, da un testo tradotto con le voci separate da «|». */
export function splitStarters(text: string): string[] {
  return text
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)
}
