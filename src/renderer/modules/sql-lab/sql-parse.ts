// Analisi del testo SQL con node-sql-parser, caricando solo la grammatica del dialetto che serve.
import type { SqlDialect } from '@shared/contracts/db'
import { modelFromAst, UnsupportedQuery, type QueryModel } from '@shared/sql/query-model'

type ParserModule = { Parser?: new () => { astify: (sql: string, options: { database: string }) => unknown }; default?: ParserModule }

async function parserFor(dialect: SqlDialect) {
  const mod = (dialect === 'postgres' ? await import('node-sql-parser/build/postgresql') : await import('node-sql-parser/build/sqlite')) as ParserModule
  const Parser = mod.Parser ?? mod.default?.Parser
  if (!Parser) throw new Error('Analizzatore SQL non disponibile')
  return new Parser()
}

export async function parseToModel(sql: string, dialect: SqlDialect): Promise<QueryModel> {
  const parser = await parserFor(dialect)
  let ast: unknown
  try {
    ast = parser.astify(sql.trim().replace(/;\s*$/, ''), { database: dialect === 'postgres' ? 'postgresql' : 'sqlite' })
  } catch (error) {
    throw new UnsupportedQuery(`Non riesco a leggere la query: ${(error as Error).message.split('\n')[0]}`)
  }
  return modelFromAst(ast)
}
