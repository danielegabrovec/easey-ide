// Modello del costruttore visuale di query ↔ testo SQL.
// buildSql: dal modello alla SELECT. modelFromAst: dalla SELECT (AST di node-sql-parser) al modello.
import type { SqlDialect } from '../contracts/db'
import { quoteIdent } from './ddl'

export type Aggregate = '' | 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX'
export type SortOrder = '' | 'ASC' | 'DESC'
export type FilterOperator = '=' | '<>' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN' | 'IS NULL' | 'IS NOT NULL'

export interface QmTable {
  alias: string
  table: string
  x: number
  y: number
}

export interface QmColumnRef {
  table: string
  column: string
}

export interface QmColumn extends QmColumnRef {
  alias: string
  aggregate: Aggregate
  sort: SortOrder
  visible: boolean
}

export interface QmJoin {
  kind: 'INNER' | 'LEFT'
  left: QmColumnRef
  right: QmColumnRef
}

export interface QmFilter extends QmColumnRef {
  operator: FilterOperator
  value: string
  connector: 'AND' | 'OR'
}

export interface QueryModel {
  tables: QmTable[]
  columns: QmColumn[]
  joins: QmJoin[]
  filters: QmFilter[]
  distinct: boolean
  limit: number | null
}

export const EMPTY_MODEL: QueryModel = { tables: [], columns: [], joins: [], filters: [], distinct: false, limit: null }

export const OPERATORS: FilterOperator[] = ['=', '<>', '>', '<', '>=', '<=', 'LIKE', 'IN', 'IS NULL', 'IS NOT NULL']

/** Alias libero per una nuova istanza di tabella (clienti, clienti2…). */
export function nextAlias(model: QueryModel, table: string): string {
  if (!model.tables.some((t) => t.alias === table)) return table
  let n = 2
  while (model.tables.some((t) => t.alias === `${table}${n}`)) n++
  return `${table}${n}`
}

function ref(column: QmColumnRef, model: QueryModel, dialect: SqlDialect): string {
  const qualify = model.tables.length > 1
  const name = quoteIdent(column.column, dialect)
  return qualify ? `${quoteIdent(column.table, dialect)}.${name}` : name
}

function literal(value: string): string {
  const v = value.trim()
  if (/^-?\d+(\.\d+)?$/.test(v)) return v
  if (/^'.*'$/s.test(v)) return v
  if (/^(true|false|null)$/i.test(v)) return v.toUpperCase()
  return `'${v.replace(/'/g, "''")}'`
}

function tableSource(table: QmTable, dialect: SqlDialect): string {
  return table.alias === table.table ? quoteIdent(table.table, dialect) : `${quoteIdent(table.table, dialect)} AS ${quoteIdent(table.alias, dialect)}`
}

export function buildSql(model: QueryModel, dialect: SqlDialect): string {
  if (model.tables.length === 0) return ''
  const visible = model.columns.filter((c) => c.visible)
  const hasAggregate = visible.some((c) => c.aggregate)
  const select = visible.length
    ? visible.map((c) => {
        const expression = c.aggregate ? `${c.aggregate}(${c.column === '*' ? '*' : ref(c, model, dialect)})` : c.column === '*' ? (model.tables.length > 1 ? `${quoteIdent(c.table, dialect)}.*` : '*') : ref(c, model, dialect)
        return c.alias.trim() ? `${expression} AS ${quoteIdent(c.alias.trim(), dialect)}` : expression
      })
    : ['*']

  // FROM: la prima tabella, poi le altre unite dalle JOIN in ordine di raggiungibilità.
  const placed = [model.tables[0]!.alias]
  const from = [tableSource(model.tables[0]!, dialect)]
  const pending = [...model.joins]
  let progress = true
  while (pending.length && progress) {
    progress = false
    for (let i = 0; i < pending.length; i++) {
      const join = pending[i]!
      const leftIn = placed.includes(join.left.table)
      const rightIn = placed.includes(join.right.table)
      if (leftIn === rightIn) {
        if (leftIn) {
          // Entrambe già presenti: condizione aggiuntiva sulla JOIN.
          from[from.length - 1] += ` AND ${ref(join.left, model, dialect)} = ${ref(join.right, model, dialect)}`
          pending.splice(i--, 1)
          progress = true
        }
        continue
      }
      const incoming = leftIn ? join.right.table : join.left.table
      const table = model.tables.find((t) => t.alias === incoming)
      if (!table) {
        pending.splice(i--, 1)
        continue
      }
      from.push(`${join.kind === 'LEFT' ? 'LEFT JOIN' : 'JOIN'} ${tableSource(table, dialect)} ON ${ref(join.left, model, dialect)} = ${ref(join.right, model, dialect)}`)
      placed.push(incoming)
      pending.splice(i--, 1)
      progress = true
    }
  }
  for (const table of model.tables) {
    if (!placed.includes(table.alias)) {
      from.push(`CROSS JOIN ${tableSource(table, dialect)}`)
      placed.push(table.alias)
    }
  }

  const lines = [`SELECT ${model.distinct ? 'DISTINCT ' : ''}${select.join(', ')}`, `FROM ${from.join('\n  ')}`]
  const filters = model.filters.filter((f) => f.column)
  if (filters.length) {
    const parts = filters.map((f, index) => {
      const left = ref(f, model, dialect)
      let condition: string
      if (f.operator === 'IS NULL' || f.operator === 'IS NOT NULL') condition = `${left} ${f.operator}`
      else if (f.operator === 'IN') condition = `${left} IN (${f.value.split(',').map((v) => literal(v)).join(', ')})`
      else condition = `${left} ${f.operator} ${literal(f.value)}`
      return index === 0 ? condition : `${f.connector} ${condition}`
    })
    lines.push(`WHERE ${parts.join('\n  ')}`)
  }
  if (hasAggregate) {
    const groups = visible.filter((c) => !c.aggregate && c.column !== '*').map((c) => ref(c, model, dialect))
    if (groups.length) lines.push(`GROUP BY ${groups.join(', ')}`)
  }
  const sorted = model.columns.filter((c) => c.sort)
  if (sorted.length) {
    lines.push(`ORDER BY ${sorted.map((c) => `${c.aggregate ? (c.alias.trim() ? quoteIdent(c.alias.trim(), dialect) : `${c.aggregate}(${c.column === '*' ? '*' : ref(c, model, dialect)})`) : ref(c, model, dialect)} ${c.sort}`).join(', ')}`)
  }
  if (model.limit !== null && model.limit > 0) lines.push(`LIMIT ${Math.floor(model.limit)}`)
  return `${lines.join('\n')};`
}

