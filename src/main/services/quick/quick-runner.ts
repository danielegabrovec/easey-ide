// Esecuzione della Scrittura rapida, sempre in qualcosa che si può terminare:
//  - JS/TS: strumentazione → (TS: esbuild con source map) → quick-worker.mjs (contesto vm pulito);
//  - Python: quick-python-worker.mjs con Pyodide; se ne tiene uno già caricato per partire subito;
//  - C, C++, C#, Java, Rust: compilatori del PC in processi separati (native-runner.ts).
// Il tempo massimo conta da quando parte il codice dell'utente (non dal caricamento o dalla compilazione).
// Gli eventi arrivano al renderer a piccoli gruppi sul canale `quick:events`. Un programma alla volta:
// uno nuovo ferma il precedente (esecuzione automatica mentre si scrive).
import type { ChildProcess } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { performance } from 'node:perf_hooks'
import { isNativeLanguage, type NativeLanguage, type QuickCodeLanguage, type QuickRunEvent, type QuickRunRequest, type QuickToolchain } from '@shared/contracts/quick'
import { NativeToolchains, killTree, runNative, type NativeContext } from './native-runner'
import { QuickCodeError, instrumentQuick, wrapAsync } from '@shared/quick/instrument'
import { SourceMapReader, type RawSourceMap } from '@shared/sourcemap'
import { loadEsbuild } from '../esbuild-loader'
import type { QuickPythonJob } from './quick-python-worker'
import type { QuickWorkerInput, QuickWorkerMessage } from './quick-worker'

export const QUICK_FILENAME = 'scrittura-rapida.js'
const MAX_EVENTS = 2000
const FLUSH_MS = 40
const MEMORY_MB = 384
const PYTHON_MEMORY_MB = 768
/** Tempo concesso per avviare il worker (Pyodide la prima volta impiega circa un secondo). */
const START_TIMEOUT_MS = 60000

export interface CompiledQuick {
  code: string
  map: SourceMapReader | null
}

export interface QuickWorkerFiles {
  js: string
  python: string
}

/** Strumenta e (per TypeScript) toglie i tipi. Lancia QuickCodeError con la riga per gli errori di sintassi. */
export async function compileQuick(source: string, language: 'javascript' | 'typescript'): Promise<CompiledQuick> {
  const typescript = language === 'typescript'
  const instrumented = wrapAsync(instrumentQuick(source, typescript))
  if (!typescript) return { code: instrumented, map: null }
  const esbuild = await loadEsbuild()
  try {
    const result = await esbuild.transform(instrumented, { loader: 'ts', target: 'es2022', sourcemap: 'external', sourcefile: 'scrittura-rapida.ts', logLevel: 'silent' })
    return { code: result.code, map: new SourceMapReader(JSON.parse(result.map) as RawSourceMap) }
  } catch (error) {
    const first = (error as { errors?: { text: string; location?: { line: number; column: number } | null }[] }).errors?.[0]
    if (first) throw new QuickCodeError(first.text, first.location?.line, first.location ? first.location.column + 1 : undefined)
    throw error
  }
}

/** Riga del codice scritto per una posizione del codice eseguito. */
export function originalLine(compiled: CompiledQuick | null, at: { line: number; column: number } | undefined): number | undefined {
  if (!at) return undefined
  if (!compiled?.map) return at.line
  return compiled.map.originalPosition(at.line, at.column)?.line ?? at.line
}

interface Running {
  runId: string
  finish: (status: 'ok' | 'error' | 'timeout' | 'stopped', exitCode?: number) => void
}

export class QuickRunner {
  private current: Running | null = null
  /** Worker Python già caricato, pronto per il prossimo programma. */
  private spare: Worker | null = null

  constructor(
    /** Percorsi dei worker costruiti (out/main/*.mjs, fuori da asar nell'app installata). */
    private readonly files: () => QuickWorkerFiles,
    private readonly emit: (events: QuickRunEvent[]) => void,
    /** Linguaggi nativi: compilatori del PC e cartella di lavoro temporanea. */
    private readonly native: { toolchains: NativeToolchains; workRoot: string } = { toolchains: new NativeToolchains(), workRoot: join(tmpdir(), 'easey-ide', 'quick') }
  ) {}

  /** Compilatori installati (C, C++, C#, Java, Rust); con `refresh` li cerca di nuovo. */
  toolchains(refresh = false): Promise<QuickToolchain[]> {
    return this.native.toolchains.list(refresh)
  }

  /** Prepara in anticipo ciò che serve (Python: carica Pyodide in un worker di riserva; nativi: cerca il compilatore). */
  prepare(language: QuickCodeLanguage): void {
    if (language === 'python' && !this.spare) this.spare = this.spawnPython()
    else if (isNativeLanguage(language)) void this.native.toolchains.resolve(language)
  }

  private spawnPython(): Worker {
    const worker = new Worker(this.files().python, { stdout: true, stderr: true, resourceLimits: { maxOldGenerationSizeMb: PYTHON_MEMORY_MB } })
    const forget = () => {
      if (this.spare === worker) this.spare = null
    }
    worker.on('error', forget)
    worker.on('exit', forget)
    return worker
  }

