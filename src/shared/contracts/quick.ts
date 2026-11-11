// Contratto della "Scrittura rapida": codice JavaScript, TypeScript o SQL scritto al volo, eseguito
// subito e salvato come file nella raccolta personale, senza creare né aprire un progetto.

/**
 * Linguaggi della Scrittura rapida. JS e TS girano in un worker di Node, Python in Pyodide (Python
 * compilato in WebAssembly: nessuna installazione), SQL in un database in memoria, HTML (con CSS e
 * JS dentro la pagina) nell'anteprima `ide-preview://quick/`.
 */
export type QuickLanguage = 'javascript' | 'typescript' | 'python' | 'sql' | 'html'
export type QuickCodeLanguage = 'javascript' | 'typescript' | 'python'
export type QuickSqlEngine = 'sqlite' | 'postgres'

export const QUICK_LANGUAGES: QuickLanguage[] = ['javascript', 'typescript', 'python', 'sql', 'html']

/** Quanto aiuta l'editor mentre si scrive (vedi ASSIST_LEVELS). */
export type AssistLevel = 'off' | 'light' | 'medium' | 'strong'

export const QUICK_EXTENSIONS: Record<QuickLanguage, string> = { javascript: 'js', typescript: 'ts', python: 'py', sql: 'sql', html: 'html' }

export function quickLanguageOf(fileName: string): QuickLanguage | null {
  const extension = /\.([^.]+)$/.exec(fileName)?.[1]?.toLowerCase()
  if (extension === 'js' || extension === 'mjs') return 'javascript'
  if (extension === 'ts' || extension === 'mts') return 'typescript'
  if (extension === 'py') return 'python'
  if (extension === 'sql') return 'sql'
  if (extension === 'html' || extension === 'htm') return 'html'
  return null
}

export function isCodeLanguage(language: QuickLanguage): language is QuickCodeLanguage {
  return language === 'javascript' || language === 'typescript' || language === 'python'
}

/** Un salvataggio della raccolta: un file `<titolo>.<js|ts|sql>` nella cartella della Scrittura rapida. */
export interface QuickSnippetInfo {
  /** Nome del file (è anche l'identificativo). */
  id: string
  title: string
  language: QuickLanguage
  updatedAt: number
  size: number
}

export interface QuickSnippet extends QuickSnippetInfo {
  content: string
}

export interface QuickSaveRequest {
  /** File da sovrascrivere; null = nuovo salvataggio (se il titolo è già usato si aggiunge un numero). */
  id: string | null
  title: string
  language: QuickLanguage
  content: string
}

export interface QuickRunRequest {
  runId: string
  language: QuickCodeLanguage
  code: string
  /** Tempo massimo prima di fermare il programma (ms). */
  timeoutMs: number
}

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

/** Eventi di un'esecuzione, inviati a gruppi sul canale `quick:events`. Righe a base 1 del codice scritto. */
export type QuickRunEvent =
  | { runId: string; kind: 'log'; level: LogLevel; text: string; line?: number }
  /** Valore di un'espressione o di una variabile dichiarata (`name`) su quella riga. */
  | { runId: string; kind: 'value'; line: number; text: string; name?: string }
  | { runId: string; kind: 'error'; message: string; line?: number; phase: 'syntax' | 'runtime' }
  | { runId: string; kind: 'done'; status: 'ok' | 'error' | 'timeout' | 'stopped'; durationMs: number; truncated?: boolean }

export interface QuickSettings {
  level: AssistLevel
  /** Esegue da solo dopo una breve pausa nella scrittura. */
  autoRun: boolean
  sqlEngine: QuickSqlEngine
  /** Ogni esecuzione SQL riparte da un database pulito (+ dati d'esempio): risultati sempre ripetibili. */
  sqlFresh: boolean
  /** Dati d'esempio caricati nel database (id di shared/sql/samples.ts) o null. */
  sqlSample: string | null
  timeoutMs: number
}

export const DEFAULT_QUICK_SETTINGS: QuickSettings = { level: 'medium', autoRun: true, sqlEngine: 'sqlite', sqlFresh: true, sqlSample: null, timeoutMs: 5000 }

export const ASSIST_LEVEL_ORDER: AssistLevel[] = ['off', 'light', 'medium', 'strong']

/** Comportamento dell'editor per ogni livello di aiuto. */
export interface AssistProfile {
  /** Suggerimenti del linguaggio mentre si scrive (altrimenti solo con Ctrl+Spazio). */
  quickSuggestions: boolean
  /** Snippet (for, if, funzioni…) nell'elenco dei suggerimenti. */
  snippets: boolean
  /** Suggerimento AI in grigio (Tab per accettare). */
  ai: boolean
  /** Righe massime del suggerimento AI. */
  maxLines: number
  maxTokens: number
  debounceMs: number
  /** Suggerisce anche a metà riga (non solo alla fine). */
  midLine: boolean
  /** Contesto inviato al modello: caratteri prima del cursore. */
  prefixChars: number
}

export const ASSIST_LEVELS: Record<AssistLevel, AssistProfile> = {
  off: { quickSuggestions: false, snippets: false, ai: false, maxLines: 0, maxTokens: 0, debounceMs: 0, midLine: false, prefixChars: 0 },
  light: { quickSuggestions: true, snippets: false, ai: true, maxLines: 1, maxTokens: 32, debounceMs: 450, midLine: false, prefixChars: 1500 },
  medium: { quickSuggestions: true, snippets: true, ai: true, maxLines: 6, maxTokens: 120, debounceMs: 260, midLine: false, prefixChars: 3000 },
  strong: { quickSuggestions: true, snippets: true, ai: true, maxLines: 40, maxTokens: 320, debounceMs: 140, midLine: true, prefixChars: 6000 }
}

/** Taglia un suggerimento dell'AI alla misura del livello scelto (righe intere, niente righe vuote in coda). */
export function fitSuggestion(text: string, level: AssistLevel): string {
  const profile = ASSIST_LEVELS[level]
  if (!profile.ai || !text) return ''
  const lines = text.split('\n')
  // Le righe vuote iniziali (il suggerimento comincia "a capo") non contano nel limite.
  let kept = 0
  let end = 0
  while (end < lines.length && kept < profile.maxLines) {
    if (lines[end]!.trim()) kept++
    end++
  }
  if (end >= lines.length) return text
  return lines.slice(0, end).join('\n').replace(/\s+$/, '')
}

export function normalizeQuickSettings(value: Partial<QuickSettings> | undefined): QuickSettings {
  const next = { ...DEFAULT_QUICK_SETTINGS, ...value }
  if (!ASSIST_LEVEL_ORDER.includes(next.level)) next.level = DEFAULT_QUICK_SETTINGS.level
  if (next.sqlEngine !== 'postgres') next.sqlEngine = 'sqlite'
  next.autoRun = next.autoRun !== false
  next.sqlFresh = next.sqlFresh !== false
  if (typeof next.sqlSample !== 'string' || !next.sqlSample) next.sqlSample = null
  next.timeoutMs = Math.min(60000, Math.max(1000, Math.round(Number(next.timeoutMs) || DEFAULT_QUICK_SETTINGS.timeoutMs)))
  return next
}
