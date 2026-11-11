// Logica pura della verifica degli esercizi: confronto di valori, di result set SQL e regole HTML/CSS.
// L'esecuzione vera (vm per JS/TS, SQLite in memoria, iframe per HTML) sta in main/renderer.
import type { CheckItem, CheckResult, HtmlRule } from '../contracts/learn'

/** Riduce un valore a JSON puro (va bene anche per oggetti nati in un altro contesto vm). */
export function plain(value: unknown): unknown {
  if (value === undefined) return undefined
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value)
  try {
    return JSON.parse(JSON.stringify(value)) as unknown
  } catch {
    return String(value)
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    const other = b as unknown[]
    return a.length === other.length && a.every((item, i) => deepEqual(item, other[i]))
  }
  const ka = Object.keys(a as object)
  const kb = Object.keys(b as object)
  return ka.length === kb.length && ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

export function valuesEqual(actual: unknown, expected: unknown): boolean {
  return deepEqual(plain(actual), plain(expected))
}

export function describeValue(value: unknown): string {
  if (value === undefined) return 'undefined'
  const text = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(plain(value))
  return text === undefined ? String(value) : text.length > 160 ? text.slice(0, 157) + '…' : text
}

export function summarize(items: CheckItem[], extra: Partial<CheckResult> = {}): CheckResult {
  return { passed: !extra.error && items.length > 0 && items.every((i) => i.ok), items, ...extra }
}

// ---------- SQL ----------

export interface ResultSet {
  columns: string[]
  rows: unknown[][]
}

const cellKey = (value: unknown): string => {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 1e6) / 1e6)
  if (typeof value === 'bigint') return value.toString()
  return String(value)
}
const rowKey = (row: unknown[]) => row.map(cellKey).join('␟')

/** Confronta il risultato dello studente con quello della soluzione (nomi di colonna non vincolanti). */
export function compareResultSets(actual: ResultSet, expected: ResultSet, ordered: boolean): CheckItem[] {
  const items: CheckItem[] = []
  const columnsOk = actual.columns.length === expected.columns.length
  items.push({
    descrizione: `Colonne: ${expected.columns.length}`,
    ok: columnsOk,
    dettaglio: columnsOk ? undefined : `ottenute ${actual.columns.length} (${actual.columns.join(', ')}), attese ${expected.columns.length} (${expected.columns.join(', ')})`
  })
  const countOk = actual.rows.length === expected.rows.length
  items.push({ descrizione: `Righe: ${expected.rows.length}`, ok: countOk, dettaglio: countOk ? undefined : `ottenute ${actual.rows.length}` })
  if (columnsOk) {
    const a = actual.rows.map(rowKey)
    const e = expected.rows.map(rowKey)
    if (!ordered) {
      a.sort()
      e.sort()
    }
    const firstDiff = e.findIndex((key, i) => key !== a[i])
    const same = countOk && firstDiff < 0
    items.push({
      descrizione: ordered ? 'Stessi dati nello stesso ordine' : 'Stessi dati (in qualsiasi ordine)',
      ok: same,
      dettaglio: same ? undefined : firstDiff >= 0 ? `prima differenza alla riga ${firstDiff + 1}: attesa ${(e[firstDiff] ?? '—').replace(/␟/g, ' | ')}, ottenuta ${(a[firstDiff] ?? '—').replace(/␟/g, ' | ')}` : undefined
    })
  }
  return items
}

// ---------- HTML / CSS ----------

/** Quel poco di DOM che serve alle regole (in produzione: il documento di un iframe; nei test: jsdom). */
export interface DomProbe<E = unknown> {
  query(selector: string): E[]
  text(element: E): string
  attribute(element: E, name: string): string | null
  computed(element: E, property: string): string
  /** Valore CSS atteso nella stessa forma del calcolato (es. "red" → "rgb(255, 0, 0)"). */
  normalize(property: string, value: string): string
}

export function checkHtmlRules<E>(rules: HtmlRule[], dom: DomProbe<E>): CheckResult {
  const items: CheckItem[] = rules.map((rule) => {
    let elements: E[]
    try {
      elements = dom.query(rule.selettore)
    } catch {
      return { descrizione: rule.descrizione, ok: false, dettaglio: `selettore non valido: ${rule.selettore}` }
    }
    const min = rule.minimo ?? 1
    if (elements.length < min) return { descrizione: rule.descrizione, ok: false, dettaglio: `trovati ${elements.length} «${rule.selettore}», ne servono almeno ${min}` }
    if (rule.massimo !== undefined && elements.length > rule.massimo)
      return { descrizione: rule.descrizione, ok: false, dettaglio: `trovati ${elements.length} «${rule.selettore}», al massimo ${rule.massimo}` }
    const first = elements[0]
    if (first === undefined) return { descrizione: rule.descrizione, ok: true }
    if (rule.testo !== undefined) {
      const wanted = rule.testo.toLowerCase()
      const found = elements.some((el) => dom.text(el).toLowerCase().includes(wanted))
      if (!found) return { descrizione: rule.descrizione, ok: false, dettaglio: `nessun «${rule.selettore}» contiene «${rule.testo}»` }
    }
    if (rule.attributo) {
      const { nome, valore } = rule.attributo
      const ok = elements.some((el) => {
        const value = dom.attribute(el, nome)
        return value !== null && (valore === undefined || value.trim() === valore)
      })
      if (!ok) return { descrizione: rule.descrizione, ok: false, dettaglio: valore === undefined ? `manca l'attributo ${nome}` : `${nome} dovrebbe valere «${valore}»` }
    }
    for (const [property, expected] of Object.entries(rule.stile ?? {})) {
      const want = dom.normalize(property, expected)
      const ok = elements.some((el) => dom.computed(el, property) === want)
      if (!ok) return { descrizione: rule.descrizione, ok: false, dettaglio: `${property}: è «${dom.computed(first, property)}», atteso «${expected}»` }
    }
    return { descrizione: rule.descrizione, ok: true }
  })
  return summarize(items)
}

/** Unisce HTML e CSS del progetto in un documento statico (niente script: si verifica la struttura). */
export function inlineDocument(html: string, files: Record<string, string>, baseDir = ''): string {
  const resolve = (href: string) => {
    const clean = href.replace(/^\.\//, '').split(/[?#]/)[0]!
    return baseDir ? `${baseDir}/${clean}` : clean
  }
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<link\b[^>]*>/gi, (tag) => {
      if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) return tag
      const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]
      const css = href ? files[resolve(href)] : undefined
      return css === undefined ? tag : `<style>\n${css}\n</style>`
    })
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
}
