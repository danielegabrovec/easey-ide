// Collaudo end-to-end di F5 (diagrammi con connettori).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRun, ensureBuilt, terminalText, until } from './helpers.mjs'

ensureBuilt()
const run = createRun('diagrammi')
const { check } = run
const saveDir = join(run.work, 'esportati')
mkdirSync(saveDir)

async function newDiagram(page, type, name) {
  await run.palette('Nuovo diagramma')
  await page.locator(`[data-diagram-type="${type}"]`).click()
  await page.getByTestId('diagram-name').fill(name)
  await page.getByTestId('diagram-create').click()
  await page.locator(`[data-testid="diagram-editor"]`).last().waitFor({ timeout: 10000 })
}

try {
  const page = await run.launch({ LAB_IDE_SAVE_DIR: saveDir })
  await page.waitForSelector('.welcome', { timeout: 20000 })
  const root = await run.newProject('console-js', 'Diagrammi')
  const read = (name) => (existsSync(join(root, name)) ? readFileSync(join(root, name), 'utf8') : '')
  // La chat laterale parte aperta al primo avvio: la si chiude per dare spazio ai diagrammi.
  await page.getByTestId('side-panel').waitFor({ timeout: 5000 }).catch(() => undefined)
  if ((await page.getByTestId('side-panel').count()) > 0) await page.keyboard.press('Control+Alt+B')

  // 1. Flowchart d'esempio → codice → esecuzione
  await newDiagram(page, 'flowchart', 'somma')
  const editor = page.locator('[data-testid="diagram-editor"]').last()
  check('flowchart: esempio con 6 forme', !!(await until(async () => (await editor.locator('[data-shape]').count()) === 6, 8000)))
  await editor.getByTestId('diagram-run').click()
  const out = await until(async () => {
    const text = await terminalText(page)
    return text.includes('Programma terminato (codice 0)') ? text : null
  }, 20000)
  check('flowchart: il codice generato gira nel terminale (somma 1..10 = 55)', !!out && /\b55\b/.test(out), out ?? '')
  check('flowchart: ciclo while nel codice', read('somma.generato.js').includes('while (i <= 10) {'))
  await run.shot('01-flowchart')

  // 2. Modifico la condizione con doppio clic e rieseguo
  await editor.locator('[data-shape="decisione"]').dblclick()
  await editor.getByTestId('shape-editor').fill('i ≤ 5')
  await editor.getByTestId('shape-editor').press('Enter')
  await until(() => read('somma.diagramma.json').includes('i ≤ 5'), 5000)
  await editor.getByTestId('diagram-run').click()
  const out2 = await until(async () => {
    const text = await terminalText(page)
    return /\b15\b/.test(text) && text.includes('Programma terminato (codice 0)') ? text : null
  }, 20000)
  check('flowchart: testo modificato nel diagramma → nuovo risultato (15)', !!out2)

  // 3. Nuova forma e collegamento col mouse
  const edgesBefore = JSON.parse(read('somma.diagramma.json')).edges.length
  await editor.locator('[data-shape-item="nota"]').click()
  await page.waitForTimeout(300)
  await editor.locator('.react-flow__controls-fitview').click()
  await page.waitForTimeout(500)
  const note = editor.locator('.react-flow__node:has([data-shape="nota"])')
  const fromHandle = editor.locator('.react-flow__node:has([data-shape="inizio"]) .react-flow__handle[data-handleid="r"]').first()
  await note.hover()
  const a = await fromHandle.boundingBox()
  const b = await note.locator('.react-flow__handle[data-handleid="l"]').boundingBox()
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 })
  await page.mouse.up()
  check('connettori: collegamento disegnato col mouse e salvato', !!(await until(() => JSON.parse(read('somma.diagramma.json') || '{"edges":[]}').edges.length === edgesBefore + 1, 6000)))

  // 4. Esportazioni
  await editor.getByRole('button', { name: 'SVG' }).click()
  await editor.getByRole('button', { name: 'PNG' }).click()
  await editor.getByTestId('diagram-mermaid').click()
  const svg = await until(() => existsSync(join(saveDir, 'somma.svg')) && readFileSync(join(saveDir, 'somma.svg'), 'utf8').includes('<svg'), 10000)
  const png = await until(() => existsSync(join(saveDir, 'somma.png')) && readFileSync(join(saveDir, 'somma.png')).subarray(1, 4).toString() === 'PNG', 10000)
  const mmd = await until(() => existsSync(join(saveDir, 'somma.mmd')) && readFileSync(join(saveDir, 'somma.mmd'), 'utf8').startsWith('flowchart TD'), 10000)
  check('esporta: SVG, PNG e Mermaid', !!svg && !!png && !!mmd)
  await run.shot('02-esportato')

  // 5. ER → CREATE TABLE
  await newDiagram(page, 'er', 'negozio')
  await page.locator('[data-testid="diagram-editor"]').last().getByTestId('diagram-sql').click()
  const ddl = await until(async () => {
    const text = (await page.locator('[data-editor-path^="query/query-"] .view-lines').last().innerText().catch(() => '')).replace(/ /g, ' ')
    return text.includes('CREATE TABLE clienti') && text.indexOf('CREATE TABLE clienti') < text.indexOf('CREATE TABLE ordini') ? text : null
  }, 10000)
  check('ER: genera CREATE TABLE nell’ordine giusto', !!ddl)

  // 6. UML → classi TypeScript
  await newDiagram(page, 'uml', 'scuola')
  await page.locator('[data-testid="diagram-editor"]').last().getByTestId('diagram-ts').click()
  check('UML: classi TypeScript generate', !!(await until(() => read('Persona.ts').includes('export class Persona {') && read('Studente.ts').includes('public iscriviti(corso: string): void {'), 8000)))

  // 7. Mappa mentale: Tab aggiunge un'idea figlia
  await newDiagram(page, 'mappa', 'idee')
  const map = page.locator('[data-testid="diagram-editor"]').last()
  await map.locator('[data-shape="idea"]').first().click()
  await map.getByTestId('diagram-child').click()
  check('mappa: idea figlia aggiunta e collegata', !!(await until(() => {
    const d = JSON.parse(read('idee.diagramma.json') || '{"nodes":[],"edges":[]}')
    return d.nodes.length === 5 && d.edges.length === 4
  }, 6000)))
  await run.shot('03-mappa')

  // 8. Dal codice al diagramma
  writeFileSync(join(root, 'funzioni.js'), 'export function media(voti) {\n  let somma = 0\n  for (const v of voti) {\n    somma += v\n  }\n  if (voti.length === 0) return 0\n  return somma / voti.length\n}\n')
  await page.waitForTimeout(800)
  await page.keyboard.press('Control+P')
  await page.locator('.palette input').fill('funzioni')
  await page.keyboard.press('Enter')
  await page.locator('[data-editor-path="funzioni.js"] .view-lines').click()
  await run.palette('Diagramma di flusso della funzione')
  const fromCode = await until(() => {
    const d = JSON.parse(read('media.diagramma.json') || '{"nodes":[]}')
    return d.nodes.filter((n) => n.shape === 'decisione').length === 2 && d.nodes.some((n) => n.text === 'Inizio: media(voti)')
  }, 8000)
  check('codice → flowchart della funzione (ciclo e if)', !!fromCode)
  await run.shot('04-da-codice')

  check('nessun errore JavaScript nella finestra', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
