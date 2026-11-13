// UNICO elenco dei canali IPC fra renderer e main.
// Il main registra un gestore per ogni chiave di InvokeChannels (src/main/ipc/router.ts);
// il preload espone solo i canali elencati qui (whitelist).

import type { AiChatChunk, AiChatRequest, AiCompleteRequest, AiStatus } from './ai'
import type { TraceResult } from './trace'
import type { GitCommit, GitStatus } from './git'
import type { CheckResult, Course, CourseProgress, CourseSummary, LearnEvent } from './learn'
import type { CreateDatabaseRequest, DbConnectionInfo, DbSchema, DbSnapshot, QueryOutcome, QueryPlan } from './db'
import type { AppInfo, Settings } from './settings'
import type { QuickCodeLanguage, QuickRunEvent, QuickRunRequest, QuickSaveRequest, QuickSnippet, QuickSnippetInfo, QuickSqlEngine, QuickToolchain } from './quick'
import type {
  CreateProjectRequest,
  FileEntry,
  HistoryEntry,
  ProjectInfo,
  ProjectTemplate,
  TextFile,
  WorkspaceChange
} from './workspace'
import type {
  CreateTerminalRequest,
  SourceLocation,
  TerminalCapabilities,
  TerminalData,
  TerminalExit,
  TerminalSessionInfo
} from './runner'

export interface InvokeChannels {
  'app:info': () => AppInfo
  'app:setTitle': (title: string) => void
  'app:openExternal': (url: string) => void
  /** Testi legali inclusi nell'app: licenza MIT, note legali, componenti di terze parti. */
  'app:legal': (doc: 'licenza' | 'note' | 'terze-parti') => string
  /** Dialogo Salva con nome; restituisce il percorso scelto o null. */
  'app:saveFile': (defaultName: string, content: string, encoding?: 'utf8' | 'base64') => string | null
  /** Risposta a `app:closeRequested`: chiudi ora, aspetta (dialogo aperto) o annulla la chiusura. */
  'app:closeReply': (decision: CloseDecision) => void

  'settings:get': () => Settings
  'settings:update': (patch: Partial<Settings>) => Settings

  'workspace:templates': () => ProjectTemplate[]
  'workspace:defaultLocation': () => string
  'workspace:pickFolder': () => string | null
  'workspace:create': (request: CreateProjectRequest) => ProjectInfo
  'workspace:open': (root: string) => ProjectInfo
  'workspace:close': () => void
  'workspace:current': () => ProjectInfo | null
  'workspace:tree': () => FileEntry[]
  'workspace:textFiles': () => TextFile[]
  'workspace:readFile': (path: string) => string
  'workspace:writeFile': (path: string, content: string) => void
  'workspace:createFile': (path: string, content: string) => void
  'workspace:createFolder': (path: string) => void
  'workspace:rename': (from: string, to: string) => void
  'workspace:delete': (path: string) => void
  'workspace:reveal': (path: string) => void
  /** Sceglie un'immagine dal disco e la copia nella cartella indicata del progetto; restituisce il percorso o null. */
  'workspace:importAsset': (folder: string) => string | null
  'workspace:historyList': (path: string) => HistoryEntry[]
  'workspace:historyRead': (path: string, id: string) => string

  'preview:url': (entry: string) => string
  'preview:mapLocation': (url: string, line: number, column: number) => SourceLocation | null

  'terminal:capabilities': () => TerminalCapabilities
  'terminal:create': (request: CreateTerminalRequest) => TerminalSessionInfo
  'terminal:write': (id: string, data: string) => void
  'terminal:resize': (id: string, cols: number, rows: number) => void
  'terminal:kill': (id: string) => void

  'ai:status': () => AiStatus
  'ai:complete': (request: AiCompleteRequest) => string
  'ai:chat': (request: AiChatRequest) => void
  'ai:cancel': (requestId: string) => void

  'db:list': () => DbConnectionInfo[]
  'db:samples': () => { id: string; title: string; description: string }[]
  'db:create': (request: CreateDatabaseRequest) => DbConnectionInfo
  'db:delete': (id: string) => void
  'db:execute': (id: string, sql: string) => QueryOutcome[]
  'db:schema': (id: string) => DbSchema
  'db:explain': (id: string, sql: string) => QueryPlan
  'db:snapshots': (id: string) => DbSnapshot[]
  'db:snapshot': (id: string) => DbSnapshot
  'db:restore': (id: string, snapshotId: string) => void

  'learn:list': () => CourseSummary[]
  'learn:course': (courseId: string) => Course
  'learn:progress': (courseId: string) => CourseProgress
  /** Prepara la cartella di lavoro dell'esercizio (con `reset` la ricrea) e ne restituisce il percorso. */
  'learn:start': (courseId: string, exerciseId: string, reset?: boolean) => string
  'learn:files': (courseId: string, exerciseId: string) => Record<string, string>
  'learn:check': (courseId: string, exerciseId: string) => CheckResult
  'learn:record': (courseId: string, exerciseId: string, event: LearnEvent) => CourseProgress
  /** Sceglie la cartella di un manuale della Collana (o di un pacchetto-corso) e lo importa; null se annullato. */
  'learn:import': (kind: 'manuale' | 'pacchetto') => CourseSummary | null
  'learn:remove': (courseId: string) => void

