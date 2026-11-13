// Collaudo del guscio dell'IDE (`npm run build` prima):
//  1. chiusura subito dopo una modifica: il salvataggio automatico in sospeso arriva comunque su disco
//  2. salvataggio automatico spento: alla chiusura si chiede cosa fare (Annulla tiene aperto, Salva e chiudi salva)
//  3. progetti recenti: all'avvio un progetto sparito non dà errori; aprendolo si propone di toglierlo; la X lo toglie
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createRun, ensureBuilt, until, wait } from './helpers.mjs'

ensureBuilt()
const run = createRun('shell')
const { check } = run

/** Chiude la finestra come la X e aspetta che l'app sia uscita. */
async function closeWindow() {
  const exited = run.app.waitForEvent('close', { timeout: 15000 }).then(() => true, () => false)
  await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
  return exited
}

async function typeAtEnd(path, text) {
  const page = run.page
  await page.locator(`[data-path="${path}"]`).click()
  const editor = page.locator(`[data-editor-path="${path}"] .view-lines`)
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type(text, { delay: 5 })
}

try {
  let page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })
  const root = await run.newProject('web-js', 'Guscio')
  const scriptFile = join(root, 'script.js')

  // 1. Chiusura immediata: il salvataggio automatico (700 ms) non si perde.
  await typeAtEnd('script.js', '// scritto e chiuso subito')
  check('chiusura: la finestra si chiude con il salvataggio automatico attivo', await closeWindow())
  check('chiusura: la modifica appena scritta è su disco', readFileSync(scriptFile, 'utf8').includes('// scritto e chiuso subito'))

  // 2. Salvataggio automatico spento → dialogo alla chiusura.
  page = await run.launch()
  await page.waitForSelector('[data-path="script.js"]', { timeout: 20000 })

  // Accessibilità dei dialoghi: fuoco dentro, Tab che gira, Esc solo sul dialogo in cima, fuoco restituito.
  await page.locator('[data-path="script.js"]').click()
  await page.locator('[data-editor-path="script.js"] .view-lines').click()
  const inEditor = () => page.evaluate(() => !!document.activeElement?.closest('[data-editor-path="script.js"]'))
  check('dialoghi: il fuoco parte dall’editor', await inEditor())
  await page.keyboard.press('Control+,')
  await page.locator('.dialog').waitFor()
  const inDialog = () => page.evaluate(() => !!document.activeElement?.closest('.dialog'))
  check('dialoghi: all’apertura il fuoco entra nel dialogo', !!(await until(inDialog, 3000)))
  check('dialoghi: le etichette delle impostazioni sono collegate ai campi', (await page.getByLabel('Tema', { exact: true }).count()) === 1 && (await page.getByLabel('Lingua').count()) === 1)
  let trapped = true
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press(i % 7 === 6 ? 'Shift+Tab' : 'Tab')
    if (!(await inDialog())) trapped = false
  }
  check('dialoghi: Tab e Maiusc+Tab restano dentro il dialogo', trapped)
  await page.keyboard.press('Escape')
  await page.locator('.dialog').waitFor({ state: 'detached' })
  check('dialoghi: chiuso il dialogo, il fuoco torna all’editor', !!(await until(inEditor, 3000)))
  await run.palette('Informazioni')
  await page.getByTestId('about-license').click()
  await page.getByTestId('legal-text').waitFor()
  check('dialoghi: due dialoghi sovrapposti', (await page.locator('.dialog').count()) === 2)
  await page.keyboard.press('Escape')
  await wait(300)
  check('dialoghi: Esc chiude solo quello in cima', (await page.locator('.dialog').count()) === 1 && (await page.getByTestId('about-author').isVisible()))
  check('dialoghi: il fuoco torna al dialogo sotto', await inDialog())
  await page.keyboard.press('Escape')
  await page.locator('.dialog').waitFor({ state: 'detached' })
  await run.palette('Scorciatoie da tastiera')
  await page.getByTestId('shortcuts-search').fill('salva')
  const rows = await page.locator('[data-shortcut]').allInnerTexts()
  check('scorciatoie: la ricerca filtra l’elenco', rows.length > 0 && rows.every((r) => /salva/i.test(r)) && rows.some((r) => r.includes('Ctrl+S')), rows.join(' | '))
  await page.keyboard.press('Escape')
  await page.locator('.dialog').waitFor({ state: 'detached' })

  await page.keyboard.press('Control+,')
  // Casella controllata dalle impostazioni (salvate dal main): si clicca e si aspetta il nuovo stato.
  const autoSave = page.getByLabel('Salva automaticamente mentre scrivi')
  await autoSave.click()
  check('impostazioni: salvataggio automatico spento', !!(await until(async () => !(await autoSave.isChecked()), 5000)))
  await page.locator('.dialog footer .btn.primary').click()
  await page.locator('.dialog').waitFor({ state: 'detached' })
  await typeAtEnd('script.js', '// da salvare alla chiusura')
  await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
  const asked = await until(() => page.getByTestId('close-save').isVisible(), 8000)
  check('chiusura senza salvataggio automatico: si chiede cosa fare', !!asked)
  check('chiusura: il dialogo elenca il file modificato', (await page.locator('.close-files').innerText().catch(() => '')).includes('script.js'))
  await run.shot('01-chiusura')
  await page.getByTestId('close-cancel').click()
  await wait(600)
  check('chiusura: Annulla lascia la finestra aperta', await page.locator('.shell').isVisible())
  check('chiusura: Annulla non salva', !readFileSync(scriptFile, 'utf8').includes('// da salvare alla chiusura'))
  const exited = run.app.waitForEvent('close', { timeout: 15000 }).then(() => true, () => false)
  await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
  await page.getByTestId('close-save').click()
  check('chiusura: Salva e chiudi chiude l’app', await exited)
  check('chiusura: Salva e chiudi scrive il file', readFileSync(scriptFile, 'utf8').includes('// da salvare alla chiusura'))

  // 3. Progetti recenti: un secondo progetto, poi la sua cartella sparisce.
  page = await run.launch()
  await page.waitForSelector('[data-path="script.js"]', { timeout: 20000 })
  const other = await run.newProject('empty', 'Sparito')
  await run.newProject('empty', 'Da togliere')
  await closeWindow()
  rmSync(other, { recursive: true, force: true })
  // L'ultimo progetto aperto («Da togliere») sparisce anch'esso: all'avvio si resta sul Benvenuto, senza errori.
  rmSync(join(run.projects, 'Da togliere'), { recursive: true, force: true })
  page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })
  await wait(1500)
  check('recenti: nessun avviso d’errore all’avvio se l’ultimo progetto non c’è più', (await page.locator('.toast.error').count()) === 0, await page.locator('.toast').allInnerTexts().then((t) => t.join(' | ')))
  await page.locator('[data-recent="Sparito"] .recent-open').click()
  const proposed = await until(() => page.locator('.dialog').filter({ hasText: 'Progetto non trovato' }).isVisible(), 8000)
  check('recenti: un progetto sparito propone di toglierlo dall’elenco', !!proposed)
  await run.shot('02-recente-sparito')
  await page.locator('.dialog footer .btn.primary').click()
  check('recenti: tolto dall’elenco', !!(await until(async () => (await page.locator('[data-recent="Sparito"]').count()) === 0, 5000)))
  await page.locator('[data-recent="Da togliere"]').hover()
  await page.locator('[data-recent="Da togliere"] [data-testid="recent-forget"]').click()
  check('recenti: la X toglie un progetto dall’elenco', !!(await until(async () => (await page.locator('[data-recent="Da togliere"]').count()) === 0, 5000)))
  check('recenti: il progetto ancora esistente resta', (await page.locator('[data-recent="Guscio"]').count()) === 1)
  const settingsFile = JSON.parse(readFileSync(join(run.work, 'userData', 'settings.json'), 'utf8'))
  check('recenti: l’elenco aggiornato è salvato', settingsFile.recent.length === 1 && settingsFile.recent[0].name === 'Guscio')

  check('nessun errore nella console dell IDE', run.issues.length === 0, run.issues.slice(0, 3).join(' | '))
} catch (error) {
  run.fail(error)
}
await run.finish()
