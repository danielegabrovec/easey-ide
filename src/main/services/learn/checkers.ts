// Verifica automatica degli esercizi JS/TS e SQL (nel main; HTML/CSS si verifica nel renderer).
//
// JS/TS: il file principale viene impacchettato con esbuild (formato cjs, così le funzioni di primo
// livello restano visibili per nome) ed eseguito in un contesto `vm` con console catturata e tempo
// massimo. `vm` non è una barriera di sicurezza: è il codice dello studente, come nel terminale.
// SQL: database SQLite in memoria = setup dell'esercizio + query dello studente, confrontata con la soluzione.
import { inspect } from 'node:util'
import { join } from 'node:path'
import vm from 'node:vm'
import type { CheckItem, CheckResult, JsTest } from '@shared/contracts/learn'
import { compareResultSets, describeValue, summarize, valuesEqual, type ResultSet } from '@shared/learn/checks'
import { loadEsbuild } from '../esbuild-loader'
import { SqliteDriver } from '../db/sqlite-driver'

const TIMEOUT_MS = 3000

function format(args: unknown[]): string {
  return args.map((a) => (typeof a === 'string' ? a : inspect(a, { depth: 4, breakLength: 100 }))).join(' ')
}

function compileError(error: unknown): string {
  const errors = (error as { errors?: { text: string; location?: { file: string; line: number; column: number } | null }[] }).errors
  if (errors?.length)
    return errors
      .slice(0, 5)
      .map((e) => (e.location ? `${e.location.file.split(/[\\/]/).pop()}:${e.location.line}:${e.location.column + 1} — ${e.text}` : e.text))
      .join('\n')
  return (error as Error).message ?? String(error)
}

function runtimeError(error: unknown): string {
  const e = error as Error & { code?: string }
  if (e?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') return `Tempo scaduto (${TIMEOUT_MS / 1000} s): forse un ciclo infinito?`
  return e?.name && e?.message ? `${e.name}: ${e.message}` : String(error)
}

async function settle(value: unknown): Promise<unknown> {
  if (!value || typeof (value as Promise<unknown>).then !== 'function') return value
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      value as Promise<unknown>,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`la promessa non si è risolta entro ${TIMEOUT_MS / 1000} s`)), TIMEOUT_MS)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

export async function checkJs(dir: string, entry: string, tests: JsTest[]): Promise<CheckResult> {
  const esbuild = await loadEsbuild()
  let code: string
  try {
    const result = await esbuild.build({
      entryPoints: [join(dir, entry)],
      bundle: true,
      write: false,
      format: 'cjs',
      platform: 'node',
      target: 'es2022',
      // Le funzioni non esportate e mai chiamate devono restare: la verifica le usa per nome.
      treeShaking: false,
      logLevel: 'silent'
    })
    code = result.outputFiles[0]!.text
  } catch (error) {
    return { passed: false, items: [], error: compileError(error) }
  }

  const logs: string[] = []
  const log = (...args: unknown[]) => void logs.push(format(args))
  const module = { exports: {} as Record<string, unknown> }
  const timers = new Set<NodeJS.Timeout>()
  const context = vm.createContext({
    console: { log, info: log, warn: log, error: log, debug: log, table: log },
    module,
    exports: module.exports,
    require: (name: string) => {
      throw new Error(`durante la verifica non si possono caricare moduli («${name}»)`)
    },
    setTimeout: (fn: () => void, ms?: number) => {
      const handle = setTimeout(() => {
        timers.delete(handle)
        fn()
      }, Math.min(ms ?? 0, TIMEOUT_MS))
      timers.add(handle)
      return handle
    },
    clearTimeout: (handle: NodeJS.Timeout) => {
      clearTimeout(handle)
      timers.delete(handle)
    },
    queueMicrotask,
    structuredClone
  })
  const output = () => logs.join('\n')
  try {
    vm.runInContext(code, context, { timeout: TIMEOUT_MS, filename: entry })
  } catch (error) {
    timers.forEach(clearTimeout)
    return { passed: false, items: [], error: runtimeError(error), output: output() }
  }

  const items: CheckItem[] = []
  for (const test of tests) {
    if (test.espressione !== undefined) {
      try {
        const value = await settle(vm.runInContext(`(${test.espressione})`, context, { timeout: TIMEOUT_MS }))
        const ok = valuesEqual(value, test.atteso)
        items.push({ descrizione: test.descrizione, ok, dettaglio: ok ? undefined : `${test.espressione} → ${describeValue(value)}, atteso ${describeValue(test.atteso)}` })
      } catch (error) {
        items.push({ descrizione: test.descrizione, ok: false, dettaglio: `${test.espressione} → ${runtimeError(error)}` })
      }
    } else if (test.output !== undefined) {
      // Lascia finire i timer brevi prima di guardare l'output.
      await new Promise((resolve) => setTimeout(resolve, 30))
      const ok = output().includes(test.output)
      items.push({ descrizione: test.descrizione, ok, dettaglio: ok ? undefined : `nell'output manca «${test.output}»` })
    }
  }
  timers.forEach(clearTimeout)
  return summarize(items, { output: output() })
}

/** Esegue uno script e restituisce l'ultimo risultato con colonne (o l'errore). */
async function lastResult(driver: SqliteDriver, sql: string): Promise<ResultSet | { error: string }> {
  const outcomes = await driver.execute(sql)
  const failed = outcomes.find((o) => o.kind === 'error')
  if (failed && failed.kind === 'error') return { error: `${failed.message}\n→ ${failed.statement.slice(0, 200)}` }
  const results = outcomes.filter((o) => o.kind === 'result' && o.columns.length > 0)
  const last = results[results.length - 1]
  if (!last || last.kind !== 'result') return { error: 'nessuna istruzione restituisce righe (manca una SELECT?)' }
  return { columns: last.columns, rows: last.rows }
}

export async function checkSql(setup: string, studentSql: string, solutionSql: string, ordered: boolean): Promise<CheckResult> {
  if (!studentSql.replace(/--.*$/gm, '').trim()) return { passed: false, items: [], error: 'Il file è vuoto: scrivi la query.' }
  const run = async (sql: string) => {
    const driver = new SqliteDriver(':memory:')
    try {
      if (setup.trim()) {
        const prepared = await driver.execute(setup)
        const broken = prepared.find((o) => o.kind === 'error')
        if (broken && broken.kind === 'error') throw new Error(`setup dell'esercizio non valido: ${broken.message}`)
      }
      return await lastResult(driver, sql)
    } finally {
      await driver.close()
    }
  }
  const expected = await run(solutionSql)
  if ('error' in expected) return { passed: false, items: [], error: `Soluzione dell'esercizio non valida: ${expected.error}` }
  const actual = await run(studentSql)
  if ('error' in actual) return { passed: false, items: [], error: actual.error }
  return summarize(compareResultSets(actual, expected, ordered), {
    output: [actual.columns.join(' | '), ...actual.rows.slice(0, 20).map((r) => r.map((c) => (c === null ? 'NULL' : String(c))).join(' | '))].join('\n')
  })
}