  /** Esegue un file JS/TS del progetto registrando ogni passo (variabili e pila delle chiamate). */
  'trace:run': (path: string) => TraceResult

  'git:status': () => GitStatus
  'git:init': () => void
  /** Contenuto del file nell'ultimo commit (null se nuovo). */
  'git:original': (path: string) => string | null
  /** Aggiunge tutto e crea il commit; restituisce l'hash breve. */
  'git:commit': (message: string) => string
  'git:log': () => GitCommit[]
  'git:discard': (path: string) => void

  /** Esporta il progetto (ZIP o pagina HTML unica) con il dialogo Salva; restituisce il percorso o null. */
  'project:export': (kind: 'zip' | 'html') => string | null

  /** Scrittura rapida (senza progetto): raccolta di file nei Documenti, esecuzione JS/TS isolata, SQL in memoria. */
  'quick:list': () => QuickSnippetInfo[]
  'quick:read': (id: string) => QuickSnippet
  'quick:save': (request: QuickSaveRequest) => QuickSnippetInfo
  /** Sposta il salvataggio nel Cestino. */
  'quick:delete': (id: string) => void
  'quick:revealFolder': () => void
  /** Avvia l'esecuzione e ritorna subito: i risultati arrivano come eventi `quick:events`. */
  'quick:run': (request: QuickRunRequest) => void
  'quick:stop': (runId: string) => void
  /** Prepara il motore in anticipo (Python: carica Pyodide mentre si scrive). */
  'quick:prepare': (language: QuickCodeLanguage) => void
  /** Compilatori per C, C++, C#, Java e Rust trovati sul PC (con `refresh` li cerca di nuovo). */
  'quick:toolchains': (refresh?: boolean) => QuickToolchain[]
  /** Pubblica la pagina HTML della Scrittura rapida e ne restituisce l'indirizzo `ide-preview://quick/…`. */
  'quick:page': (html: string) => string
  'quick:sql': (engine: QuickSqlEngine, sql: string) => QueryOutcome[]
  'quick:sqlSchema': (engine: QuickSqlEngine) => DbSchema
  /** Svuota il database in memoria e carica eventualmente i dati d'esempio. */
  'quick:sqlReset': (engine: QuickSqlEngine, sample: string | null) => DbSchema
}

export interface EventChannels {
  'workspace:changed': WorkspaceChange
  'terminal:data': TerminalData
  'terminal:exit': TerminalExit
  'menu:command': string
  'ai:chunk': AiChatChunk
  'quick:events': QuickRunEvent[]
  /** La finestra sta per chiudersi: il renderer salva il lavoro e risponde con `app:closeReply`. */
  'app:closeRequested': void
}

export type CloseDecision = 'close' | 'wait' | 'cancel'

export type InvokeChannel = keyof InvokeChannels
export type EventChannel = keyof EventChannels

export const INVOKE_CHANNELS = [
  'app:info',
  'app:setTitle',
  'app:openExternal',
  'app:legal',
  'app:saveFile',
  'app:closeReply',
  'settings:get',
  'settings:update',
  'workspace:templates',
  'workspace:defaultLocation',
  'workspace:pickFolder',
  'workspace:create',
  'workspace:open',
  'workspace:close',
  'workspace:current',
  'workspace:tree',
  'workspace:textFiles',
  'workspace:readFile',
  'workspace:writeFile',
  'workspace:createFile',
  'workspace:createFolder',
  'workspace:rename',
  'workspace:delete',
  'workspace:reveal',
  'workspace:importAsset',
  'workspace:historyList',
  'workspace:historyRead',
  'preview:url',
  'preview:mapLocation',
  'terminal:capabilities',
  'terminal:create',
  'terminal:write',
  'terminal:resize',
  'terminal:kill',
  'ai:status',
  'ai:complete',
  'ai:chat',
  'ai:cancel',
  'db:list',
  'db:samples',
  'db:create',
  'db:delete',
  'db:execute',
  'db:schema',
  'db:explain',
  'db:snapshots',
  'db:snapshot',
  'db:restore',
  'learn:list',
  'learn:course',
  'learn:progress',
  'learn:start',
  'learn:files',
  'learn:check',
  'learn:record',
  'learn:import',
  'learn:remove',
  'trace:run',
  'git:status',
  'git:init',
  'git:original',
  'git:commit',
  'git:log',
  'git:discard',
  'project:export',
  'quick:list',
  'quick:read',
  'quick:save',
  'quick:delete',
  'quick:revealFolder',
  'quick:run',
  'quick:stop',
  'quick:prepare',
  'quick:toolchains',
  'quick:page',
  'quick:sql',
  'quick:sqlSchema',
  'quick:sqlReset'
] as const satisfies readonly InvokeChannel[]

export const EVENT_CHANNELS = ['workspace:changed', 'terminal:data', 'terminal:exit', 'menu:command', 'ai:chunk', 'quick:events', 'app:closeRequested'] as const satisfies readonly EventChannel[]

/** Ciò che il preload espone come `window.ide`. */
export interface IdeBridge {
  invoke<K extends InvokeChannel>(channel: K, ...args: Parameters<InvokeChannels[K]>): Promise<Awaited<ReturnType<InvokeChannels[K]>>>
  on<K extends EventChannel>(channel: K, listener: (payload: EventChannels[K]) => void): () => void
}
