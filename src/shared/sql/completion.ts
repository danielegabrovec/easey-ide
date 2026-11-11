// Suggerimenti SQL (tabelle, colonne, alias, parole chiave, modelli) calcolati dallo schema del database.
// Puro: lo usano il SQL Lab e la Scrittura rapida, che lo traducono in suggerimenti di Monaco.
import type { DbSchema } from '../contracts/db'
import { splitStatements } from './split'

export const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS NULL', 'IS NOT NULL', 'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET',
  'JOIN', 'LEFT JOIN', 'INNER JOIN', 'ON', 'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM',
  'CREATE TABLE', 'ALTER TABLE', 'ADD COLUMN', 'DROP TABLE', 'PRIMARY KEY', 'FOREIGN KEY', 'REFERENCES', 'UNIQUE', 'NOT NULL', 'DEFAULT', 'CHECK',
  'CREATE INDEX', 'CREATE VIEW', 'UNION', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'ASC', 'DESC', 'BEGIN', 'COMMIT', 'ROLLBACK'
]

/** Modelli per scrivere in fretta (sintassi degli snippet di Monaco: ${1:segnaposto}). */
export const SQL_SNIPPETS: { label: string; detail: string; body: string }[] = [
  { label: 'sel', detail: 'SELECT … FROM …', body: 'SELECT ${2:*}\nFROM ${1:tabella}\n${0}' },
  { label: 'selw', detail: 'SELECT … FROM … WHERE …', body: 'SELECT ${2:*}\nFROM ${1:tabella}\nWHERE ${3:condizione};' },
  { label: 'join', detail: 'SELECT con JOIN', body: 'SELECT ${4:*}\nFROM ${1:tabella} ${2:a}\nJOIN ${3:altra} ${5:b} ON ${5:b}.${6:id} = ${2:a}.${7:id_altra};' },
  { label: 'group', detail: 'Conteggio per gruppo', body: 'SELECT ${2:colonna}, COUNT(*) AS totale\nFROM ${1:tabella}\nGROUP BY ${2:colonna}\nORDER BY totale DESC;' },
  { label: 'ins', detail: 'INSERT INTO … VALUES …', body: 'INSERT INTO ${1:tabella} (${2:colonne})\nVALUES (${3:valori});' },
  { label: 'upd', detail: 'UPDATE … SET … WHERE …', body: 'UPDATE ${1:tabella}\nSET ${2:colonna} = ${3:valore}\nWHERE ${4:condizione};' },
  { label: 'create', detail: 'CREATE TABLE', body: 'CREATE TABLE ${1:tabella} (\n  id INTEGER PRIMARY KEY,\n  ${2:nome} TEXT NOT NULL${0}\n);' }
]

export type SqlSuggestionKind = 'table' | 'view' | 'column' | 'keyword' | 'snippet'

export interface SqlSuggestion {
  label: string
  kind: SqlSuggestionKind
  detail?: string
  insertText: string
  /** true: insertText è uno snippet con segnaposto. */
  snippet?: boolean
  sortText: string
}

/** Alias definiti nella query: "FROM clienti c" / "JOIN ordini AS o". */
export function aliasesIn(text: string): Map<string, string> {
  const map = new Map<string, string>()
  const pattern = /\b(?:FROM|JOIN)\s+([A-Za-z_][\w]*)(?:\s+(?:AS\s+)?([A-Za-z_][\w]*))?/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    const table = match[1]!
    const alias = match[2]
    map.set(table.toLowerCase(), table)
    if (alias && !/^(WHERE|JOIN|LEFT|INNER|ON|GROUP|ORDER|LIMIT|RIGHT|CROSS|FULL)$/i.test(alias)) map.set(alias.toLowerCase(), table)
  }
  return map
}

/**
 * Suggerimenti per il punto in cui si scrive. `lineBefore` = testo della riga prima della parola corrente
 * (per riconoscere "alias."), `fullText` = tutta la query (per gli alias).
 */
export function sqlSuggestions(lineBefore: string, fullText: string, schema: DbSchema | null | undefined, options: { snippets?: boolean } = {}): SqlSuggestion[] {
  const tables = schema?.tables ?? []
  const qualifier = /([A-Za-z_][\w]*)\.$/.exec(lineBefore)?.[1]
  if (qualifier) {
    const target = aliasesIn(fullText).get(qualifier.toLowerCase()) ?? qualifier
    const table = tables.find((t) => t.name.toLowerCase() === target.toLowerCase())
    return (table?.columns ?? []).map((c) => ({ label: c.name, kind: 'column', detail: `${c.type}${c.primaryKey ? ' · PK' : ''}`, insertText: c.name, sortText: `0${c.name}` }))
  }
  return [
    ...tables.map((t): SqlSuggestion => ({ label: t.name, kind: t.kind, detail: `${t.kind === 'view' ? 'vista' : 'tabella'} · ${t.rowCount ?? '?'} righe`, insertText: t.name, sortText: `0${t.name}` })),
    ...tables.flatMap((t) => t.columns.map((c): SqlSuggestion => ({ label: c.name, kind: 'column', detail: `${t.name} · ${c.type}`, insertText: c.name, sortText: `1${c.name}` }))),
    ...(options.snippets ? SQL_SNIPPETS.map((s): SqlSuggestion => ({ label: s.label, kind: 'snippet', detail: s.detail, insertText: s.body, snippet: true, sortText: `2${s.label}` })) : []),
    ...SQL_KEYWORDS.map((k): SqlSuggestion => ({ label: k, kind: 'keyword', insertText: k, sortText: `3${k}` }))
  ]
}

/** Riassunto dello schema come commenti SQL: contesto per l'AI (tabelle e colonne). */
export function schemaComment(schema: DbSchema | null | undefined, maxChars = 1500): string {
  if (!schema?.tables.length) return ''
  const lines = schema.tables.map((t) => `-- ${t.name}(${t.columns.map((c) => `${c.name} ${c.type}${c.primaryKey ? ' PK' : ''}`).join(', ')})`)
  let out = `-- Database ${schema.engine === 'postgres' ? 'PostgreSQL' : 'SQLite'}, tabelle:\n`
  for (const line of lines) {
    if (out.length + line.length > maxChars) break
    out += `${line}\n`
  }
  return out
}

/** true se lo script solo legge (SELECT, WITH, EXPLAIN…): si può rieseguire da solo senza duplicare dati. */
export function isReadOnlySql(sql: string): boolean {
  const statements = splitStatements(sql)
  return statements.length > 0 && statements.every(({ text }) => /^\s*(SELECT|WITH|EXPLAIN|VALUES|SHOW|PRAGMA\s+(table_info|index_list|foreign_key_list)\b)/i.test(text.replace(/^(\s*--[^\n]*\n)+/, '')) && !/^\s*WITH[\s\S]*\b(INSERT|UPDATE|DELETE)\b/i.test(text))
}
