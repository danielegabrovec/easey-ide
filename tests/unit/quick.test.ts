import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { ASSIST_LEVELS, fitSuggestion, normalizeQuickSettings, quickLanguageOf } from '../../src/shared/contracts/quick'
import { QuickCodeError, instrumentQuick, stackLocation, wrapAsync } from '../../src/shared/quick/instrument'
import { isReadOnlySql, schemaComment, sqlSuggestions } from '../../src/shared/sql/completion'
import { compileQuick, originalLine } from '../../src/main/services/quick/quick-runner'
import { QuickSql } from '../../src/main/services/quick/quick-sql'
import { QuickStore, checkId, sanitizeTitle } from '../../src/main/services/quick/snippet-store'
import { mergeSettings } from '../../src/main/services/settings/settings-service'
import { DEFAULT_SETTINGS } from '../../src/shared/contracts/settings'

describe('instrumentQuick', () => {
  it('mostra espressioni e variabili di primo livello senza cambiare le righe', () => {
    const source = 'const a = 2 + 3\nconsole.log("x", a)\na * 10\n'
    const out = instrumentQuick(source, false)
    expect(out.split('\n')).toHaveLength(source.split('\n').length)
    expect(out).toContain('const a = 2 + 3;__vd(1, "a", a);')
    expect(out).toContain('__con(2).log("x", a)')
    expect(out).toContain('__v(3, (a * 10), 0)')
  })

  it('le chiamate senza risultato e i timer non mostrano valori inutili', () => {
    const out = instrumentQuick('saluta()\nsetTimeout(() => 1, 10)\n', false)
    expect(out).toContain('__v(1, (saluta()), 1)')
    expect(out).toContain('setTimeout(() => 1, 10)')
    expect(out).not.toContain('__v(2')
  })

  it('non mostra le funzioni assegnate, sì i nomi destrutturati', () => {
    const out = instrumentQuick('const f = (x) => x\nconst { a, b: [c] } = { a: 1, b: [2] }\n', false)
    expect(out).not.toContain('"f"')
    expect(out).toContain('__vd(2, "a", a);__vd(2, "c", c);')
  })

  it('console dentro le funzioni ha la riga di chi stampa; TypeScript resta TypeScript', () => {
    const out = instrumentQuick('function f(n: number): void {\n  console.warn(n)\n}\n', true)
    expect(out).toContain('__con(2).warn(n)')
    expect(out).toContain('n: number')
  })

  it('await di primo livello e avvolgimento sulla stessa riga', () => {
    const out = wrapAsync(instrumentQuick('await Promise.resolve(1)\n', false))
    expect(out.startsWith('(async () => {__v(1, (await Promise.resolve(1)), 1)')).toBe(true)
  })

  it('errori di sintassi e import con la riga', () => {
    expect(() => instrumentQuick('const = 5', false)).toThrow(QuickCodeError)
    try {
      instrumentQuick('\nimport fs from "fs"', false)
    } catch (error) {
      expect((error as QuickCodeError).line).toBe(2)
      expect((error as Error).message).toMatch(/import/)
    }
  })

  it('stackLocation legge riga e colonna del file indicato', () => {
    expect(stackLocation('Error: x\n    at f (scrittura-rapida.js:4:12)', 'scrittura-rapida.js')).toEqual({ line: 4, column: 12 })
    expect(stackLocation('Error: x', 'scrittura-rapida.js')).toBeNull()
  })
})

describe('compileQuick (TypeScript)', () => {
  it('toglie i tipi e riporta le righe sul sorgente', async () => {
    const compiled = await compileQuick('interface P { a: number }\n\nconst p: P = { a: 1 }\nthrow new Error("x")\n', 'typescript')
    expect(compiled.code).not.toContain('interface')
    const generated = compiled.code.split('\n').findIndex((line) => line.includes('throw')) + 1
    expect(originalLine(compiled, { line: generated, column: 1 })).toBe(4)
  })

  it('errore di sintassi TS con la riga', async () => {
    await expect(compileQuick('const x: = 1', 'typescript')).rejects.toBeInstanceOf(QuickCodeError)
  })
})

describe('livelli di aiuto', () => {
  it('fitSuggestion taglia alla misura del livello', () => {
    const text = 'a\nb\nc\nd\ne\nf\ng\nh'
    expect(fitSuggestion(text, 'off')).toBe('')
    expect(fitSuggestion(text, 'light')).toBe('a')
    expect(fitSuggestion(text, 'medium').split('\n')).toHaveLength(ASSIST_LEVELS.medium.maxLines)
    expect(fitSuggestion(text, 'strong')).toBe(text)
  })

  it('le righe vuote iniziali non contano', () => {
    expect(fitSuggestion('\n  return n * 2;\n}', 'light')).toBe('\n  return n * 2;')
  })

  it('normalizeQuickSettings corregge valori non validi', () => {
    const settings = normalizeQuickSettings({ level: 'turbo' as never, timeoutMs: 999999, sqlEngine: 'mysql' as never, sqlSample: '' })
    expect(settings).toMatchObject({ level: 'medium', timeoutMs: 60000, sqlEngine: 'sqlite', sqlSample: null, sqlFresh: true })
  })

  it('le impostazioni salvate senza "quick" ricevono i valori predefiniti', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, { quick: { ...DEFAULT_SETTINGS.quick, level: 'strong' } })
    expect(merged.quick.level).toBe('strong')
    expect(mergeSettings({ ...DEFAULT_SETTINGS, quick: undefined as never }, {}).quick.level).toBe('medium')
  })

  it('quickLanguageOf riconosce le estensioni', () => {
    expect(['a.js', 'b.ts', 'c.py', 'd.sql', 'e.html', 'f.txt'].map(quickLanguageOf)).toEqual(['javascript', 'typescript', 'python', 'sql', 'html', null])
  })
})

