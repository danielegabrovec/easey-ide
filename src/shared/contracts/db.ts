// Contratto dei database del SQL Lab. Un motore = un DbDriver nel main; l'interfaccia utente
// non sa quale motore c'è sotto, salvo per il dialetto SQL (SqlDialect).

/** sqlite = file .db nel progetto (node:sqlite); postgres = PostgreSQL incorporato (PGlite). */
export type DbEngine = 'sqlite' | 'postgres'
export type SqlDialect = DbEngine

export interface DbConnectionInfo {
  /** Identificativo stabile: `<motore>:<percorso relativo>` (es. "sqlite:dati/negozio.db"). */
  id: string
  engine: DbEngine
  name: string
  /** Percorso relativo al progetto (file .db o cartella dati di PostgreSQL). */
  path: string
}

export type CellValue = string | number | boolean | null

export interface QueryResult {
  kind: 'result'
  statement: string
  columns: string[]
  rows: CellValue[][]
  /** Righe modificate da INSERT/UPDATE/DELETE. */
  changes: number
  /** true se ci sono più righe di quelle restituite (limite di visualizzazione). */
  truncated: boolean
  durationMs: number
}

export interface QueryError {
  kind: 'error'
  statement: string
  message: string
}

export type QueryOutcome = QueryResult | QueryError

export interface DbColumn {
  name: string
  type: string
  notNull: boolean
  defaultValue: string | null
  primaryKey: boolean
  unique: boolean
}

export interface DbForeignKey {
  column: string
  refTable: string
  refColumn: string
}

export interface DbIndex {
  name: string
  columns: string[]
  unique: boolean
}

export interface DbTable {
  name: string
  kind: 'table' | 'view'
  columns: DbColumn[]
  foreignKeys: DbForeignKey[]
  indexes: DbIndex[]
  rowCount: number | null
}

export interface DbSchema {
  engine: DbEngine
  tables: DbTable[]
}

export interface PlanNode {
  id: string
  parent: string | null
  detail: string
  /** Valutazione didattica: scansione completa (lenta su tabelle grandi) o uso di un indice. */
  hint: 'scan' | 'index' | 'other'
}

export interface QueryPlan {
  engine: DbEngine
  nodes: PlanNode[]
  /** Testo grezzo del piano (JSON per PostgreSQL). */
  raw: string
}

export interface DbSnapshot {
  id: string
  at: number
}

export interface CreateDatabaseRequest {
  engine: DbEngine
  name: string
  /** Dati d'esempio da caricare (vedi src/shared/sql/samples.ts) o nulla. */
  sample: string | null
}

/** Limite di righe inviate all'interfaccia per ogni risultato. */
export const MAX_RESULT_ROWS = 2000

/** Motore nativo nel main (sqlite-driver.ts, pglite-driver.ts). */
export interface DbDriver {
  readonly engine: DbEngine
  execute(sql: string): Promise<QueryOutcome[]>
  schema(): Promise<DbSchema>
  explain(sql: string): Promise<QueryPlan>
  close(): Promise<void>
}
