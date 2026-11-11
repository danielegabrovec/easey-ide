import { describe, expect, it } from 'vitest'
import { Parser } from 'node-sql-parser'
import { addColumnSql, createTableSql, emptyColumn, quoteIdent, validateDraft, type TableDraft } from '@shared/sql/ddl'
import { formatTable, toCsv } from '@shared/sql/format-table'
import { buildSql, EMPTY_MODEL, modelFromAst, nextAlias, UnsupportedQuery, type QueryModel } from '@shared/sql/query-model'
import { splitStatements, statementAt } from '@shared/sql/split'

describe('splitStatements', () => {
  it('divide rispettando stringhe e commenti', () => {
    const script = "SELECT 'a;b';\n-- commento; con punto e virgola\nINSERT INTO t VALUES (1); /* ; */ SELECT \"x;y\" FROM t"
    expect(splitStatements(script).map((s) => s.text)).toEqual(["SELECT 'a;b'", 'INSERT INTO t VALUES (1)', 'SELECT "x;y" FROM t'])
  })
  it('ignora istruzioni vuote e solo commenti', () => {
    expect(splitStatements(';;\n-- solo commento\n;').length).toBe(0)
  })
  it('tiene insieme i trigger SQLite e il dollar-quoting di PostgreSQL', () => {
    const trigger = 'CREATE TRIGGER t1 AFTER INSERT ON a BEGIN UPDATE b SET n = n + 1; INSERT INTO log VALUES (1); END'
    expect(splitStatements(`${trigger}; SELECT 1;`).map((s) => s.text)).toEqual([trigger, 'SELECT 1'])
    const fn = "CREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql"
    expect(splitStatements(`${fn}; SELECT f();`).map((s) => s.text)).toEqual([fn, 'SELECT f()'])
  })
  it('trova l’istruzione sotto il cursore', () => {
    const script = 'SELECT 1;\nSELECT 2;\nSELECT 3;'
    expect(statementAt(script, script.indexOf('2'))?.text).toBe('SELECT 2')
    expect(statementAt(script, script.length)?.text).toBe('SELECT 3')
  })
})

describe('DDL dal designer', () => {
  const draft: TableDraft = {
    name: 'ordini',
    columns: [
      { ...emptyColumn(), name: 'id', type: 'INTEGER', primaryKey: true, autoIncrement: true },
      { ...emptyColumn(), name: 'cliente_id', type: 'INTEGER', notNull: true, references: 'clienti.id' },
      { ...emptyColumn(), name: 'stato', type: 'TEXT', defaultValue: 'nuovo' },
      { ...emptyColumn(), name: 'codice', type: 'TEXT', unique: true }
    ]
  }
  it('SQLite', () => {
    expect(createTableSql(draft, 'sqlite')).toBe(
      'CREATE TABLE ordini (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  cliente_id INTEGER NOT NULL,\n  stato TEXT DEFAULT \'nuovo\',\n  codice TEXT UNIQUE,\n  FOREIGN KEY (cliente_id) REFERENCES clienti (id)\n);'
    )
  })
  it('PostgreSQL usa SERIAL e virgolette per i nomi con maiuscole', () => {
    const sql = createTableSql({ ...draft, name: 'Ordini' }, 'postgres')
    expect(sql).toContain('CREATE TABLE "Ordini"')
    expect(sql).toContain('id SERIAL PRIMARY KEY')
    expect(quoteIdent('order', 'sqlite')).toBe('"order"')
  })
  it('chiave primaria composta e ALTER TABLE', () => {
    const composite: TableDraft = { name: 'righe', columns: [{ ...emptyColumn(), name: 'a', type: 'INTEGER', primaryKey: true }, { ...emptyColumn(), name: 'b', type: 'INTEGER', primaryKey: true }] }
    expect(createTableSql(composite, 'sqlite')).toContain('PRIMARY KEY (a, b)')
    expect(addColumnSql('clienti', { ...emptyColumn(), name: 'punti', type: 'INTEGER', defaultValue: '0', notNull: true }, 'sqlite')).toBe('ALTER TABLE clienti ADD COLUMN punti INTEGER NOT NULL DEFAULT 0;')
  })
  it('valida la bozza', () => {
    expect(validateDraft({ name: 'clienti', columns: [] }, ['Clienti'])).toHaveLength(2)
    expect(validateDraft({ name: 'x', columns: [{ ...emptyColumn(), name: 'a' }, { ...emptyColumn(), name: 'A' }] }, [])).toEqual(['Colonna ripetuta: "A".'])
  })
})

