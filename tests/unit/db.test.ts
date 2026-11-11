import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { QueryResult } from '@shared/contracts/db'
import { createTableSql, emptyColumn } from '@shared/sql/ddl'
import { DbService, MEMORY_ID, parseConnectionId, sanitizeDbName } from '../../src/main/services/db/db-service'
import { flattenPgPlan } from '../../src/main/services/db/pglite-driver'
import { sqliteHint } from '../../src/main/services/db/sqlite-driver'
import { HistoryService } from '../../src/main/services/workspace/history-service'
import { createFromTemplate } from '../../src/main/services/workspace/templates'
import { WorkspaceService } from '../../src/main/services/workspace/workspace-service'

let dir: string
let service: DbService

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'lab-db-'))
  const root = await createFromTemplate('empty', 'progetto', dir)
  const workspace = new WorkspaceService(new HistoryService(join(dir, 'h')), () => undefined)
  await workspace.open(root)
  service = new DbService(workspace)
})

afterAll(async () => {
  await service.closeAll()
  rmSync(dir, { recursive: true, force: true })
})

const result = (outcomes: Awaited<ReturnType<DbService['execute']>>, index = 0) => outcomes[index] as QueryResult

describe('utilità', () => {
  it('nomi e identificativi', () => {
    expect(sanitizeDbName('  Il mio Négozio! ')).toBe('il_mio_negozio')
    expect(parseConnectionId('sqlite:database/a.db')).toEqual({ engine: 'sqlite', path: 'database/a.db' })
    expect(() => parseConnectionId('mysql:x')).toThrow()
    expect(() => parseConnectionId('sqlite:../fuori.db')).toThrow()
  })
  it('valutazione didattica dei piani', () => {
    expect(sqliteHint('SCAN clienti')).toBe('scan')
    expect(sqliteHint('SEARCH clienti USING INDEX idx_citta (citta=?)')).toBe('index')
    expect(sqliteHint('SEARCH ordini USING INTEGER PRIMARY KEY (rowid=?)')).toBe('index')
    const nodes = flattenPgPlan({ 'Node Type': 'Hash Join', 'Total Cost': 10, 'Plan Rows': 5, Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': 'ordini' }, { 'Node Type': 'Index Scan', 'Relation Name': 'clienti', 'Index Name': 'clienti_pkey' }] })
    expect(nodes.map((n) => [n.id, n.parent, n.hint])).toEqual([
      ['1', null, 'other'],
      ['2', '1', 'scan'],
      ['3', '1', 'index']
    ])
  })
})

describe('SQLite (node:sqlite)', () => {
  it('database in memoria sempre disponibile', async () => {
    const list = await service.list()
    expect(list[0]!.id).toBe(MEMORY_ID)
    const outcomes = await service.execute(MEMORY_ID, 'CREATE TABLE t (a INTEGER, b TEXT); INSERT INTO t VALUES (1, \'x\'), (2, NULL); SELECT * FROM t ORDER BY a;')
    expect(outcomes.map((o) => o.kind)).toEqual(['result', 'result', 'result'])
    expect(result(outcomes, 1).changes).toBe(2)
    expect(result(outcomes, 2)).toMatchObject({ columns: ['a', 'b'], rows: [[1, 'x'], [2, null]] })
  })

  it('crea il database d’esempio, schema con chiavi esterne e conteggi', async () => {
    const info = await service.create({ engine: 'sqlite', name: 'Negozio', sample: 'negozio' })
    expect(info.path).toBe('database/negozio.db')
    expect((await service.list()).map((c) => c.id)).toContain(info.id)
    const schema = await service.schema(info.id)
    expect(schema.tables.map((t) => t.name)).toEqual(['clienti', 'ordini', 'prodotti', 'righe_ordine'])
    const ordini = schema.tables.find((t) => t.name === 'ordini')!
    expect(ordini.foreignKeys).toEqual([{ column: 'cliente_id', refTable: 'clienti', refColumn: 'id' }])
    expect(ordini.rowCount).toBe(5)
    expect(schema.tables.find((t) => t.name === 'clienti')!.columns.find((c) => c.name === 'email')!.unique).toBe(true)
    expect(schema.tables.find((t) => t.name === 'righe_ordine')!.columns.filter((c) => c.primaryKey).map((c) => c.name)).toEqual(['ordine_id', 'prodotto_id'])
  })

  it('si ferma al primo errore e rispetta le chiavi esterne', async () => {
    const id = 'sqlite:database/negozio.db'
    const outcomes = await service.execute(id, 'SELECT COUNT(*) FROM clienti; INSERT INTO ordini (cliente_id, data) VALUES (999, \'2025-01-01\'); SELECT 1;')
    expect(outcomes.map((o) => o.kind)).toEqual(['result', 'error'])
    expect((outcomes[1] as { message: string }).message).toMatch(/FOREIGN KEY/i)
  })

  it('piano di esecuzione: scansione, poi indice dopo CREATE INDEX', async () => {
    const id = 'sqlite:database/negozio.db'
    expect((await service.explain(id, "SELECT * FROM clienti WHERE citta = 'Trieste'")).nodes[0]!.hint).toBe('scan')
    await service.execute(id, 'CREATE INDEX idx_citta ON clienti (citta)')
    expect((await service.explain(id, "SELECT * FROM clienti WHERE citta = 'Trieste'")).nodes[0]!.hint).toBe('index')
  })

  it('istantanea e ripristino (modalità sandbox)', async () => {
    const id = 'sqlite:database/negozio.db'
    const snapshot = await service.snapshot(id)
    await service.execute(id, 'DELETE FROM righe_ordine; DELETE FROM ordini;')
    expect(result(await service.execute(id, 'SELECT COUNT(*) AS n FROM ordini')).rows[0]![0]).toBe(0)
    expect((await service.snapshots(id)).map((s) => s.id)).toContain(snapshot.id)
    await service.restore(id, snapshot.id)
    expect(result(await service.execute(id, 'SELECT COUNT(*) AS n FROM ordini')).rows[0]![0]).toBe(5)
  })

  it('DDL del designer eseguito davvero', async () => {
    const sql = createTableSql({ name: 'fornitori', columns: [{ ...emptyColumn(), name: 'id', type: 'INTEGER', primaryKey: true, autoIncrement: true }, { ...emptyColumn(), name: 'nome', type: 'TEXT', notNull: true }] }, 'sqlite')
    expect((await service.execute(MEMORY_ID, sql))[0]!.kind).toBe('result')
  })
})

describe('PostgreSQL incorporato (PGlite)', () => {
  it('crea, interroga, schema, piano e istantanea', { timeout: 60000 }, async () => {
    const info = await service.create({ engine: 'postgres', name: 'scuola', sample: 'scuola' })
    expect(info.path).toBe('.laboratorio/postgres/scuola')
    const outcomes = await service.execute(info.id, 'SELECT s.nome, ROUND(AVG(v.voto), 2) AS media FROM studenti s JOIN voti v ON v.studente_id = s.id GROUP BY s.nome ORDER BY media DESC; SELECT CURRENT_DATE AS oggi;')
    expect(result(outcomes).columns).toEqual(['nome', 'media'])
    expect(result(outcomes).rows[0]).toEqual(['Elena', '8.75'])
    expect(String(result(outcomes, 1).rows[0]![0])).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const schema = await service.schema(info.id)
    const voti = schema.tables.find((t) => t.name === 'voti')!
    expect(voti.foreignKeys.map((f) => `${f.column}->${f.refTable}.${f.refColumn}`).sort()).toEqual(['materia_id->materie.id', 'studente_id->studenti.id'])
    expect(voti.columns.find((c) => c.name === 'id')!.primaryKey).toBe(true)
    expect(schema.tables.find((t) => t.name === 'materie')!.columns.find((c) => c.name === 'nome')!.unique).toBe(true)
    const plan = await service.explain(info.id, 'SELECT * FROM voti WHERE voto > 8')
    expect(plan.nodes[0]!.detail).toMatch(/Seq Scan su voti/)
    const bad = await service.execute(info.id, 'INSERT INTO voti (studente_id, materia_id, voto, data) VALUES (1, 1, 11, CURRENT_DATE)')
    expect(bad[0]!.kind).toBe('error')
    const snapshot = await service.snapshot(info.id)
    await service.execute(info.id, 'DELETE FROM voti')
    await service.restore(info.id, snapshot.id)
    expect(result(await service.execute(info.id, 'SELECT COUNT(*)::int AS n FROM voti')).rows[0]![0]).toBe(8)
  })
})
