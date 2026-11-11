import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { JSDOM } from 'jsdom'
import { afterAll, describe, expect, it } from 'vitest'
import type { HtmlRule } from '../../src/shared/contracts/learn'
import { checkHtmlRules, compareResultSets, inlineDocument, valuesEqual, type DomProbe } from '../../src/shared/learn/checks'
import { exerciseLanguage, extractExercises, importManual, manualLanguage } from '../../src/shared/learn/manual-import'
import { coursePackFiles, parseExercise, parseFrontmatter, slugify, splitHints } from '../../src/shared/learn/pack'
import { checkJs, checkSql } from '../../src/main/services/learn/checkers'
import { LearnService } from '../../src/main/services/learn/learn-service'

const temp = mkdtempSync(join(tmpdir(), 'lab-learn-'))
afterAll(() => rmSync(temp, { recursive: true, force: true }))

describe('formato pacchetto', () => {
  it('frontmatter e suggerimenti', () => {
    const { data, body } = parseFrontmatter('---\ntitolo: Ciao: mondo\nlinguaggio: "ts"\n---\n\nConsegna.\n\n## Suggerimenti\n\n- uno\n- due\n  continua\n\n## Altro\n\nfine')
    expect(data).toEqual({ titolo: 'Ciao: mondo', linguaggio: 'ts' })
    const split = splitHints(body)
    expect(split.hints).toEqual(['uno', 'due continua'])
    expect(split.body).toBe('Consegna.\n\n## Altro\n\nfine')
  })
  it('slug sicuro', () => {
    expect(slugify('HTML, CSS e JavaScript insieme — Dai form')).toBe('html-css-e-javascript-insieme-dai-form')
  })
  it('SQL senza soluzione diventa autovalutazione', () => {
    expect(parseExercise('x', '---\nlinguaggio: sql\n---\nScrivi', null, {}, {}, null).check).toEqual({ tipo: 'autovalutazione' })
    const sql = parseExercise('x', '---\nlinguaggio: sql\n---\nScrivi', '{"tipo":"sql"}', { 'query.sql': '' }, { 'query.sql': 'SELECT 1' }, 'CREATE TABLE t(a)')
    expect(sql.check).toEqual({ tipo: 'sql', setup: 'CREATE TABLE t(a)', soluzione: 'SELECT 1', ordine: false })
    expect(sql.entry).toBe('query.sql')
  })
})

describe('confronti', () => {
  it('valori profondi, numeri con tolleranza', () => {
    expect(valuesEqual([1, { a: 2 }], [1, { a: 2 }])).toBe(true)
    expect(valuesEqual(0.1 + 0.2, 0.3)).toBe(true)
    expect(valuesEqual('1', 1)).toBe(false)
  })
  it('result set con e senza ordine', () => {
    const expected = { columns: ['nome'], rows: [['Anna'], ['Luca']] }
    expect(compareResultSets({ columns: ['n'], rows: [['Luca'], ['Anna']] }, expected, false).every((i) => i.ok)).toBe(true)
    const ordered = compareResultSets({ columns: ['n'], rows: [['Luca'], ['Anna']] }, expected, true)
    expect(ordered.at(-1)!.ok).toBe(false)
    expect(ordered.at(-1)!.dettaglio).toContain('riga 1')
    expect(compareResultSets({ columns: ['a', 'b'], rows: [] }, expected, false)[0]!.ok).toBe(false)
  })
})

function jsdomProbe(html: string): DomProbe<Element> {
  const dom = new JSDOM(html)
  const window = dom.window
  return {
    query: (selector) => [...window.document.querySelectorAll(selector)],
    text: (el) => el.textContent ?? '',
    attribute: (el, name) => el.getAttribute(name),
    computed: (el, property) => window.getComputedStyle(el).getPropertyValue(property),
    normalize: (property, value) => {
      const probe = window.document.createElement('div')
      probe.style.setProperty(property, value)
      window.document.body.appendChild(probe)
      const result = window.getComputedStyle(probe).getPropertyValue(property)
      probe.remove()
      return result
    }
  }
}

