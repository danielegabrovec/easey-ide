// Esecuzione della Scrittura rapida dal renderer: JS/TS nel worker del main (eventi `quick:events`),
// SQL nel database in memoria. Esecuzione automatica dopo una pausa nella scrittura.
import { QUICK_PREVIEW_PAGE, type PreviewMessage, type SerializedValue } from '@shared/contracts/runner'
import { isNativeLanguage, readsStdin, type QuickLanguage } from '@shared/contracts/quick'
import { isReadOnlySql } from '@shared/sql/completion'
import { ide } from '../../ipc'
import { chordOf, runChord } from '../../workbench/commands'
import { notifyError } from '../../workbench/notifications'
import { workbench } from '../../workbench/store'
import { quick, useQuick } from './quick-store'
import { quickEditor, showRunDecorations, showSqlDecorations } from './quick-editor'

const AUTO_RUN_DELAY = 700
/** I linguaggi compilati costano di più: si aspetta una pausa un po' più lunga. */
const AUTO_RUN_DELAY_NATIVE = 1300
let counter = 0
let sqlSequence = 0
let autoTimer: ReturnType<typeof setTimeout> | null = null

let pageStarted = 0

/** Testo compatto di un valore serializzato dalla pagina (console dell'anteprima HTML). */
export function formatSerialized(value: SerializedValue, depth = 0): string {
  switch (value.t) {
    case 'string':
      return depth ? JSON.stringify(value.v) : value.v
    case 'number':
    case 'bigint':
    case 'symbol':
    case 'date':
    case 'regexp':
      return String(value.v)
    case 'boolean':
      return String(value.v)
    case 'null':
    case 'undefined':
      return value.t
    case 'function':
      return `ƒ ${value.name || 'anonima'}`
    case 'error':
      return `${value.name}: ${value.message}`
    case 'element':
      return `<${value.tag}${value.id ? `#${value.id}` : ''}${value.className ? `.${value.className.split(/\s+/).join('.')}` : ''}>`
    case 'array':
      return `[${value.items.map((v) => formatSerialized(v, depth + 1)).join(', ')}${value.length > value.items.length ? ', …' : ''}]`
    case 'object':
      return `${value.ctor && value.ctor !== 'Object' ? `${value.ctor} ` : ''}{ ${value.entries.map(([k, v]) => `${k}: ${formatSerialized(v, depth + 1)}`).join(', ')}${value.more ? ', …' : ''} }`
    case 'map':
      return `Map { ${value.entries.map(([k, v]) => `${formatSerialized(k, depth + 1)} => ${formatSerialized(v, depth + 1)}`).join(', ')} }`
    case 'set':
      return `Set { ${value.items.map((v) => formatSerialized(v, depth + 1)).join(', ')} }`
    case 'circular':
      return '[circolare]'
    case 'truncated':
      return '…'
  }
}

function quickFrame(): Window | null {
  return document.querySelector<HTMLIFrameElement>('iframe[data-testid="quick-page"]')?.contentWindow ?? null
}

/** Messaggi dello script ponte della pagina HTML → righe dell'output (stesso formato degli eventi JS). */
function handlePageMessage(data: PreviewMessage): void {
  const runId = quick().runId
  if (!runId || quick().language !== 'html') return
  // Righe solo per gli script dentro la pagina (non per quelli caricati da internet).
  const where = data as { url?: string; line?: number }
  const line = typeof where.line === 'number' && where.url?.includes(`/${QUICK_PREVIEW_PAGE}`) ? where.line : undefined
  if (data.kind === 'console') quick().addEvents([{ runId, kind: 'log', level: data.level, text: data.args.map((a) => formatSerialized(a)).join(' '), line }])
  else if (data.kind === 'table') quick().addEvents([{ runId, kind: 'log', level: 'log', text: formatSerialized(data.rows), line }])
  else if (data.kind === 'error') quick().addEvents([{ runId, kind: 'error', phase: 'runtime', message: data.message, line }])
  else if (data.kind === 'key') runChord(chordOf({ key: data.key, code: data.code, ctrlKey: data.ctrl, altKey: data.alt, shiftKey: data.shift }))
}

/** La pagina HTML ha finito di caricarsi (onLoad dell'iframe). */
export function pageLoaded(): void {
  const { runId, summary, events } = quick()
  if (!runId || summary || quick().language !== 'html') return
  quick().addEvents([{ runId, kind: 'done', status: events.some((e) => e.kind === 'error') ? 'error' : 'ok', durationMs: performance.now() - pageStarted }])
}

/** Collega gli eventi del main allo stato e i risultati alle decorazioni dell'editor (una volta sola). */
export function connectRunEvents(): void {
  ide.on('quick:events', (events) => quick().addEvents(events))
  window.addEventListener('message', (event) => {
    const frame = quickFrame()
    if (!frame || event.source !== frame) return
    const data = event.data as PreviewMessage | undefined
    if (data && typeof data === 'object' && data.__ide === 1) handlePageMessage(data)
  })
  useQuick.subscribe((state, previous) => {
    if (state.events === previous.events && state.summary === previous.summary) return
    // Le decorazioni precedenti restano finché non arriva qualcosa dalla nuova esecuzione: niente sfarfallio.
    // Errori di sintassi e di compilazione segnati sulle righe anche in automatico: per C, C++, C#, Java
    // e Rust sono l'unico controllo mentre si scrive (l'elenco a destra li mostra smorzati).
    if (state.events.length > 0 || state.summary) showRunDecorations(state.events, true)
  })
}