// ------------------------------------------------------------------ dal testo al modello

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ast = any

function identName(value: Ast): string {
  if (typeof value === 'string') return value
  if (value?.expr?.value !== undefined) return String(value.expr.value)
  if (value?.value !== undefined) return String(value.value)
  return ''
}

export class UnsupportedQuery extends Error {}

/**
 * Converte la SELECT (AST di node-sql-parser) nel modello del costruttore.
 * Lancia UnsupportedQuery per ciò che il costruttore non sa rappresentare (sottoquery, UNION, HAVING…).
 */
export function modelFromAst(input: Ast): QueryModel {
  const ast = Array.isArray(input) ? input[0] : input
  if (!ast || ast.type !== 'select') throw new UnsupportedQuery('Il costruttore visuale gestisce solo istruzioni SELECT.')
  if (ast._next || ast.union) throw new UnsupportedQuery('UNION non è supportata dal costruttore visuale.')
  if (ast.having) throw new UnsupportedQuery('HAVING non è supportata dal costruttore visuale.')
  if (ast.with) throw new UnsupportedQuery('WITH non è supportata dal costruttore visuale.')
  const model: QueryModel = { tables: [], columns: [], joins: [], filters: [], distinct: ast.distinct === 'DISTINCT', limit: null }

  const aliasOf = new Map<string, string>()
  for (const [index, source] of (ast.from ?? []).entries()) {
    if (source.expr) throw new UnsupportedQuery('Le sottoquery in FROM non sono supportate.')
    const table = identName(source.table)
    const alias = identName(source.as) || table
    aliasOf.set(alias, alias)
    aliasOf.set(table, alias)
    model.tables.push({ alias, table, x: 40 + index * 260, y: 40 + (index % 2) * 60 })
    if (source.join) {
      const kind = /LEFT/i.test(source.join) ? 'LEFT' : /INNER|^JOIN$/i.test(source.join) ? 'INNER' : null
      if (!kind) throw new UnsupportedQuery(`${source.join} non è supportata dal costruttore visuale.`)
      const conditions = flatten(source.on, 'AND')
      for (const condition of conditions) {
        if (condition?.type !== 'binary_expr' || condition.operator !== '=' || condition.left?.type !== 'column_ref' || condition.right?.type !== 'column_ref') {
          throw new UnsupportedQuery('Le condizioni di JOIN devono essere uguaglianze fra colonne.')
        }
        model.joins.push({ kind, left: columnRef(condition.left, model, aliasOf), right: columnRef(condition.right, model, aliasOf) })
      }
    }
  }
  if (model.tables.length === 0) throw new UnsupportedQuery('Manca la clausola FROM.')

  const columns = ast.columns === '*' ? [{ expr: { type: 'column_ref', table: null, column: '*' } }] : (ast.columns ?? [])
  for (const item of columns) {
    const expr = item.expr
    const alias = identName(item.as)
    if (expr?.type === 'column_ref') {
      const target = columnRef(expr, model, aliasOf)
      model.columns.push({ ...target, alias, aggregate: '', sort: '', visible: true })
    } else if (expr?.type === 'aggr_func') {
      const name = String(expr.name).toUpperCase() as Aggregate
      if (!['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].includes(name)) throw new UnsupportedQuery(`Funzione ${expr.name} non supportata.`)
      const arg = expr.args?.expr
      const target = arg?.type === 'star' || arg?.value === '*' || !arg ? { table: model.tables[0]!.alias, column: '*' } : arg.type === 'column_ref' ? columnRef(arg, model, aliasOf) : null
      if (!target) throw new UnsupportedQuery('Argomento di funzione non supportato.')
      model.columns.push({ ...target, alias, aggregate: name, sort: '', visible: true })
    } else {
      throw new UnsupportedQuery('Le espressioni calcolate nella SELECT non sono supportate dal costruttore visuale.')
    }
  }

  if (ast.where) {
    const parts = flattenWithConnectors(ast.where)
    for (const { node, connector } of parts) model.filters.push(filterFrom(node, connector, model, aliasOf))
  }

  for (const order of ast.orderby ?? []) {
    const expr = order.expr
    const sort = (String(order.type ?? 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC') as SortOrder
    if (expr?.type === 'column_ref') {
      const target = columnRef(expr, model, aliasOf)
      const existing = model.columns.find((c) => (c.table === target.table && c.column === target.column && !c.aggregate) || (c.alias && c.alias === target.column))
      if (existing) existing.sort = sort
      else model.columns.push({ ...target, alias: '', aggregate: '', sort, visible: false })
    } else if (expr?.type === 'aggr_func') {
      const existing = model.columns.find((c) => c.aggregate === String(expr.name).toUpperCase())
      if (existing) existing.sort = sort
    }
  }

  const limitValue = ast.limit?.value?.[0]?.value
  if (limitValue !== undefined) model.limit = Number(limitValue)
  return model
}

function columnRef(expr: Ast, model: QueryModel, aliasOf: Map<string, string>): QmColumnRef {
  const column = identName(expr.column)
  const table = expr.table ? (aliasOf.get(identName(expr.table)) ?? identName(expr.table)) : model.tables[0]!.alias
  return { table, column }
}

function flatten(node: Ast, operator: 'AND' | 'OR'): Ast[] {
  if (node?.type === 'binary_expr' && String(node.operator).toUpperCase() === operator) return [...flatten(node.left, operator), ...flatten(node.right, operator)]
  return [node]
}

function flattenWithConnectors(node: Ast, connector: 'AND' | 'OR' = 'AND'): { node: Ast; connector: 'AND' | 'OR' }[] {
  if (node?.type === 'binary_expr' && ['AND', 'OR'].includes(String(node.operator).toUpperCase())) {
    if (node.parentheses) throw new UnsupportedQuery('Le condizioni fra parentesi non sono supportate dal costruttore visuale.')
    const op = String(node.operator).toUpperCase() as 'AND' | 'OR'
    return [...flattenWithConnectors(node.left, connector), ...flattenWithConnectors(node.right, op)]
  }
  return [{ node, connector }]
}

function valueText(node: Ast): string {
  if (node?.type === 'single_quote_string' || node?.type === 'string') return node.value
  if (node?.type === 'number') return String(node.value)
  if (node?.type === 'bool') return String(node.value).toUpperCase()
  if (node?.type === 'null') return 'NULL'
  if (node?.type === 'expr_list') return (node.value as Ast[]).map(valueText).join(', ')
  throw new UnsupportedQuery('Valori calcolati nei filtri non supportati.')
}

function filterFrom(node: Ast, connector: 'AND' | 'OR', model: QueryModel, aliasOf: Map<string, string>): QmFilter {
  if (node?.type !== 'binary_expr' || node.left?.type !== 'column_ref') throw new UnsupportedQuery('Filtro non supportato dal costruttore visuale.')
  const target = columnRef(node.left, model, aliasOf)
  const operator = String(node.operator).toUpperCase()
  if (operator === 'IS' || operator === 'IS NOT') {
    return { ...target, operator: operator === 'IS' ? 'IS NULL' : 'IS NOT NULL', value: '', connector }
  }
  if (!OPERATORS.includes(operator as FilterOperator) && operator !== '!=') throw new UnsupportedQuery(`Operatore ${operator} non supportato.`)
  if (node.right?.type === 'column_ref') throw new UnsupportedQuery('Confronti fra colonne nel WHERE: usa una JOIN.')
  return { ...target, operator: (operator === '!=' ? '<>' : operator) as FilterOperator, value: valueText(node.right), connector }
}