  async run(request: QuickRunRequest): Promise<void> {
    this.current?.finish('stopped')
    const started = performance.now()
    const queue: QuickRunEvent[] = []
    let flushTimer: NodeJS.Timeout | null = null
    let truncated = false
    let finished = false
    let worker: Worker | null = null
    const children: ChildProcess[] = []
    let lines = 0
    let limit: NodeJS.Timeout | null = null
    const flush = () => {
      if (flushTimer) clearTimeout(flushTimer)
      flushTimer = null
      if (queue.length) this.emit(queue.splice(0))
    }
    const push = (event: QuickRunEvent) => {
      queue.push(event)
      flushTimer ??= setTimeout(flush, FLUSH_MS)
    }
    const running: Running = {
      runId: request.runId,
      finish: (status, exitCode?: number) => {
        if (finished) return
        finished = true
        if (limit) clearTimeout(limit)
        void worker?.terminate()
        children.forEach(killTree)
        push({ runId: request.runId, kind: 'done', status, durationMs: performance.now() - started, truncated, exitCode })
        flush()
        if (this.current === running) this.current = null
      }
    }
    this.current = running

    if (isNativeLanguage(request.language)) {
      const context: NativeContext = {
        push,
        finish: (status, exitCode) => running.finish(status, exitCode),
        finished: () => finished,
        track: (child) => void children.push(child),
        started: (extraMs = 0) => {
          if (limit) clearTimeout(limit)
          limit = setTimeout(() => running.finish('timeout'), request.timeoutMs + extraMs)
        },
        countLine: () => {
          if (++lines <= MAX_EVENTS) return false
          truncated = true
          return true
        }
      }
      try {
        await runNative(context, request as QuickRunRequest & { language: NativeLanguage }, this.native.toolchains, this.native.workRoot)
      } catch (error) {
        push({ runId: request.runId, kind: 'error', phase: 'runtime', message: (error as Error).message })
        running.finish('error')
      }
      return
    }

    let compiled: CompiledQuick | null = null
    if (request.language !== 'python') {
      try {
        compiled = await compileQuick(request.code, request.language)
      } catch (error) {
        push({ runId: request.runId, kind: 'error', phase: 'syntax', message: (error as Error).message, line: error instanceof QuickCodeError ? error.line : undefined })
        running.finish('error')
        return
      }
      if (finished) return // fermata (o sostituita) durante la compilazione
      const input: QuickWorkerInput = { code: compiled.code, filename: QUICK_FILENAME, maxEvents: MAX_EVENTS }
      worker = new Worker(this.files().js, { workerData: input, stdout: true, stderr: true, resourceLimits: { maxOldGenerationSizeMb: MEMORY_MB } })
    } else {
      worker = this.spare ?? this.spawnPython()
      this.spare = null
      worker.postMessage({ code: request.code, maxEvents: MAX_EVENTS, stdin: request.stdin ?? '' } satisfies QuickPythonJob)
      // Il prossimo programma Python troverà Pyodide già caricato.
      this.spare = this.spawnPython()
    }

    const memory = request.language === 'python' ? PYTHON_MEMORY_MB : MEMORY_MB
    limit = setTimeout(() => {
      push({ runId: request.runId, kind: 'error', phase: 'runtime', message: 'Il motore di esecuzione non è partito.' })
      running.finish('error')
    }, START_TIMEOUT_MS)
    worker.on('message', (message: QuickWorkerMessage) => {
      if (finished) return
      if (message.type === 'started') {
        if (limit) clearTimeout(limit)
        limit = setTimeout(() => running.finish('timeout'), request.timeoutMs)
      } else if (message.type === 'truncated') truncated = true
      else if (message.type === 'done') running.finish(message.status)
      else if (message.type === 'event') {
        const event = message.event
        if (event.kind === 'error') push({ runId: request.runId, kind: 'error', phase: event.phase ?? 'runtime', message: event.message, line: originalLine(compiled, event.at) })
        else push({ ...event, runId: request.runId })
      }
    })
    worker.on('error', (error: Error & { code?: string }) => {
      if (finished) return
      const message = error.code === 'ERR_WORKER_OUT_OF_MEMORY' ? `Memoria esaurita (oltre ${memory} MB): forse un ciclo che riempie una lista all'infinito?` : error.message
      push({ runId: request.runId, kind: 'error', phase: 'runtime', message })
      running.finish('error')
    })
    // Se il worker esce da solo, i suoi ultimi messaggi ("done") hanno la precedenza: si aspetta un attimo.
    worker.on('exit', (code) => setTimeout(() => running.finish(code === 0 ? 'ok' : 'error'), 30))
  }

  stop(runId: string): void {
    if (this.current?.runId === runId) this.current.finish('stopped')
  }

  dispose(): void {
    this.current?.finish('stopped')
    void this.spare?.terminate()
    this.spare = null
  }
}