describe('verifica HTML/CSS', () => {
  const rules: HtmlRule[] = [
    { descrizione: 'h1 con Yoga', selettore: 'h1', testo: 'yoga' },
    { descrizione: 'due h2', selettore: 'h2', minimo: 2 },
    { descrizione: 'link', selettore: 'a', attributo: { nome: 'href', valore: 'orari.html' } },
    { descrizione: 'verde', selettore: 'h1', stile: { color: 'green' } }
  ]
  it('documento con CSS esterno incorporato', () => {
    const html = inlineDocument('<link rel="stylesheet" href="./style.css"><h1 class="t" onclick="x()">Yoga</h1><h2>a</h2><h2>b</h2><a href="orari.html">o</a><script>alert(1)</script>', { 'style.css': '.t { color: green }' })
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onclick')
    expect(html).toContain('.t { color: green }')
    const result = checkHtmlRules(rules, jsdomProbe(html))
    expect(result.items.map((i) => [i.descrizione, i.ok])).toEqual([
      ['h1 con Yoga', true],
      ['due h2', true],
      ['link', true],
      ['verde', true]
    ])
    expect(result.passed).toBe(true)
  })
  it('spiega cosa manca', () => {
    const result = checkHtmlRules(rules, jsdomProbe('<h1>Pilates</h1><h2>a</h2>'))
    expect(result.passed).toBe(false)
    expect(result.items[0]!.dettaglio).toContain('«yoga»')
    expect(result.items[1]!.dettaglio).toContain('trovati 1')
    expect(result.items[2]!.dettaglio).toContain('trovati 0')
  })
})

describe('verifica JS/TS ed SQL', () => {
  it('funzioni, output, errori e cicli infiniti', async () => {
    const dir = mkdtempSync(join(temp, 'js-'))
    writeFileSync(join(dir, 'main.ts'), 'export function doppio(n: number): number { return n * 2 }\nconst lista = (n: number) => [n, n]\nconsole.log("pronto", { a: 1 })\n')
    const ok = await checkJs(dir, 'main.ts', [
      { descrizione: 'doppio', espressione: 'doppio(21)', atteso: 42 },
      { descrizione: 'lista', espressione: 'lista(2)', atteso: [2, 2] },
      { descrizione: 'output', output: 'pronto' },
      { descrizione: 'sbagliato', espressione: 'doppio(1)', atteso: 3 }
    ])
    expect(ok.items.map((i) => i.ok)).toEqual([true, true, true, false])
    expect(ok.items[3]!.dettaglio).toBe('doppio(1) → 2, atteso 3')
    expect(ok.output).toContain("pronto { a: 1 }")

    writeFileSync(join(dir, 'rotto.ts'), 'const x: number = \n')
    expect((await checkJs(dir, 'rotto.ts', [])).error).toMatch(/rotto\.ts:2/)
    writeFileSync(join(dir, 'loop.js'), 'while (true) {}\n')
    expect((await checkJs(dir, 'loop.js', [])).error).toContain('ciclo infinito')
    writeFileSync(join(dir, 'async.js'), 'async function dopo() { return 5 }\n')
    expect((await checkJs(dir, 'async.js', [{ descrizione: 'a', espressione: 'dopo()', atteso: 5 }])).passed).toBe(true)
  })
  it('SQL confrontato con la soluzione', async () => {
    const setup = "CREATE TABLE c(nome TEXT, attivo INT); INSERT INTO c VALUES ('Anna',1),('Bea',0),('Ciro',1);"
    const solution = 'SELECT nome FROM c WHERE attivo = 1 ORDER BY nome'
    expect((await checkSql(setup, 'SELECT nome FROM c WHERE attivo=1 ORDER BY nome;', solution, true)).passed).toBe(true)
    expect((await checkSql(setup, 'SELECT nome FROM c', solution, false)).passed).toBe(false)
    expect((await checkSql(setup, 'SELEC nome', solution, false)).error).toContain('syntax error')
    expect((await checkSql(setup, '-- niente', solution, false)).error).toContain('vuoto')
  })
})

