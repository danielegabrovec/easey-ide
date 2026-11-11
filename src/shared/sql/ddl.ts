// Generazione di DDL (CREATE TABLE, ALTER TABLE, DROP) dal designer delle tabelle, per ogni dialetto.
import type { DbColumn, DbSchema, DbTable, SqlDialect } from '../contracts/db'

export interface ColumnDraft {
  name: string
  type: string
  primaryKey: boolean
  autoIncrement: boolean
  notNull: boolean
  unique: boolean
  defaultValue: string
  /** "tabella.colonna" o '' */
  references: string
}

export interface TableDraft {
  name: string
  columns: ColumnDraft[]
}

export const COLUMN_TYPES: Record<SqlDialect, string[]> = {
  sqlite: ['INTEGER', 'TEXT', 'REAL', 'NUMERIC', 'BLOB', 'DATE', 'DATETIME', 'BOOLEAN'],
  postgres: ['INTEGER', 'BIGINT', 'SMALLINT', 'SERIAL', 'TEXT', 'VARCHAR(100)', 'NUMERIC(10,2)', 'REAL', 'BOOLEAN', 'DATE', 'TIMESTAMP', 'JSONB', 'UUID']
}

export function emptyColumn(): ColumnDraft {
  return { name: '', type: 'TEXT', primaryKey: false, autoIncrement: false, notNull: false, unique: false, defaultValue: '', references: '' }
}

const RESERVED = new Set(['select', 'from', 'where', 'table', 'order', 'group', 'user', 'index', 'key', 'default', 'check', 'primary', 'references', 'limit', 'offset', 'join', 'values', 'insert', 'update', 'delete', 'create', 'drop', 'by', 'to', 'as', 'and', 'or', 'not', 'null', 'in', 'is', 'on'])

/** Racchiude un identificatore fra virgolette solo se serve (spazi, maiuscole in PG, parole riservate). */
export function quoteIdent(name: string, dialect: SqlDialect): string {
  const simple = /^[a-z_][a-z0-9_]*$/.test(name) || (dialect === 'sqlite' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
  if (simple && !RESERVED.has(name.toLowerCase())) return name
  return `"${name.replace(/"/g, '""')}"`
}

export function validateDraft(draft: TableDraft, existing: string[]): string[] {
  const errors: string[] = []
  if (!draft.name.trim()) errors.push('La tabella deve avere un nome.')
  else if (existing.some((t) => t.toLowerCase() === draft.name.trim().toLowerCase())) errors.push(`Esiste già una tabella "${draft.name.trim()}".`)
  const columns = draft.columns.filter((c) => c.name.trim())
  if (columns.length === 0) errors.push('Serve almeno una colonna.')
  const seen = new Set<string>()
  for (const column of columns) {
    const key = column.name.trim().toLowerCase()
    if (seen.has(key)) errors.push(`Colonna ripetuta: "${column.name.trim()}".`)
    seen.add(key)
    if (column.references && !/^[^.]+\.[^.]+$/.test(column.references)) errors.push(`Riferimento non valido per "${column.name}": usa tabella.colonna.`)
  }
  if (columns.filter((c) => c.primaryKey).length > 1 && columns.some((c) => c.autoIncrement)) errors.push('L’incremento automatico vale solo con una chiave primaria semplice.')
  return errors
}

function columnType(column: ColumnDraft, dialect: SqlDialect, singlePk: boolean): string {
  if (column.autoIncrement && column.primaryKey && singlePk) {
    if (dialect === 'sqlite') return 'INTEGER'
    return /BIGINT/i.test(column.type) ? 'BIGSERIAL' : 'SERIAL'
  }
  return column.type.trim() || 'TEXT'
}

function defaultClause(value: string): string {
  const v = value.trim()
  if (!v) return ''
  if (/^-?\d+(\.\d+)?$/.test(v) || /^(true|false|null|current_(date|time|timestamp)|now\(\))$/i.test(v) || /^'.*'$/.test(v) || /^\(.*\)$/.test(v)) return ` DEFAULT ${v}`
  return ` DEFAULT '${v.replace(/'/g, "''")}'`
}

export function createTableSql(draft: TableDraft, dialect: SqlDialect): string {
  const columns = draft.columns.filter((c) => c.name.trim())
  const pks = columns.filter((c) => c.primaryKey)
  const singlePk = pks.length === 1
  const lines: string[] = []
  for (const column of columns) {
    let line = `  ${quoteIdent(column.name.trim(), dialect)} ${columnType(column, dialect, singlePk)}`
    if (column.primaryKey && singlePk) {
      line += ' PRIMARY KEY'
      if (column.autoIncrement && dialect === 'sqlite') line += ' AUTOINCREMENT'
    }
    if (column.notNull && !(column.primaryKey && singlePk)) line += ' NOT NULL'
    if (column.unique && !column.primaryKey) line += ' UNIQUE'
    line += defaultClause(column.defaultValue)
    lines.push(line)
  }
  if (pks.length > 1) lines.push(`  PRIMARY KEY (${pks.map((c) => quoteIdent(c.name.trim(), dialect)).join(', ')})`)
  for (const column of columns.filter((c) => c.references)) {
    const [table, refColumn] = column.references.split('.')
    lines.push(`  FOREIGN KEY (${quoteIdent(column.name.trim(), dialect)}) REFERENCES ${quoteIdent(table!, dialect)} (${quoteIdent(refColumn!, dialect)})`)
  }
  return `CREATE TABLE ${quoteIdent(draft.name.trim(), dialect)} (\n${lines.join(',\n')}\n);`
}

export function addColumnSql(table: string, column: ColumnDraft, dialect: SqlDialect): string {
  let sql = `ALTER TABLE ${quoteIdent(table, dialect)} ADD COLUMN ${quoteIdent(column.name.trim(), dialect)} ${column.type.trim() || 'TEXT'}`
  if (column.notNull) sql += ' NOT NULL'
  sql += defaultClause(column.defaultValue)
  if (column.references) {
    const [refTable, refColumn] = column.references.split('.')
    sql += ` REFERENCES ${quoteIdent(refTable!, dialect)} (${quoteIdent(refColumn!, dialect)})`
  }
  return `${sql};`
}

export function dropTableSql(table: string, dialect: SqlDialect): string {
  return `DROP TABLE ${quoteIdent(table, dialect)};`
}

/** Bozza modificabile ricavata da una tabella esistente (per "Duplica struttura" o per vedere il DDL). */
export function draftFromTable(table: DbTable): TableDraft {
  return {
    name: table.name,
    columns: table.columns.map((c: DbColumn) => {
      const fk = table.foreignKeys.find((f) => f.column === c.name)
      return {
        name: c.name,
        type: c.type,
        primaryKey: c.primaryKey,
        autoIncrement: false,
        notNull: c.notNull,
        unique: c.unique,
        defaultValue: c.defaultValue ?? '',
        references: fk ? `${fk.refTable}.${fk.refColumn}` : ''
      }
    })
  }
}

/** DDL completo dello schema: contesto per l'AI e per il comando ".schema". */
export function schemaToDdl(schema: DbSchema): string {
  return schema.tables
    .filter((t) => t.kind === 'table')
    .map((t) => createTableSql(draftFromTable(t), schema.engine))
    .join('\n\n')
}
