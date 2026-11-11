// Entità ER nei diagrammi: stesso modello del designer di tabelle del SQL Lab (TableDraft),
// così un diagramma disegnato a mano diventa CREATE TABLE e un database esistente diventa diagramma.
//
// Testo di una tabella:   clienti
//                         id INTEGER PK
//                         nome TEXT NN
//                         email TEXT UQ
//                         gruppo_id INTEGER FK gruppi.id
import type { DbSchema, SqlDialect } from '../contracts/db'
import { createTableSql, emptyColumn, type TableDraft } from '../sql/ddl'
import { newId, type Diagram, type DiagramEdge, type DiagramNode } from './model'

export interface TableText {
  name: string
  columns: (TableDraft['columns'][number] & { references: string })[]
}

export function parseTableText(text: string): TableText {
  const [first, ...rest] = text.split('\n').map((l) => l.trim())
  const columns = rest
    .filter(Boolean)
    .map((line) => {
      const tokens = line.split(/\s+/)
      const column = { ...emptyColumn(), name: tokens[0] ?? '', type: '' }
      const typeParts: string[] = []
      for (let i = 1; i < tokens.length; i++) {
        const token = tokens[i]!
        const upper = token.toUpperCase()
        if (upper === 'PK') column.primaryKey = true
        else if (upper === 'AI' || upper === 'AUTO') column.autoIncrement = true
        else if (upper === 'NN') column.notNull = true
        else if (upper === 'UQ') column.unique = true
        else if (upper === 'FK' || upper === 'FK→' || upper === '→') column.references = (tokens[++i] ?? '').replace(/^→/, '')
        else if (upper.startsWith('FK→')) column.references = token.slice(3)
        else typeParts.push(token)
      }
      column.type = typeParts.join(' ') || 'TEXT'
      return column
    })
    .filter((c) => c.name)
  return { name: (first ?? '').replace(/\s+/g, '_') || 'tabella', columns }
}

export function tableText(table: TableText): string {
  return [table.name, ...table.columns.map((c) => [c.name, c.type, c.primaryKey ? 'PK' : '', c.autoIncrement ? 'AI' : '', c.notNull && !c.primaryKey ? 'NN' : '', c.unique ? 'UQ' : '', c.references ? `FK ${c.references}` : ''].filter(Boolean).join(' '))].join('\n')
}

/** CREATE TABLE di tutte le entità del diagramma, in ordine di dipendenza (prima le tabelle riferite). */
export function diagramToDdl(diagram: Diagram, dialect: SqlDialect): string {
  const tables = diagram.nodes.filter((n) => n.shape === 'tabella').map((n) => parseTableText(n.text))
  const ordered: TableText[] = []
  const pending = [...tables]
  while (pending.length) {
    const index = pending.findIndex((t) => t.columns.every((c) => !c.references || c.references.split('.')[0] === t.name || ordered.some((o) => o.name === c.references.split('.')[0]) || !tables.some((x) => x.name === c.references.split('.')[0])))
    ordered.push(...pending.splice(index >= 0 ? index : 0, 1))
  }
  return ordered.map((t) => createTableSql({ name: t.name, columns: t.columns }, dialect)).join('\n\n') + '\n'
}

/** Diagramma ER da uno schema reale (SQL Lab). */
export function schemaToDiagram(schema: DbSchema): Diagram {
  const nodes: DiagramNode[] = schema.tables
    .filter((t) => t.kind === 'table')
    .map((table, index) => {
      const text = tableText({
        name: table.name,
        columns: table.columns.map((c) => {
          const fk = table.foreignKeys.find((f) => f.column === c.name)
          return { ...emptyColumn(), name: c.name, type: c.type, primaryKey: c.primaryKey, notNull: c.notNull, unique: c.unique, references: fk ? `${fk.refTable}.${fk.refColumn}` : '' }
        })
      })
      return { id: `tab-${table.name}`, shape: 'tabella', x: (index % 3) * 280, y: Math.floor(index / 3) * 240, width: 220, height: 40 + table.columns.length * 20, text }
    })
  const edges: DiagramEdge[] = schema.tables.flatMap((table) =>
    table.foreignKeys
      .filter((fk) => nodes.some((n) => n.id === `tab-${fk.refTable}`))
      .map((fk) => ({ id: newId('rel'), source: `tab-${table.name}`, target: `tab-${fk.refTable}`, label: `${fk.column} → ${fk.refColumn}`, routing: 'ortogonale' as const, arrow: 'fine' as const }))
  )
  return { kind: 'diagramma', version: 1, type: 'er', nodes, edges }
}

/** Collegamenti dedotti dalle chiavi esterne scritte nelle tabelle (per tenere il disegno coerente col testo). */
export function inferredRelations(diagram: Diagram): { source: string; target: string; label: string }[] {
  const byName = new Map(diagram.nodes.filter((n) => n.shape === 'tabella').map((n) => [parseTableText(n.text).name, n.id]))
  return diagram.nodes
    .filter((n) => n.shape === 'tabella')
    .flatMap((n) =>
      parseTableText(n.text)
        .columns.filter((c) => c.references && byName.has(c.references.split('.')[0]!))
        .map((c) => ({ source: n.id, target: byName.get(c.references.split('.')[0]!)!, label: `${c.name} → ${c.references.split('.')[1] ?? ''}` }))
    )
}
