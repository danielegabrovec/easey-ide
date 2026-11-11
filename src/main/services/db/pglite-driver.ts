// Motore PostgreSQL incorporato (PGlite: PostgreSQL compilato in WebAssembly). Nessun server da installare:
// i dati stanno in una cartella del progetto (.laboratorio/postgres/<nome>).
import { performance } from 'node:perf_hooks'
import { MAX_RESULT_ROWS, type DbDriver, type DbSchema, type DbTable, type PlanNode, type QueryOutcome, type QueryPlan } from '@shared/contracts/db'
import { splitStatements } from '@shared/sql/split'
import { errorMessage, normalizeValue } from './values'

type PGliteType = import('@electric-sql/pglite').PGlite

// OID dei tipi DATE di PostgreSQL: si mostrano senza l'ora.
const DATE_OID = 1082

interface PgPlan {
  'Node Type': string
  'Relation Name'?: string
  'Index Name'?: string
  'Join Type'?: string
  'Total Cost'?: number
  'Plan Rows'?: number
  Filter?: string
  'Index Cond'?: string
  'Hash Cond'?: string
  Plans?: PgPlan[]
}

export function postgresHint(nodeType: string): PlanNode['hint'] {
  if (/Index/i.test(nodeType)) return 'index'
  if (/Seq Scan/i.test(nodeType)) return 'scan'
  return 'other'
}

export function flattenPgPlan(plan: PgPlan): PlanNode[] {
  const nodes: PlanNode[] = []
  let counter = 0
  const walk = (node: PgPlan, parent: string | null) => {
    const id = String(++counter)
    const parts = [node['Node Type']]
    if (node['Join Type'] && !/Join/.test(node['Node Type'])) parts.push(`(${node['Join Type']})`)
    if (node['Relation Name']) parts.push(`su ${node['Relation Name']}`)
    if (node['Index Name']) parts.push(`con l’indice ${node['Index Name']}`)
    const condition = node['Index Cond'] ?? node['Hash Cond'] ?? node.Filter
    if (condition) parts.push(`· ${condition}`)
    parts.push(`· costo ${node['Total Cost'] ?? '?'}, righe stimate ${node['Plan Rows'] ?? '?'}`)
    nodes.push({ id, parent, detail: parts.join(' '), hint: postgresHint(node['Node Type']) })
    for (const child of node.Plans ?? []) walk(child, id)
  }
  walk(plan, null)
  return nodes
}

export class PgliteDriver implements DbDriver {
  readonly engine = 'postgres' as const

  private constructor(private readonly db: PGliteType) {}

  static async open(dataDir: string): Promise<PgliteDriver> {
    const { PGlite } = await import('@electric-sql/pglite')
    const db = new PGlite(dataDir)
    await db.waitReady
    return new PgliteDriver(db)
  }

  async execute(sql: string): Promise<QueryOutcome[]> {
    const outcomes: QueryOutcome[] = []
    for (const { text } of splitStatements(sql)) {
      const started = performance.now()
      try {
        const result = await this.db.query<unknown[]>(text, [], { rowMode: 'array' })
        const dateColumns = result.fields.map((f) => f.dataTypeID === DATE_OID)
        const rows = result.rows.slice(0, MAX_RESULT_ROWS).map((row) => row.map((v, i) => normalizeValue(v, dateColumns[i])))
        outcomes.push({
          kind: 'result',
          statement: text,
          columns: result.fields.map((f) => f.name),
          rows,
          changes: result.fields.length ? 0 : (result.affectedRows ?? 0),
          truncated: result.rows.length > MAX_RESULT_ROWS,
          durationMs: performance.now() - started
        })
      } catch (error) {
        outcomes.push({ kind: 'error', statement: text, message: errorMessage(error) })
        break
      }
    }
    return outcomes
  }