describe('completamento SQL condiviso', () => {
  const schema = {
    engine: 'sqlite' as const,
    tables: [{ name: 'clienti', kind: 'table' as const, rowCount: 3, foreignKeys: [], indexes: [], columns: [{ name: 'nome', type: 'TEXT', notNull: true, defaultValue: null, primaryKey: false, unique: false }] }]
  }

  it('tabelle, colonne dopo alias e modelli rapidi', () => {
    const all = sqlSuggestions('SELECT * FROM ', 'SELECT * FROM ', schema, { snippets: true })
    expect(all.some((s) => s.label === 'clienti' && s.kind === 'table')).toBe(true)
    expect(all.some((s) => s.kind === 'snippet')).toBe(true)
    expect(sqlSuggestions('SELECT c.', 'SELECT c. FROM clienti c', schema).map((s) => s.label)).toEqual(['nome'])
    expect(sqlSuggestions('', '', schema).some((s) => s.kind === 'snippet')).toBe(false)
  })

  it('schemaComment e isReadOnlySql', () => {
    expect(schemaComment(schema)).toContain('-- clienti(nome TEXT)')
    expect(isReadOnlySql('-- prova\nSELECT 1; WITH x AS (SELECT 1) SELECT * FROM x')).toBe(true)
    expect(isReadOnlySql('SELECT 1; INSERT INTO t VALUES (1)')).toBe(false)
    expect(isReadOnlySql('')).toBe(false)
  })
})

describe('QuickSql (database in memoria)', () => {
  it('le tabelle restano fra un esecuzione e l altra; reset con dati d esempio', async () => {
    const sql = new QuickSql()
    await sql.execute('sqlite', 'CREATE TABLE t (n INTEGER); INSERT INTO t VALUES (1), (2);')
    const outcomes = await sql.execute('sqlite', 'SELECT SUM(n) AS s FROM t')
    expect(outcomes[0]).toMatchObject({ kind: 'result', rows: [[3]] })
    const schema = await sql.reset('sqlite', 'negozio')
    expect(schema.tables.map((t) => t.name)).toContain('clienti')
    expect(schema.tables.map((t) => t.name)).not.toContain('t')
    await expect(sql.reset('sqlite', 'inesistente')).rejects.toThrow(/sconosciuti/)
    await sql.closeAll()
  })
})

describe('QuickStore (raccolta su file)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-quick-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  const store = new QuickStore(join(dir, 'Scrittura rapida'))

  it('sanitizeTitle e checkId', () => {
    expect(sanitizeTitle('a/b:c*?')).toBe('a-b-c-')
    expect(sanitizeTitle('  prova.  ')).toBe('prova')
    expect(sanitizeTitle('CON')).toBe('_CON')
    expect(sanitizeTitle('')).toBe('senza titolo')
    expect(() => checkId('../x.js')).toThrow()
    expect(() => checkId('x.exe')).toThrow()
  })

  it('salva, evita i doppioni, rinomina, elenca, elimina', async () => {
    expect(await store.list()).toEqual([])
    const first = await store.save({ id: null, title: 'Prova', language: 'python', content: 'print(1)' })
    expect(first.id).toBe('Prova.py')
    const second = await store.save({ id: null, title: 'Prova', language: 'python', content: 'print(2)' })
    expect(second.id).toBe('Prova (2).py')
    const renamed = await store.save({ id: first.id, title: 'Rinominata', language: 'python', content: 'print(3)' })
    expect(renamed.id).toBe('Rinominata.py')
    expect(existsSync(join(store.folder(), 'Prova.py'))).toBe(false)
    expect(readFileSync(join(store.folder(), 'Rinominata.py'), 'utf8')).toBe('print(3)')
    const overwritten = await store.save({ id: renamed.id, title: 'Rinominata', language: 'python', content: 'print(4)' })
    expect(overwritten.id).toBe('Rinominata.py')
    expect((await store.read('Rinominata.py')).content).toBe('print(4)')
    expect((await store.list()).map((s) => s.id).sort()).toEqual(['Prova (2).py', 'Rinominata.py'])
    await store.remove('Prova (2).py')
    expect((await store.list()).map((s) => s.id)).toEqual(['Rinominata.py'])
  })
})
