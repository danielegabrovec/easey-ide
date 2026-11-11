// Motore SQLite con il modulo `node:sqlite` incluso in Node/Electron (nessun modulo nativo da compilare).
import { DatabaseSync } from 'node:sqlite'
import { performance } from 'node:perf_hooks'
import { MAX_RESULT_ROWS, type CellValue, type DbDriver, type DbSchema, type DbTable, type PlanNode, type QueryOutcome, type QueryPlan } from '@shared/contracts/db'
import { splitStatements } from '@shared/sql/split'
import { errorMessage, normalizeValue } from './values'

const q = (name: string) => `"${name.replace(/"/g, '""')}"`

export function sqliteHint(detail: string): PlanNode['hint'] {
  if (/USING (COVERING )?INDEX|USING INTEGER PRIMARY KEY|USING PRIMARY KEY/i.test(detail)) return 'index'
  if (/^SCAN\b/i.test(detail)) return 'scan'
  return 'other'
}

export class SqliteDriver implements DbDriver {
  readonly engine = 'sqlite' as const
  private readonly db: DatabaseSync

  constructor(location: string) {
    this.db = new DatabaseSync(location)
    this.db.exec('PRAGMA foreign_keys = ON')
  }

  async execute(sql: string): Promise<QueryOutcome[]> {
    const outcomes: QueryOutcome[] = []
    for (const { text } of splitStatements(sql)) {
      const started = performance.now()
      try {
        const statement = this.db.prepare(text)
        const columns = statement.columns()
        if (columns.length > 0) {
          statement.setReturnArrays(true)
          const rows: CellValue[][] = []
          let truncated = false
          for (const row of statement.iterate() as Iterable<unknown[]>) {
            if (rows.length >= MAX_RESULT_ROWS) {
              truncated = true
              break
            }
            rows.push(row.map((v) => normalizeValue(v)))
          }
          outcomes.push({ kind: 'result', statement: text, columns: columns.map((c) => c.name), rows, changes: 0, truncated, durationMs: performance.now() - started })
        } else {
          const result = statement.run()
          outcomes.push({ kind: 'result', statement: text, columns: [], rows: [], changes: Number(result.changes), truncated: false, durationMs: performance.now() - started })
        }
      } catch (error) {
        outcomes.push({ kind: 'error', statement: text, message: errorMessage(error) })
        break
      }
    }
    return outcomes
  }

  async schema(): Promise<DbSchema> {
    const objects = this.db.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string; type: string }[]
    const tables: DbTable[] = []
    for (const object of objects) {
      const info = this.db.prepare(`PRAGMA table_info(${q(object.name)})`).all() as { name: string; type: string; notnull: number; dflt_value: string | null; pk: number }[]
      const fks = this.db.prepare(`PRAGMA foreign_key_list(${q(object.name)})`).all() as { table: string; from: string; to: string | null }[]
      const indexList = this.db.prepare(`PRAGMA index_list(${q(object.name)})`).all() as { name: string; unique: number; origin: string }[]
      const indexes = indexList.map((index) => ({
        name: index.name,
        unique: index.unique === 1,
        origin: index.origin,
        columns: (this.db.prepare(`PRAGMA index_info(${q(index.name)})`).all() as { name: string }[]).map((c) => c.name)
      }))
      const uniqueColumns = new Set(indexes.filter((i) => i.unique && i.origin === 'u' && i.columns.length === 1).map((i) => i.columns[0]!))
      const primary = info.filter((c) => c.pk > 0)
      let rowCount: number | null = null
      if (object.type === 'table') {
        try {
          rowCount = Number((this.db.prepare(`SELECT COUNT(*) AS n FROM ${q(object.name)}`).get() as { n: number | bigint }).n)
        } catch {
          rowCount = null
        }
      }
      tables.push({
        name: object.name,
        kind: object.type === 'view' ? 'view' : 'table',
        columns: info.map((c) => ({
          name: c.name,
          type: c.type || 'ANY',
          notNull: c.notnull === 1 || (c.pk > 0 && primary.length === 1 && /^INTEGER$/i.test(c.type)),
          defaultValue: c.dflt_value,
          primaryKey: c.pk > 0,
          unique: uniqueColumns.has(c.name)
        })),
        foreignKeys: fks.map((fk) => ({
          column: fk.from,
          refTable: fk.table,
          // "REFERENCES tabella" senza colonna = chiave primaria della tabella riferita.
          refColumn: fk.to ?? ((this.db.prepare(`PRAGMA table_info(${q(fk.table)})`).all() as { name: string; pk: number }[]).find((c) => c.pk === 1)?.name ?? 'rowid')
        })),
        indexes: indexes.filter((i) => i.origin !== 'pk').map(({ name, unique, columns }) => ({ name, unique, columns })),
        rowCount
      })
    }
    return { engine: 'sqlite', tables }
  }

  async explain(sql: string): Promise<QueryPlan> {
    const statement = splitStatements(sql)[0]?.text
    if (!statement) throw new Error('Nessuna istruzione da analizzare.')
    const rows = this.db.prepare(`EXPLAIN QUERY PLAN ${statement}`).all() as { id: number; parent: number; detail: string }[]
    return {
      engine: 'sqlite',
      nodes: rows.map((r) => ({ id: String(r.id), parent: r.parent ? String(r.parent) : null, detail: r.detail, hint: sqliteHint(r.detail) })),
      raw: rows.map((r) => `${r.id}\t${r.parent}\t${r.detail}`).join('\n')
    }
  }

  async close(): Promise<void> {
    if (this.db.isOpen) this.db.close()
  }
}
