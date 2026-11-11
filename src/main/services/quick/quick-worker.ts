// Worker della Scrittura rapida: esegue il codice già strumentato (vedi shared/quick/instrument.ts)
// in un contesto `vm` pulito e manda al main, un evento alla volta, ciò che stampa e i valori delle righe.
// Gira in un thread separato: il main lo termina allo scadere del tempo o quando l'utente lo ferma,
// anche se il codice è bloccato in un ciclo infinito.
//
// Importa SOLO moduli di Node: il file viene costruito come entry a sé (out/main/quick-worker.mjs) e
// nell'app installata sta fuori dall'archivio asar.
import { parentPort, workerData } from 'node:worker_threads'
import { Console } from 'node:console'
import { webcrypto } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { inspect } from 'node:util'
import vm from 'node:vm'

export interface QuickWorkerInput {
  code: string
  filename: string
  maxEvents: number
}

export type QuickWorkerEvent =
  | { kind: 'log'; level: 'log' | 'info' | 'warn' | 'error' | 'debug'; text: string; line?: number }
  | { kind: 'value'; line: number; text: string; name?: string }
  | { kind: 'error'; message: string; at?: { line: number; column: number }; phase?: 'syntax' | 'runtime' }

/**
 * Messaggi dei worker (JS e Python) al main. `loaded` = pronto a ricevere un programma (Python: Pyodide
 * caricato); `started` = il codice dell'utente parte ora (da qui conta il tempo massimo).
 */
export type QuickWorkerMessage =
  | { type: 'event'; event: QuickWorkerEvent }
  | { type: 'truncated' }
  | { type: 'loaded' }
  | { type: 'started' }
  | { type: 'done'; status: 'ok' | 'error' }

const { code, filename, maxEvents } = workerData as QuickWorkerInput
const port = parentPort!
let sent = 0
let truncated = false
let failed = false

function post(event: QuickWorkerEvent): void {
  if (sent >= maxEvents) {
    if (!truncated) port.postMessage({ type: 'truncated' } satisfies QuickWorkerMessage)
    truncated = true
    return
  }
  sent++
  port.postMessage({ type: 'event', event } satisfies QuickWorkerMessage)
}

const INSPECT = { depth: 3, breakLength: 100, maxArrayLength: 50, maxStringLength: 2000, compact: 3 } as const

function preview(value: unknown): string {
  return inspect(value, INSPECT)
}

function location(error: unknown): { line: number; column: number } | undefined {
  const stack = (error as Error | undefined)?.stack
  if (typeof stack !== 'string') return undefined
  const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`${escaped}:(\\d+):(\\d+)`).exec(stack)
  return match ? { line: Number(match[1]), column: Number(match[2]) } : undefined
}

function describeError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const e = error as Error
    return e.name && e.name !== 'Error' ? `${e.name}: ${e.message}` : `Error: ${e.message}`
  }
  return `Eccezione: ${preview(error)}`
}

function reportError(error: unknown): void {
  failed = true
  post({ kind: 'error', message: describeError(error), at: location(error) })
}

// --- console con la riga di chi stampa ---------------------------------------------------------
// Un'unica Console di Node (formattazione, gruppi, table, count, time…) che scrive in un "flusso"
// finto: a ogni chiamata si annota prima livello e riga, poi si lascia formattare a Node.
type Level = 'log' | 'info' | 'warn' | 'error' | 'debug'
let currentLevel: Level = 'log'
let currentLine: number | undefined
// La Console di Node ascolta gli eventi del flusso ("error"): serve un EventEmitter con write().
const sink = Object.assign(new EventEmitter(), {
  write(chunk: string): boolean {
    const text = String(chunk).replace(/\n$/, '')
    post({ kind: 'log', level: currentLevel, text, line: currentLine })
    return true
  }
})
const nodeConsole = new Console({ stdout: sink as unknown as NodeJS.WritableStream, stderr: sink as unknown as NodeJS.WritableStream, colorMode: false, inspectOptions: INSPECT })
const LEVELS: Record<string, Level> ={ info: 'info', warn: 'warn', error: 'error', debug: 'debug', trace: 'warn', assert: 'error' }
const METHODS = ['log', 'info', 'warn', 'error', 'debug', 'table', 'dir', 'assert', 'count', 'countReset', 'group', 'groupCollapsed', 'groupEnd', 'time', 'timeEnd', 'timeLog'] as const

function consoleFor(line: number | undefined): Record<string, (...args: unknown[]) => void> {
  const object: Record<string, (...args: unknown[]) => void> = {}
  for (const method of METHODS) {
    object[method] = (...args: unknown[]) => {
      const previous = [currentLevel, currentLine] as const
      currentLevel = LEVELS[method] ?? 'log'
      currentLine = line
      try {
        ;(nodeConsole[method] as (...a: unknown[]) => void)(...args)
      } finally {
        ;[currentLevel, currentLine] = previous
      }
    }
  }
  // console.trace stamperebbe lo stack interno del worker: basta il messaggio.
  object['trace'] = (...args: unknown[]) => object['warn']!('Trace:', ...args)
  return object
}
const consoles = new Map<number, Record<string, (...args: unknown[]) => void>>()
const __con = (line: number) => {
  let found = consoles.get(line)
  if (!found) {
    found = consoleFor(line)
    consoles.set(line, found)
  }
  return found
}