describe('costruttore visuale di query', () => {
  const model: QueryModel = {
    ...EMPTY_MODEL,
    tables: [
      { alias: 'clienti', table: 'clienti', x: 0, y: 0 },
      { alias: 'ordini', table: 'ordini', x: 0, y: 0 }
    ],
    joins: [{ kind: 'INNER', left: { table: 'clienti', column: 'id' }, right: { table: 'ordini', column: 'cliente_id' } }],
    columns: [
      { table: 'clienti', column: 'nome', alias: '', aggregate: '', sort: 'ASC', visible: true },
      { table: 'ordini', column: 'id', alias: 'quanti', aggregate: 'COUNT', sort: '', visible: true }
    ],
    filters: [
      { table: 'clienti', column: 'citta', operator: '=', value: 'Trieste', connector: 'AND' },
      { table: 'ordini', column: 'stato', operator: 'IN', value: 'nuovo, spedito', connector: 'AND' }
    ],
    limit: 10
  }
  const expected = [
    'SELECT clienti.nome, COUNT(ordini.id) AS quanti',
    'FROM clienti',
    '  JOIN ordini ON clienti.id = ordini.cliente_id',
    "WHERE clienti.citta = 'Trieste'",
    "  AND ordini.stato IN ('nuovo', 'spedito')",
    'GROUP BY clienti.nome',
    'ORDER BY clienti.nome ASC',
    'LIMIT 10;'
  ].join('\n')

  it('genera la SELECT con JOIN, filtri, aggregati e ordinamento', () => {
    expect(buildSql(model, 'sqlite')).toBe(expected)
  })
  it('dal testo SQL al modello e ritorno (andata e ritorno identici)', () => {
    const parser = new Parser()
    const ast = parser.astify(expected, { database: 'sqlite' })
    const parsed = modelFromAst(ast)
    expect(buildSql(parsed, 'sqlite')).toBe(expected)
    const pg = modelFromAst(parser.astify(expected, { database: 'postgresql' }))
    expect(buildSql(pg, 'postgres')).toBe(expected)
  })
  it('alias di tabella, LEFT JOIN, IS NULL e una tabella sola', () => {
    const parser = new Parser()
    const sql = 'SELECT c.nome FROM clienti AS c LEFT JOIN ordini AS o ON c.id = o.cliente_id WHERE o.id IS NULL'
    const parsed = modelFromAst(parser.astify(sql, { database: 'sqlite' }))
    expect(parsed.tables.map((t) => `${t.table}:${t.alias}`)).toEqual(['clienti:c', 'ordini:o'])
    expect(buildSql(parsed, 'sqlite')).toBe('SELECT c.nome\nFROM clienti AS c\n  LEFT JOIN ordini AS o ON c.id = o.cliente_id\nWHERE o.id IS NULL;')
    const single = modelFromAst(parser.astify('SELECT * FROM prodotti WHERE prezzo > 5 ORDER BY prezzo DESC', { database: 'sqlite' }))
    expect(buildSql(single, 'sqlite')).toBe('SELECT *\nFROM prodotti\nWHERE prezzo > 5\nORDER BY prezzo DESC;')
  })
  it('rifiuta ciò che non sa rappresentare', () => {
    const parser = new Parser()
    expect(() => modelFromAst(parser.astify('SELECT 1 UNION SELECT 2', { database: 'sqlite' }))).toThrow(UnsupportedQuery)
    expect(() => modelFromAst(parser.astify('DELETE FROM t', { database: 'sqlite' }))).toThrow(UnsupportedQuery)
    expect(() => modelFromAst(parser.astify('SELECT prezzo * 2 FROM prodotti', { database: 'sqlite' }))).toThrow(UnsupportedQuery)
  })
  it('alias liberi per la stessa tabella', () => {
    expect(nextAlias(model, 'clienti')).toBe('clienti2')
    expect(nextAlias(model, 'prodotti')).toBe('prodotti')
  })
})

describe('tabelle di testo e CSV', () => {
  it('formatta come psql con numeri a destra', () => {
    expect(formatTable(['id', 'nome'], [[1, 'Ada'], [10, null]])).toBe(
      ['┌────┬──────┐', '│ id │ nome │', '├────┼──────┤', '│  1 │ Ada  │', '│ 10 │ NULL │', '└────┴──────┘'].join('\n')
    )
  })
  it('CSV con punto e virgola e virgolette', () => {
    expect(toCsv(['a', 'b'], [['x;y', null], [1, 'ok']])).toBe('a;b\r\n"x;y";\r\n1;ok')
  })
})
