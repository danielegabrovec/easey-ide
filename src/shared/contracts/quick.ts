// Contratto della "Scrittura rapida": codice scritto al volo in uno dei linguaggi qui sotto, eseguito
// subito e salvato come file nella raccolta personale, senza creare né aprire un progetto.

/**
 * Linguaggi della Scrittura rapida. JS e TS girano in un worker di Node, Python in Pyodide (Python
 * compilato in WebAssembly: nessuna installazione), SQL in un database in memoria, HTML (con CSS e
 * JS dentro la pagina) nell'anteprima `ide-preview://quick/`. C, C++, C#, Java e Rust ("nativi") usano
 * i compilatori installati sul PC (gcc/g++, .NET SDK 10, JDK, rustc), rilevati in automatico.
 * Gli id coincidono con quelli dei linguaggi di Monaco.
 */
export type NativeLanguage = 'c' | 'cpp' | 'csharp' | 'java' | 'rust'
export type QuickLanguage = 'javascript' | 'typescript' | 'python' | 'sql' | 'html' | NativeLanguage
/** Linguaggi eseguiti con `quick:run` (worker o compilatore). */
export type QuickCodeLanguage = 'javascript' | 'typescript' | 'python' | NativeLanguage
export type QuickSqlEngine = 'sqlite' | 'postgres'

export const NATIVE_LANGUAGES: NativeLanguage[] = ['c', 'cpp', 'csharp', 'java', 'rust']
export const QUICK_LANGUAGES: QuickLanguage[] = ['javascript', 'typescript', 'python', 'sql', 'html', ...NATIVE_LANGUAGES]

/** Quanto aiuta l'editor mentre si scrive (vedi ASSIST_LEVELS). */
export type AssistLevel = 'off' | 'light' | 'medium' | 'strong'

export const QUICK_EXTENSIONS: Record<QuickLanguage, string> = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  sql: 'sql',
  html: 'html',
  c: 'c',
  cpp: 'cpp',
  csharp: 'cs',
  java: 'java',
  rust: 'rs'
}

/** Nomi di ogni linguaggio: `title` per menu e titoli, `short` per i pulsanti, `ai` per i prompt dell'AI. */
export const QUICK_LANGUAGE_INFO: Record<QuickLanguage, { title: string; short: string; ai: string }> = {
  javascript: { title: 'JavaScript', short: 'JS', ai: 'JavaScript' },
  typescript: { title: 'TypeScript', short: 'TS', ai: 'TypeScript' },
  python: { title: 'Python', short: 'Python', ai: 'Python 3 (solo libreria standard)' },
  sql: { title: 'SQL', short: 'SQL', ai: 'SQL' },
  html: { title: 'HTML', short: 'HTML', ai: 'HTML (CSS in <style>, JavaScript in <script>)' },
  c: { title: 'C', short: 'C', ai: 'C (C17, un solo file con main, solo libreria standard)' },
  cpp: { title: 'C++', short: 'C++', ai: 'C++ (C++20, un solo file con main, solo libreria standard)' },
  csharp: { title: 'C#', short: 'C#', ai: 'C# (.NET 10, un solo file con istruzioni di primo livello)' },
  java: { title: 'Java', short: 'Java', ai: 'Java (un solo file; anche la forma compatta «void main() { … }» di Java 25)' },
  rust: { title: 'Rust', short: 'Rust', ai: 'Rust (un solo file con fn main, solo libreria standard)' }
}

const EXTENSION_LANGUAGE: Record<string, QuickLanguage> = {
  js: 'javascript',
  mjs: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  py: 'python',
  sql: 'sql',
  html: 'html',
  htm: 'html',
  c: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  cs: 'csharp',
  java: 'java',
  rs: 'rust'
}

export function quickLanguageOf(fileName: string): QuickLanguage | null {
  const extension = /\.([^.]+)$/.exec(fileName)?.[1]?.toLowerCase()
  return (extension && EXTENSION_LANGUAGE[extension]) || null
}

export function isNativeLanguage(language: QuickLanguage): language is NativeLanguage {
  return (NATIVE_LANGUAGES as QuickLanguage[]).includes(language)
}

export function isCodeLanguage(language: QuickLanguage): language is QuickCodeLanguage {
  return language === 'javascript' || language === 'typescript' || language === 'python' || isNativeLanguage(language)
}

/** Linguaggi che leggono l'input da tastiera (stdin): lo si scrive prima nel riquadro «Input». */
export function readsStdin(language: QuickLanguage): boolean {
  return language === 'python' || isNativeLanguage(language)
}

/** Compilatore (o SDK) che serve a un linguaggio nativo, com'è stato trovato sul PC. */
export interface QuickToolchain {
  language: NativeLanguage
  available: boolean
  /** Programma usato (es. "gcc", o il percorso completo se trovato fuori dal PATH). */
  command?: string
  version?: string
  /** Perché non si può usare (es. "serve il JDK, non solo il JRE"). */
  problem?: string
  install: { name: string; winget: string; url: string; note?: string }
}

/** Come installare ciò che manca (winget è incluso in Windows 10/11). */
export const TOOLCHAIN_INSTALL: Record<NativeLanguage, QuickToolchain['install']> = {
  c: { name: 'GCC (WinLibs)', winget: 'winget install -e --id BrechtSanders.WinLibs.POSIX.UCRT', url: 'https://winlibs.com/' },
  cpp: { name: 'G++ (WinLibs)', winget: 'winget install -e --id BrechtSanders.WinLibs.POSIX.UCRT', url: 'https://winlibs.com/' },
  csharp: { name: '.NET SDK 10', winget: 'winget install -e --id Microsoft.DotNet.SDK.10', url: 'https://dotnet.microsoft.com/download' },
  java: { name: 'JDK (Eclipse Temurin 25)', winget: 'winget install -e --id EclipseAdoptium.Temurin.25.JDK', url: 'https://adoptium.net/' },
  rust: {
    name: 'Rust (rustup)',
    winget: 'winget install -e --id Rustlang.Rustup',
    url: 'https://www.rust-lang.org/tools/install',
    note: 'Rust per Windows usa il linker di Visual Studio: se manca, installa anche «Build Tools per Visual Studio» con il carico «Sviluppo di applicazioni desktop con C++».'
  }
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
  /** Input da tastiera (Python e linguaggi nativi): righe lette da input(), scanf, cin, Scanner… */
  stdin?: string
}

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

/** Eventi di un'esecuzione, inviati a gruppi sul canale `quick:events`. Righe a base 1 del codice scritto. */
export type QuickRunEvent =
  | { runId: string; kind: 'log'; level: LogLevel; text: string; line?: number }
  /** Valore di un'espressione o di una variabile dichiarata (`name`) su quella riga. */
  | { runId: string; kind: 'value'; line: number; text: string; name?: string }
  | { runId: string; kind: 'error'; message: string; line?: number; phase: 'syntax' | 'compile' | 'runtime' }
  | { runId: string; kind: 'done'; status: 'ok' | 'error' | 'timeout' | 'stopped'; durationMs: number; truncated?: boolean; exitCode?: number }

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