// --- valori delle righe -------------------------------------------------------------------------
function isThenable(value: unknown): value is PromiseLike<unknown> {
  return !!value && (typeof value === 'object' || typeof value === 'function') && typeof (value as PromiseLike<unknown>).then === 'function'
}

const __v = (line: number, value: unknown, quiet: number) => {
  if (quiet && value === undefined) return value
  if (isThenable(value)) {
    post({ kind: 'value', line, text: 'Promise { <in attesa> }' })
    value.then(
      (result) => post({ kind: 'value', line, text: `Promise → ${preview(result)}` }),
      (error) => post({ kind: 'value', line, text: `Promise ✗ ${describeError(error)}` })
    )
    return value
  }
  post({ kind: 'value', line, text: preview(value) })
  return value
}

const __vd = (line: number, name: string, value: unknown) => {
  post({ kind: 'value', line, name, text: typeof value === 'function' ? `ƒ ${(value as { name?: string }).name || name}` : preview(value) })
}

// --- timer e attività asincrone tracciati: l'esecuzione finisce quando non resta nulla in sospeso ---
// Come nel browser i timer restituiscono un numero (non l'oggetto Timeout di Node, che si vedrebbe come valore).
const timers = new Map<number, { kind: 'timeout' | 'interval' | 'immediate'; handle: NodeJS.Timeout | NodeJS.Immediate }>()
let nextTimer = 1
let pendingRequests = 0

function clearAny(id: unknown): void {
  const timer = timers.get(Number(id))
  if (!timer) return
  if (timer.kind === 'immediate') clearImmediate(timer.handle as NodeJS.Immediate)
  else clearTimeout(timer.handle as NodeJS.Timeout)
  timers.delete(Number(id))
}

function guarded(fn: unknown, args: unknown[]): void {
  if (typeof fn !== 'function') return
  try {
    const result = (fn as (...a: unknown[]) => unknown)(...args)
    if (isThenable(result)) result.then(undefined, reportError)
  } catch (error) {
    reportError(error)
  }
}

const sandboxTimers = {
  setTimeout: (fn: unknown, ms?: number, ...args: unknown[]) => {
    const id = nextTimer++
    timers.set(id, {
      kind: 'timeout',
      handle: setTimeout(() => {
        timers.delete(id)
        guarded(fn, args)
      }, ms)
    })
    return id
  },
  setInterval: (fn: unknown, ms?: number, ...args: unknown[]) => {
    const id = nextTimer++
    timers.set(id, { kind: 'interval', handle: setInterval(() => guarded(fn, args), ms) })
    return id
  },
  setImmediate: (fn: unknown, ...args: unknown[]) => {
    const id = nextTimer++
    timers.set(id, {
      kind: 'immediate',
      handle: setImmediate(() => {
        timers.delete(id)
        guarded(fn, args)
      })
    })
    return id
  },
  clearTimeout: clearAny,
  clearInterval: clearAny,
  clearImmediate: clearAny
}

const trackedFetch = (...args: Parameters<typeof fetch>) => {
  pendingRequests++
  return fetch(...args).finally(() => pendingRequests--)
}

process.on('unhandledRejection', (reason) => reportError(reason))
process.on('uncaughtException', (error) => reportError(error))

const context = vm.createContext(
  {
    __con,
    __v,
    __vd,
    console: consoleFor(undefined),
    ...sandboxTimers,
    queueMicrotask,
    structuredClone,
    fetch: trackedFetch,
    Headers,
    Request,
    Response,
    FormData,
    Blob,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    AbortController,
    AbortSignal,
    Event,
    EventTarget,
    atob,
    btoa,
    crypto: webcrypto,
    performance,
    require: (name: string) => {
      throw new Error(`nella scrittura rapida non si caricano moduli («${name}»): per usarli crea un progetto console.`)
    }
  },
  { name: 'Scrittura rapida' }
)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function main(): Promise<void> {
  port.postMessage({ type: 'started' } satisfies QuickWorkerMessage)
  try {
    const completion = vm.runInContext(code, context, { filename }) as unknown
    if (isThenable(completion)) await completion
  } catch (error) {
    reportError(error)
  }
  // Timer e richieste ancora attivi: si aspetta (il main ferma tutto allo scadere del tempo).
  while (timers.size > 0 || pendingRequests > 0) await sleep(10)
  await sleep(5)
  port.postMessage({ type: 'done', status: failed ? 'error' : 'ok' } satisfies QuickWorkerMessage)
}

void main()
