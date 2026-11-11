// Completamento SQL nell'editor Monaco con le tabelle e le colonne vere del database attivo.
import * as monaco from 'monaco-editor'
import { useSql } from './sql-store'

const KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS NULL', 'IS NOT NULL', 'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET',
  'JOIN', 'LEFT JOIN', 'INNER JOIN', 'ON', 'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM',
  'CREATE TABLE', 'ALTER TABLE', 'ADD COLUMN', 'DROP TABLE', 'PRIMARY KEY', 'FOREIGN KEY', 'REFERENCES', 'UNIQUE', 'NOT NULL', 'DEFAULT', 'CHECK',
  'CREATE INDEX', 'CREATE VIEW', 'UNION', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'ASC', 'DESC', 'BEGIN', 'COMMIT', 'ROLLBACK'
]

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

export function registerSqlCompletion(): monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.', ' '],
    provideCompletionItems(model, position) {
      const schema = useSql.getState().schemas[useSql.getState().activeId]
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
      const before = model.getValueInRange(new monaco.Range(position.lineNumber, 1, position.lineNumber, word.startColumn))
      const qualifier = /([A-Za-z_][\w]*)\.$/.exec(before)?.[1]
      const tables = schema?.tables ?? []
      const K = monaco.languages.CompletionItemKind
      if (qualifier) {
        const target = aliasesIn(model.getValue()).get(qualifier.toLowerCase()) ?? qualifier
        const table = tables.find((t) => t.name.toLowerCase() === target.toLowerCase())
        return { suggestions: (table?.columns ?? []).map((c) => ({ label: c.name, kind: K.Field, detail: `${c.type}${c.primaryKey ? ' · PK' : ''}`, insertText: c.name, range })) }
      }
      const suggestions: monaco.languages.CompletionItem[] = [
        ...tables.map((t) => ({ label: t.name, kind: t.kind === 'view' ? K.Interface : K.Struct, detail: `${t.kind === 'view' ? 'vista' : 'tabella'} · ${t.rowCount ?? '?'} righe`, insertText: t.name, range, sortText: `0${t.name}` })),
        ...tables.flatMap((t) => t.columns.map((c) => ({ label: c.name, kind: K.Field, detail: `${t.name} · ${c.type}`, insertText: c.name, range, sortText: `1${c.name}` }))),
        ...KEYWORDS.map((k) => ({ label: k, kind: K.Keyword, insertText: k, range, sortText: `2${k}` }))
      ]
      return { suggestions }
    }
  })
}
