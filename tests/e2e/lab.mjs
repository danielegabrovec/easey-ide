// Collaudo del Laboratorio (1.6, `npm run build` prima), la disposizione didattica come in Easey DB:
//  1. il pulsante «Laboratorio»: al centro la Scrittura rapida con la striscia degli esempi, sotto Output, a sinistra
//     Raccolta e File, a destra Esecuzioni sopra l'Assistente AI
//  2. ▶ di un esempio: scritto ed eseguito, l'output sotto, una riga nelle Esecuzioni
//  3. clic sulla riga = il codice torna nell'editor; doppio clic = di nuovo eseguito (senza righe doppie)
//  4. Ctrl+Alt+B chiude e riapre l'assistente nella griglia; «Manuale» apre e chiude il Manuale
//  5. riavvio: il Laboratorio e la cronologia restano; «Standard» rimette tutto com'era
import { createRun, ensureBuilt, until, wait } from './helpers.mjs'

ensureBuilt()
const run = createRun('lab')
const { check } = run

const box = (page, selector) => page.locator(selector).first().evaluate((el) => el.getBoundingClientRect().toJSON())
// Monaco scrive gli spazi come spazi unificatori: si normalizzano.
const editorText = (page) => page.evaluate(() => (document.querySelector('[data-testid="quick-editor"] .view-lines')?.textContent ?? '').replace(/\u00a0/g, ' '))

try {
  let page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })

  // 1. Disposizione.
  await page.getByTestId('lab-toggle').click()
  check('il pulsante «Laboratorio» si accende', !!(await until(async () => (await page.getByTestId('lab-toggle').getAttribute('aria-pressed')) === 'true', 3000)))
  check('striscia degli esempi sopra l’editor', !!(await until(() => page.getByTestId('lab-strip').isVisible(), 8000)))
  await page.getByTestId('quick-editor').waitFor({ timeout: 10000 })
  check('l’output è un pannello sotto, non dentro la Scrittura rapida', (await page.locator('[data-testid="quick-panel"] .quick-output').count()) === 0 && (await page.getByTestId('quick-output-panel').isVisible()))
  const editor = await box(page, '[data-testid="quick-editor"]')
  const output = await box(page, '[data-testid="quick-output-panel"]')
  const history = await box(page, '[data-testid="lab-history"]')
  const ai = await box(page, '[data-testid="ai-docked"]')
  const files = await box(page, '[data-testid="quick-collection"]')
  check('Output sotto l’editor', output.top >= editor.bottom - 2)
  check('Esecuzioni a destra, sopra l’Assistente AI', history.left >= editor.right - 2 && ai.top >= history.bottom - 2 && Math.abs(ai.left - history.left) < 4)
  check('Raccolta (i file) a sinistra', files.right <= editor.left + 2)
  check('l’assistente è nella griglia: niente colonna laterale', (await page.getByTestId('side-panel').count()) === 0 && (await page.getByTestId('side-reopen').count()) === 0)
  check('la scheda «File» (Esplora) accanto alla Raccolta', (await page.locator('.dv-tab', { hasText: /^File$/ }).count()) === 1)
  check('i pulsanti Guida e Manuale', (await page.getByTestId('lab-guide').isVisible()) && (await page.getByTestId('lab-manual').isVisible()))
  await run.shot('01-laboratorio')

  // 2. Esempio eseguito.
  await page.getByTestId('lab-example-run-loop').click()
  const outputPanel = page.getByTestId('quick-output-panel')
  check('▶ dell’esempio: scritto ed eseguito, output sotto', !!(await until(async () => (await outputPanel.innerText()).includes('al quadrato fa 25'), 15000)), (await outputPanel.innerText()).slice(0, 200))
  const rows = page.getByTestId('lab-run')
  check('una riga nelle Esecuzioni, riuscita', !!(await until(async () => (await rows.count()) === 1 && (await rows.first().getAttribute('data-outcome')) === 'ok', 8000)))

  // 3. Di nuovo nell'editor / di nuovo eseguito.
  await page.getByTestId('lab-example-hello').click()
  check('clic su un esempio: lo scrive nell’editor', !!(await until(async () => (await editorText(page)).includes('Ciao, mondo!'), 3000)))
  await rows.first().click()
  check('clic sulla riga: il codice eseguito torna nell’editor', !!(await until(async () => (await editorText(page)).includes('al quadrato fa'), 3000)))
  await rows.first().dblclick()
  await wait(1500)
  check('doppio clic: eseguito di nuovo, senza righe doppie', (await rows.count()) === 1 && (await outputPanel.innerText()).includes('al quadrato fa 25'))

  // 4. Assistente e Manuale.
  await page.locator('[data-testid="quick-editor"] .view-lines').click()
  await page.keyboard.press('Control+Alt+B')
  check('Ctrl+Alt+B chiude l’assistente nella griglia', !!(await until(async () => (await page.getByTestId('ai-docked').count()) === 0, 3000)))
  check('…senza aprire la colonna laterale', (await page.getByTestId('side-panel').count()) === 0)
  await page.keyboard.press('Control+Alt+B')
  check('Ctrl+Alt+B lo riapre sotto le Esecuzioni', !!(await until(async () => (await page.getByTestId('ai-docked').count()) === 1, 3000)))
  await page.getByTestId('lab-manual').click()
  check('«Manuale» apre il Manuale', !!(await until(() => page.getByTestId('learn-panel').isVisible(), 5000)))
  await page.getByTestId('lab-manual').click()
  check('un secondo clic lo chiude', !!(await until(async () => (await page.getByTestId('learn-panel').count()) === 0, 3000)))

  check('nessun errore nella console', run.issues.length === 0, run.issues.join(' | '))

  // 5. Riavvio e ritorno alla Standard.
  await run.app.close()
  page = await run.launch()
  check('al riavvio il Laboratorio resta', !!(await until(() => page.getByTestId('lab-strip').isVisible(), 15000)))
  check('…e la cronologia anche', !!(await until(async () => (await page.getByTestId('lab-run').count()) === 1, 5000)))
  await page.getByTestId('lab-toggle').click()
  check('«Standard»: la striscia sparisce', !!(await until(async () => (await page.getByTestId('lab-strip').count()) === 0, 5000)))
  check('…l’output torna dentro la Scrittura rapida', !!(await until(async () => (await page.locator('[data-testid="quick-panel"] .quick-output').count()) === 1, 5000)))
  check('…Esplora, anteprima e console tornano al loro posto', (await page.locator('.dv-tab', { hasText: 'Esplora' }).count()) === 1 && (await page.locator('.dv-tab', { hasText: 'Anteprima' }).count()) === 1 && (await page.locator('.dv-tab', { hasText: 'Console' }).count()) === 1)
  check('…e l’assistente torna nella colonna laterale (o il suo pulsante)', (await page.getByTestId('side-panel').count()) + (await page.getByTestId('side-reopen').count()) === 1 && (await page.getByTestId('ai-docked').count()) === 0)
  await run.shot('02-standard')
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