/** Testo da eseguire: per SQL la selezione se c'è, altrimenti tutto; per JS/TS sempre tutto (le righe devono combaciare). */
function source(auto: boolean): { text: string; offset: number } | null {
  const editor = quickEditor()
  const model = editor?.getModel()
  if (!editor || !model) return null
  const selection = editor.getSelection()
  if (!auto && quick().language === 'sql' && selection && !selection.isEmpty()) {
    return { text: model.getValueInRange(selection), offset: model.getOffsetAt(selection.getStartPosition()) }
  }
  return { text: model.getValue(), offset: 0 }
}

export async function runQuick(auto = false): Promise<void> {
  cancelAutoRun()
  const code = source(auto)
  if (!code || !code.text.trim()) return
  const language = quick().language
  if (language === 'sql') return runSql(code.text, code.offset, auto)
  const runId = `quick-${Date.now().toString(36)}-${++counter}`
  quick().startRun(runId, auto)
  if (language === 'html') {
    pageStarted = performance.now()
    try {
      quick().setPageUrl(await ide.invoke('quick:page', code.text))
    } catch (error) {
      notifyError(error)
    }
    return
  }
  try {
    const stdin = readsStdin(language) ? (quick().stdin[language] ?? '') : undefined
    await ide.invoke('quick:run', { runId, language, code: code.text, timeoutMs: workbench().settings.quick.timeoutMs, stdin })
  } catch (error) {
    notifyError(error)
  }
}

export function stopQuick(): void {
  const runId = quick().runId
  if (runId && !quick().summary) void ide.invoke('quick:stop', runId)
}

export function isRunning(): boolean {
  const state = quick()
  return state.language === 'sql' ? state.sqlRunning : state.runId !== null && state.summary === null
}

async function runSql(text: string, offset: number, auto: boolean): Promise<void> {
  const settings = workbench().settings.quick
  // Senza database pulito, rieseguire da solo un INSERT duplicherebbe i dati: in automatico solo le letture.
  if (auto && !settings.sqlFresh && !isReadOnlySql(text)) return
  const mine = ++sqlSequence
  const engine = settings.sqlEngine
  quick().setSqlRunning(true)
  const started = performance.now()
  try {
    if (settings.sqlFresh) await ide.invoke('quick:sqlReset', engine, settings.sqlSample)
    const outcomes = await ide.invoke('quick:sql', engine, text)
    if (mine !== sqlSequence) return
    quick().setSql({ outcomes, durationMs: performance.now() - started, auto })
    showSqlDecorations(text, outcomes, offset)
    quick().setSchema(engine, await ide.invoke('quick:sqlSchema', engine))
  } catch (error) {
    if (mine === sqlSequence) notifyError(error)
  } finally {
    if (mine === sqlSequence) quick().setSqlRunning(false)
  }
}

/** Azzera il database in memoria (con i dati d'esempio scelti) e aggiorna lo schema. */
export async function resetSqlDatabase(): Promise<void> {
  const { sqlEngine, sqlSample } = workbench().settings.quick
  try {
    quick().setSchema(sqlEngine, await ide.invoke('quick:sqlReset', sqlEngine, sqlSample))
    quick().setSql(null)
  } catch (error) {
    notifyError(error)
  }
}

export async function loadSqlSchema(): Promise<void> {
  const { sqlEngine, sqlFresh, sqlSample } = workbench().settings.quick
  try {
    // Con il database pulito lo schema "di partenza" è quello dei dati d'esempio.
    const schema = sqlFresh ? await ide.invoke('quick:sqlReset', sqlEngine, sqlSample) : await ide.invoke('quick:sqlSchema', sqlEngine)
    quick().setSchema(sqlEngine, schema)
  } catch (error) {
    notifyError(error)
  }
}

export function scheduleAutoRun(): void {
  cancelAutoRun()
  if (!workbench().settings.quick.autoRun) return
  autoTimer = setTimeout(
    () => {
      autoTimer = null
      void runQuick(true)
    },
    isNativeLanguage(quick().language) ? AUTO_RUN_DELAY_NATIVE : AUTO_RUN_DELAY
  )
}

export function cancelAutoRun(): void {
  if (autoTimer) clearTimeout(autoTimer)
  autoTimer = null
}

/** Compilatori di C, C++, C#, Java e Rust (con `refresh` li cerca di nuovo, es. dopo averne installato uno). */
export async function loadToolchains(refresh = false): Promise<void> {
  try {
    quick().setToolchains(await ide.invoke('quick:toolchains', refresh))
  } catch (error) {
    notifyError(error)
  }
}

/** Prepara il linguaggio scelto: Python carica Pyodide in anticipo, i nativi cercano il compilatore. */
export async function prepareLanguage(language: QuickLanguage): Promise<void> {
  if (language === 'python') await ide.invoke('quick:prepare', 'python').catch(notifyError)
  else if (isNativeLanguage(language) && !quick().toolchains) await loadToolchains()
}