describe('importatore dei manuali della Collana', () => {
  const chapter = [
    '# Testo, titoli e paragrafi',
    '',
    'Introduzione.',
    '',
    '> 💡 Un consiglio.',
    '',
    '> 🧪 Crea la pagina di presentazione di un corso del centro fitness. Deve contenere:',
    '> 1. un `<h1>` con il nome del corso;',
    '> 2. almeno due sezioni con `<h2>`.',
    '',
    'Altro testo.',
    '',
    '> 🧪 Scrivi una query con SELECT sui clienti.'
  ].join('\n')
  it('riconosce linguaggi ed esercizi', () => {
    expect(manualLanguage('HTML')).toBe('html')
    expect(manualLanguage('SQLite')).toBe('sql')
    expect(manualLanguage('TypeScript')).toBe('ts')
    expect(manualLanguage('HTML, CSS e JavaScript insieme')).toBe('js')
    expect(exerciseLanguage('Scrivi una query con SELECT', 'html')).toBe('sql')
    expect(extractExercises(chapter)).toHaveLength(2)
    expect(extractExercises(chapter)[0]).toMatch(/^Crea la pagina[\s\S]*<h2>`\.$/)
  })
  it('capitoli → lezioni, riquadri 🧪 → esercizi; il pacchetto si rilegge uguale', async () => {
    const course = importManual('HTML', [
      { name: '00 - Indice.md', content: '# Indice' },
      { name: 'README.md', content: '# HTML da zero\n\nIl manuale per imparare HTML.\n' },
      { name: '03 - Testo, titoli, paragrafi e formattazione.md', content: chapter },
      { name: '01 - Cos è HTML.md', content: '# Cos’è l’HTML\n\nTesto.' }
    ])
    expect(course.id).toBe('manuale-html')
    expect(course.description).toBe('Il manuale per imparare HTML.')
    expect(course.lessonList.map((l) => l.title)).toEqual(['Cos’è l’HTML', 'Testo, titoli e paragrafi'])
    const [first, second] = course.lessonList[1]!.exercises
    expect(first!.language).toBe('html')
    expect(first!.title).toBe('Crea la pagina di presentazione di un corso del centro fitness')
    expect(Object.keys(first!.starter)).toEqual(['index.html', 'style.css'])
    expect(second!.language).toBe('sql')

    // Installazione e rilettura dal disco.
    const service = new LearnService(join(temp, 'nessuno'), join(temp, 'utente'), join(temp, 'p.json'), join(temp, 'lavoro'))
    const files = coursePackFiles(course)
    expect(files['corso.json']).toContain('"manuale-html"')
    const manual = join(temp, 'HTML')
    mkdirSync(manual)
    writeFileSync(join(manual, '03 - Testo, titoli, paragrafi e formattazione.md'), chapter)
    const summary = await service.importManual(manual)
    expect(summary).toMatchObject({ id: 'manuale-html', lessons: 1, exercises: 2, origin: 'importato' })
    const reloaded = await service.course('manuale-html')
    expect(reloaded.lessonList[0]!.exercises[0]!.body).toBe(course.lessonList[1]!.exercises[0]!.body)
    expect(reloaded.lessonList[0]!.body).toContain('> 💡 Un consiglio.')
    await service.remove('manuale-html')
    expect(await service.list()).toEqual([])
  })
})

describe('corso incluso «primi passi»', () => {
  const bundled = resolve('resources/courses')
  const service = new LearnService(bundled, join(temp, 'importati'), join(temp, 'progressi.json'), join(temp, 'esercizi'))
  const solve = async (exerciseId: string) => {
    const course = await service.course('primi-passi')
    const exercise = course.lessonList.flatMap((l) => l.exercises).find((e) => e.id === exerciseId)!
    const dir = await service.start('primi-passi', exerciseId)
    for (const [path, content] of Object.entries(exercise.solution)) writeFileSync(join(dir, path), content)
    return dir
  }
  it('si carica con 4 lezioni ed esercizi completi', async () => {
    const [summary] = await service.list()
    expect(summary).toMatchObject({ id: 'primi-passi', lessons: 4, exercises: 4, origin: 'incluso' })
    const course = await service.course('primi-passi')
    for (const exercise of course.lessonList.flatMap((l) => l.exercises)) {
      expect(exercise.hints.length).toBeGreaterThanOrEqual(3)
      expect(Object.keys(exercise.solution).length).toBeGreaterThan(0)
      expect(exercise.check.tipo).not.toBe('autovalutazione')
    }
  })
  it('starter non supera, soluzione sì (JS, TS, SQL); progressi persistiti', async () => {
    for (const id of ['media-allenamenti', 'prezzo-abbonamento', 'clienti-attivi']) {
      await service.start('primi-passi', id)
      const before = await service.check('primi-passi', id)
      expect(before.passed, id).toBe(false)
      await solve(id)
      const after = await service.check('primi-passi', id)
      expect(after.passed, `${id}: ${JSON.stringify(after)}`).toBe(true)
      await service.record('primi-passi', id, { kind: 'attempt', passed: after.passed })
    }
    const dir = service.exerciseDir('primi-passi', 'media-allenamenti')
    expect(JSON.parse(readFileSync(join(dir, 'easey.json'), 'utf8'))).toMatchObject({ run: { mode: 'terminal', entry: 'allenamenti.js' } })
    const progress = await service.progress('primi-passi')
    expect(progress['clienti-attivi']).toMatchObject({ stato: 'superato', tentativi: 1 })
    // reset ricrea i file di partenza
    await service.start('primi-passi', 'media-allenamenti', true)
    expect((await service.check('primi-passi', 'media-allenamenti')).passed).toBe(false)
    expect(existsSync(join(dir, 'allenamenti.js'))).toBe(true)
  })
  it('HTML: la soluzione supera le regole', async () => {
    const dir = await solve('scheda-corso')
    const files = await service.files('primi-passi', 'scheda-corso')
    expect(Object.keys(files).sort()).toEqual(['index.html', 'style.css'])
    const course = await service.course('primi-passi')
    const check = course.lessonList[2]!.exercises[0]!.check
    if (check.tipo !== 'html') throw new Error('atteso html')
    const result = checkHtmlRules(check.regole, jsdomProbe(inlineDocument(files['index.html']!, files)))
    expect(result.items.filter((i) => !i.ok)).toEqual([])
    expect(dir).toContain('scheda-corso')
  })
})
