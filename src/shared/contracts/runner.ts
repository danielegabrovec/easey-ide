// Contratto dell'esecuzione: anteprima web (iframe) e processi nel terminale.

export interface SourceLocation {
  /** Percorso relativo al progetto. */
  path: string
  line: number
  column: number
}

/** Valore di console serializzato dall'anteprima (niente oggetti vivi attraversano l'iframe). */
export type SerializedValue =
  | { t: 'string'; v: string }
  | { t: 'number'; v: string }
  | { t: 'bigint'; v: string }
  | { t: 'boolean'; v: boolean }
  | { t: 'null' }
  | { t: 'undefined' }
  | { t: 'symbol'; v: string }
  | { t: 'function'; name: string }
  | { t: 'error'; name: string; message: string; stack?: string }
  | { t: 'element'; tag: string; id?: string; className?: string }
  | { t: 'array'; items: SerializedValue[]; length: number }
  | { t: 'object'; ctor: string; entries: [string, SerializedValue][]; more: boolean }
  | { t: 'map'; entries: [SerializedValue, SerializedValue][] }
  | { t: 'set'; items: SerializedValue[] }
  | { t: 'date'; v: string }
  | { t: 'regexp'; v: string }
  | { t: 'circular' }
  | { t: 'truncated' }

export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

/** Messaggi che lo script ponte iniettato nell'anteprima invia al renderer con postMessage. */
export type PreviewMessage =
  | { __ide: 1; kind: 'ready'; href: string }
  | { __ide: 1; kind: 'console'; level: ConsoleLevel; args: SerializedValue[]; url?: string; line?: number; column?: number; group?: number; result?: boolean }
  | { __ide: 1; kind: 'table'; rows: SerializedValue; url?: string; line?: number; column?: number }
  | { __ide: 1; kind: 'clear' }
  | { __ide: 1; kind: 'error'; message: string; stack?: string; url?: string; line?: number; column?: number }
  | { __ide: 1; kind: 'compile-error'; path: string; message: string; line: number; column: number }
  /** Passo di un programma visuale in esecuzione (id del blocco o del nodo). */
  | { __ide: 1; kind: 'step'; id: string }
  /** Scorciatoia premuta dentro l'anteprima, da eseguire nell'IDE. */
  | { __ide: 1; kind: 'key'; key: string; code: string; ctrl: boolean; shift: boolean; alt: boolean }

export type TerminalKind = 'shell' | 'run' | 'repl'

export interface ShellOption {
  id: string
  label: string
}

export interface TerminalCapabilities {
  /** false = node-pty non caricabile: terminale semplificato senza TTY. */
  pty: boolean
  shells: ShellOption[]
  /** Node usato per eseguire i programmi: quello di sistema (TTY completo) o quello interno di Electron. */
  node: { source: 'system' | 'bundled'; version: string }
}

export type CreateTerminalRequest =
  | { kind: 'shell'; shellId?: string }
  | { kind: 'run'; entry: string }
  | { kind: 'repl' }

export interface TerminalSessionInfo {
  id: string
  kind: TerminalKind
  title: string
}

export interface TerminalData {
  id: string
  data: string
}

export interface TerminalExit {
  id: string
  code: number
}

export const PREVIEW_SCHEME = 'ide-preview'
export const PREVIEW_HOST = 'project'
/** Host della pagina HTML della Scrittura rapida (in memoria, nessun progetto). */
export const QUICK_PREVIEW_HOST = 'quick'
export const QUICK_PREVIEW_PAGE = 'pagina.html'
