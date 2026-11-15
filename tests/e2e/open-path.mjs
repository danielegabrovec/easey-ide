// Collaudo dell'apertura da riga di comando (1.6, per «Apri in Easey IDE» di Easey DB). `npm run build` prima.
//  1. avvio con un file .py fuori da ogni progetto → Scrittura rapida in Python con quel testo
//  2. avvio con una cartella → aperta come progetto (vince sull'ultimo progetto)
//  3. app già aperta, secondo avvio con un file del progetto → si apre nell'editor (second-instance)
//  4. secondo avvio con un file .sql fuori dal progetto → Scrittura rapida in SQL
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRun, electronExe, ensureBuilt, packagedExe, repo, until, wait } from './helpers.mjs'

ensureBuilt()
const run = createRun('open-path')
const { check } = run

const examples = join(run.work, 'Documenti', 'Easey DB', 'Esempi')
mkdirSync(examples, { recursive: true })
const pyFile = join(examples, 'saluto 1.py')
writeFileSync(pyFile, 'nome = "Ada"\nprint("Ciao", nome)\n')
const sqlFile = join(examples, 'clienti.sql')
writeFileSync(sqlFile, 'SELECT 42 AS risposta;\n')
const site = join(run.work, 'Sito')
mkdirSync(site, { recursive: true })
writeFileSync(join(site, 'index.html'), '<!doctype html>\n<h1>Sito da Easey DB</h1>\n')
writeFileSync(join(site, 'app.js'), 'console.log("da Easey DB")\n')

const editorText = (page, selector) => page.evaluate((s) => (document.querySelector(s)?.textContent ?? '').replace(/ /g, ' '), selector)

/** Un secondo avvio dell'app con un percorso: lo stesso userData, quindi second-instance nell'app aperta. */
function secondLaunch(path) {
  const env = { ...process.env, LAB_IDE_USER_DATA: join(run.work, 'userData') }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(packagedExe ?? electronExe, packagedExe ? [path] : ['.', path], { cwd: repo, env, stdio: 'ignore' })
  return new Promise((resolve) => {
    child.on('exit', () => resolve(true))
    setTimeout(() => resolve(false), 15000)
  })
}

try {
  // 1. File .py fuori da un progetto.
  let page = await run.launch({}, [pyFile])
  await page.waitForSelector('.toolbar', { timeout: 20000 })
  check('un file .py passato all’avvio apre la Scrittura rapida', !!(await until(() => page.getByTestId('quick-panel').isVisible(), 15000)))
  check('…in Python', !!(await until(async () => (await page.getByTestId('quick-panel').getAttribute('data-language')) === 'python', 8000)))
  check('…con il testo del file', !!(await until(async () => (await editorText(page, '[data-testid="quick-editor"] .view-lines')).includes('print("Ciao", nome)'), 8000)))
  check('…e dice da dove viene', !!(await until(async () => (await page.getByTestId('toast').allInnerTexts()).some((text) => text.includes('saluto 1.py')), 5000)))
  check('nessun errore nella console (avvio con un file)', run.issues.length === 0, run.issues.join(' | '))
  await run.app.close()

  // 2. Cartella → progetto.
  page = await run.launch({}, [site])
  await page.waitForSelector('.toolbar', { timeout: 20000 })
  check('una cartella passata all’avvio si apre come progetto', !!(await until(async () => (await page.locator('[data-path="index.html"]').count()) === 1 && (await page.locator('[data-path="app.js"]').count()) === 1, 15000)))
  check('…il nome del progetto è quello della cartella', (await page.locator('.project-name').innerText().catch(() => '')).includes('Sito'))

  // 3. Secondo avvio con un file del progetto aperto.
  check('secondo avvio: termina subito (passa il file all’app aperta)', await secondLaunch(join(site, 'app.js')))
  check('…e il file del progetto si apre nell’editor', !!(await until(() => page.locator('[data-editor-path="app.js"]').isVisible(), 10000)))

  // 4. Secondo avvio con un .sql fuori dal progetto.
  await secondLaunch(sqlFile)
  check('secondo avvio con un .sql fuori dal progetto: Scrittura rapida in SQL', !!(await until(async () => (await page.getByTestId('quick-panel').getAttribute('data-language').catch(() => null)) === 'sql', 10000)))
  check('…con la query del file', !!(await until(async () => (await editorText(page, '[data-testid="quick-editor"] .view-lines')).includes('SELECT 42'), 8000)))
  await wait(300)
  check('nessun errore nella console', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
