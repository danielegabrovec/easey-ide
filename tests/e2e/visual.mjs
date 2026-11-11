// Collaudo end-to-end di F4 (programmazione visuale a blocchi e a nodi).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { consoleText, createRun, ensureBuilt, until } from './helpers.mjs'

ensureBuilt()
const run = createRun('visual')
const { check } = run

try {
  const page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })
  const root = await run.newProject('web-js', 'Visuale')
  const read = (name) => (existsSync(join(root, name)) ? readFileSync(join(root, name), 'utf8') : '')

  // 1. Programma a blocchi d'esempio
  await run.palette('Nuovo programma a blocchi')
  await page.locator('.dialog input').press('Enter')
  await page.getByTestId('blocks-editor').waitFor({ timeout: 15000 })
  const generated = await until(() => read('programma.generato.js').includes('document.querySelector("#pulsante").addEventListener("click"') && read('programma.generato.js').includes("'Ciao dai blocchi!'"), 10000)
  check('blocchi: esempio generato (clic su #pulsante → testo di #titolo)', !!generated, read('programma.generato.js').slice(-300))
  check('blocchi: collegato alla pagina con <script type="module">', read('index.html').includes('<script type="module" src="programma.generato.js"></script>'))
  await run.shot('01-blocchi')

  // 2. Trascino "scrivi in console" dalla cassetta degli attrezzi
  await page.locator('.blocklyToolboxCategory', { hasText: 'Testo' }).first().click()
  const flyoutBlock = page.locator('.blocklyFlyout .blocklyText', { hasText: 'scrivi in console' }).first()
  await flyoutBlock.waitFor({ timeout: 5000 })
  const from = await flyoutBlock.boundingBox()
  const area = await page.locator('.blockly-host').boundingBox()
  await page.mouse.move(from.x + 5, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(area.x + area.width * 0.55, area.y + area.height * 0.7, { steps: 12 })
  await page.mouse.up()
  check('blocchi: il blocco trascinato entra nel codice', !!(await until(() => read('programma.generato.js').includes("console.log('ciao');"), 8000)), read('programma.generato.js').slice(-200))
  await run.shot('02-blocco-aggiunto')

  // 3. Esecuzione nell'anteprima
  await page.getByTestId('visual-run').click()
  const frame = page.frameLocator('[data-testid="preview-frame"]')
  await until(async () => (await frame.locator('#pulsante').count()) === 1, 15000)
  await frame.locator('#pulsante').click()
  check('blocchi: eseguito nella pagina', !!(await until(async () => (await frame.locator('#titolo').innerText()) === 'Ciao dai blocchi!', 8000)))
  check('blocchi: il blocco libero scrive in console', !!(await until(async () => (await consoleText(page)).includes('ciao'), 5000)))

  // 4. Programma a nodi d'esempio
  await run.palette('Nuovo programma a nodi')
  await page.locator('.dialog input').press('Enter')
  await page.getByTestId('nodes-editor').waitFor({ timeout: 15000 })
  check('nodi: esempio generato', !!(await until(() => read('logica.generato.js').includes('textContent = "Ciao dai nodi!"'), 10000)))

  // 5. Aggiungo "Scrivi in console" e lo collego dopo "Imposta il testo"
  await page.locator('[data-node-type="console"]').click()
  const consoleNode = page.locator('.react-flow__node:has([data-vnode="console"])')
  await consoleNode.waitFor({ timeout: 5000 })
  await page.waitForTimeout(600) // la vista si riadatta al nuovo nodo (animazione)
  const source = await page.locator('.react-flow__node[data-id="scrivi"] .react-flow__handle[data-handleid="poi"]').boundingBox()
  const target = await consoleNode.locator('.react-flow__handle[data-handleid="in"]').boundingBox()
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 })
  await page.mouse.up()
  const linked = await until(() => /textContent = "Ciao dai nodi!";\n(?:\s*__labStep\("console-[^"]+"\);\n)?\s*console\.log\("ciao"\);/.test(read('logica.generato.js')), 8000)
  check('nodi: collegamento di flusso col mouse genera il passo successivo', !!linked, read('logica.generato.js').slice(-250))
  await run.shot('03-nodi')

  // 6. Esecuzione e passo evidenziato
  await page.getByTestId('nodes-editor').getByTestId('visual-run').click()
  await until(async () => (await frame.locator('#pulsante').count()) === 1, 15000)
  await frame.locator('#pulsante').click()
  check('nodi: eseguiti nella pagina (dopo i blocchi)', !!(await until(async () => (await frame.locator('#titolo').innerText()) === 'Ciao dai nodi!', 8000)))
  check('nodi: il nodo in esecuzione si illumina', !!(await until(async () => (await page.locator('.vnode.active').count()) > 0, 4000, 50)))
  await run.shot('04-nodi-in-esecuzione')

  // 7. Converti in codice
  await page.getByTestId('nodes-editor').getByRole('button', { name: 'Converti in codice' }).click()
  const ejected = await until(() => read('logica.js').includes('addEventListener') && !read('logica.js').includes('__labStep'), 8000)
  check('converti in codice: file .js pulito, senza i segnali dei passi', !!ejected)

  check('nessun errore JavaScript nella finestra', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