  async schema(): Promise<DbSchema> {
    const objects = (await this.db.query<{ name: string; kind: string }>("SELECT c.relname AS name, c.relkind AS kind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v') ORDER BY c.relname")).rows
    const columns = (
      await this.db.query<{ table_name: string; column_name: string; type: string; not_null: boolean; default_value: string | null }>(
        `SELECT c.relname AS table_name, a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null, pg_get_expr(d.adbin, d.adrelid) AS default_value
         FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
         LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
         WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v') AND a.attnum > 0 AND NOT a.attisdropped
         ORDER BY c.relname, a.attnum`
      )
    ).rows
    const constraints = (
      await this.db.query<{ table_name: string; column_name: string; type: string; constraint_name: string; columns_in_constraint: number }>(
        `SELECT tc.table_name, kcu.column_name, tc.constraint_type AS type, tc.constraint_name,
                (SELECT COUNT(*)::int FROM information_schema.key_column_usage k2 WHERE k2.constraint_name = tc.constraint_name AND k2.table_schema = tc.table_schema) AS columns_in_constraint
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
         WHERE tc.table_schema = 'public' AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')`
      )
    ).rows
    const fkTargets = (
      await this.db.query<{ constraint_name: string; ref_table: string; ref_column: string }>(
        `SELECT tc.constraint_name, ccu.table_name AS ref_table, ccu.column_name AS ref_column
         FROM information_schema.table_constraints tc
         JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
         WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`
      )
    ).rows
    const indexes = (await this.db.query<{ tablename: string; indexname: string; indexdef: string }>("SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'")).rows

    const tables: DbTable[] = []
    for (const object of objects) {
      const own = constraints.filter((c) => c.table_name === object.name)
      const pkColumns = new Set(own.filter((c) => c.type === 'PRIMARY KEY').map((c) => c.column_name))
      const uniqueColumns = new Set(own.filter((c) => c.type === 'UNIQUE' && c.columns_in_constraint === 1).map((c) => c.column_name))
      let rowCount: number | null = null
      if (object.kind === 'r') {
        try {
          rowCount = Number((await this.db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "${object.name.replace(/"/g, '""')}"`)).rows[0]?.n ?? 0)
        } catch {
          rowCount = null
        }
      }
      tables.push({
        name: object.name,
        kind: object.kind === 'v' ? 'view' : 'table',
        columns: columns
          .filter((c) => c.table_name === object.name)
          .map((c) => ({ name: c.column_name, type: c.type, notNull: c.not_null, defaultValue: c.default_value, primaryKey: pkColumns.has(c.column_name), unique: uniqueColumns.has(c.column_name) })),
        foreignKeys: own
          .filter((c) => c.type === 'FOREIGN KEY')
          .map((c) => {
            const target = fkTargets.find((t) => t.constraint_name === c.constraint_name)
            return { column: c.column_name, refTable: target?.ref_table ?? '?', refColumn: target?.ref_column ?? '?' }
          }),
        indexes: indexes
          .filter((i) => i.tablename === object.name && !/_pkey$/.test(i.indexname))
          .map((i) => ({ name: i.indexname, unique: /CREATE UNIQUE/i.test(i.indexdef), columns: (/\(([^)]*)\)/.exec(i.indexdef)?.[1] ?? '').split(',').map((c) => c.trim().replace(/"/g, '')) })),
        rowCount
      })
    }
    return { engine: 'postgres', tables }
  }

  async explain(sql: string): Promise<QueryPlan> {
    const statement = splitStatements(sql)[0]?.text
    if (!statement) throw new Error('Nessuna istruzione da analizzare.')
    const result = await this.db.query<{ 'QUERY PLAN': { Plan: PgPlan }[] | string }>(`EXPLAIN (FORMAT JSON) ${statement}`)
    const raw = result.rows[0]?.['QUERY PLAN']
    const parsed = typeof raw === 'string' ? (JSON.parse(raw) as { Plan: PgPlan }[]) : raw
    const plan = parsed?.[0]?.Plan
    if (!plan) throw new Error('Piano di esecuzione non disponibile.')
    return { engine: 'postgres', nodes: flattenPgPlan(plan), raw: JSON.stringify(parsed, null, 2) }
  }

  async close(): Promise<void> {
    if (!this.db.closed) await this.db.close()
  }
}
