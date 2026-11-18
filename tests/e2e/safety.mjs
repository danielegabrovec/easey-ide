// Collaudo «non perdere niente, capire cosa succede» (`npm run build` prima), dalla revisione del 15/11/2026:
//  1. diagramma modificato e finestra chiusa subito: il salvataggio rimandato arriva comunque su disco
//  2. chiusa la scheda Benvenuto, un file aperto dall'Esplora va al centro, non nella colonna dell'albero
//  3. un errore resta finché non lo si chiude e finisce nel registro delle attività
//  4. dialoghi: il clic fuori non perde il testo scritto, Esc chiede «Vuoi scartare le modifiche?», ✕ c'è
//  5. database in memoria con tabelle: la chiusura lo elenca fra il lavoro che si perderebbe
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRun, ensureBuilt, until, wait } from './helpers.mjs'

ensureBuilt()
const run = createRun('safety')
const { check } = run

async function closeSidePanel(page) {
  await page.getByTestId('side-panel').waitFor({ timeout: 5000 }).catch(() => undefined)
  if ((await page.getByTestId('side-panel').count()) > 0) await page.keyboard.press('Control+Alt+B')
}

try {
  let page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })
  const root = await run.newProject('console-js', 'Sicurezza')
  await closeSidePanel(page)

  // 1. Diagramma: modifica e chiusura immediata (il salvataggio parte dopo 400 ms).
  await run.palette('Nuovo diagramma')
  await page.locator('[data-diagram-type="flowchart"]').click()
  await page.getByTestId('diagram-name').fill('chiusura')
  await page.getByTestId('diagram-create').click()
  const editor = page.locator('[data-testid="diagram-editor"]').last()
  await until(async () => (await editor.locator('[data-shape]').count()) === 6, 10000)
  await wait(800)
  await editor.locator('[data-shape="decisione"]').dblclick()
  await editor.getByTestId('shape-editor').fill('i ≤ 7')
  await editor.getByTestId('shape-editor').press('Enter')
  const exited = run.app.waitForEvent('close', { timeout: 15000 }).then(() => true, () => false)
  await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
  check('chiusura: la finestra si chiude subito dopo una modifica al diagramma', await exited)
  check('chiusura: l’ultima modifica del diagramma è su disco', readFileSync(join(root, 'chiusura.diagramma.json'), 'utf8').includes('i ≤ 7'))

  writeFileSync(join(root, 'esercizio.py'), 'nome = input("Come ti chiami? ")\nprint("Ciao", nome)\n')
  page = await run.launch()
  await page.waitForSelector('[data-path="main.js"]', { timeout: 20000 })
  await closeSidePanel(page)

  // 2. Pannelli al centro: senza Benvenuto (e senza altri editor) il file non deve finire nella colonna dell'Esplora.
  await run.palette('Ripristina la disposizione')
  const welcomeTab = page.locator('.dv-tab', { hasText: 'Inizio' })
  await welcomeTab.waitFor({ timeout: 5000 })
  await welcomeTab.hover()
  await welcomeTab.locator('.dv-default-tab-action').click()
  await until(async () => (await page.getByTestId('project-home').count()) === 0, 3000)
  await page.locator('[data-path="main.js"]').click()
  const opened = await until(() => page.locator('[data-editor-path="main.js"]').isVisible(), 8000)
  const placement = await page.evaluate(() => {
    const editorEl = document.querySelector('[data-editor-path="main.js"]')
    const treeEl = document.querySelector('[data-path="main.js"]')
    const editorGroup = editorEl?.closest('.dv-groupview')
    const treeGroup = treeEl?.closest('.dv-groupview')
    return { same: !!editorGroup && editorGroup === treeGroup, editorLeft: editorEl?.getBoundingClientRect().left ?? 0, treeRight: treeEl?.getBoundingClientRect().right ?? 9999 }
  })
  check('disposizione: il file aperto dall’Esplora si vede', !!opened)
  check('disposizione: il file va al centro, non nella colonna dell’Esplora', !placement.same && placement.editorLeft >= placement.treeRight - 2, JSON.stringify(placement))
  await run.shot('01-centro')

  // 2b. I file dei linguaggi della Scrittura rapida si aprono anche nei progetti (prima: «non è un file di testo»).
  await page.locator('[data-path="esercizio.py"]').click()
  const python = await until(() => page.locator('[data-editor-path="esercizio.py"] .view-lines').isVisible(), 8000)
  check('linguaggi: un file .py del progetto si apre nell’editor', !!python && (await page.locator('[data-editor-path="esercizio.py"] .view-lines').innerText()).includes('print'))

  // 3. Errore che resta: rinomina su un nome che esiste già.
  await page.locator('[data-path="main.js"]').focus()
  await page.keyboard.press('F2')
  const input = page.locator('.dialog input')
  await input.waitFor()
  await input.fill('easey.json')
  await input.press('Enter')
  const errorToast = page.locator('[data-testid="toast"][data-kind="error"]')
  check('errori: l’avviso d’errore compare', !!(await until(() => errorToast.isVisible(), 5000)))
  await wait(8000)
  check('errori: dopo 8 secondi l’avviso è ancora lì (non sparisce da solo)', await errorToast.isVisible())
  await errorToast.click()
  check('errori: un clic sul testo non lo chiude', await errorToast.isVisible())
  check('errori: il pallino del registro conta l’errore', (await page.locator('[data-testid="status-activity"] .activity-badge').innerText().catch(() => '')) === '1')
  await errorToast.getByTestId('toast-dismiss').click()
  check('errori: ✕ chiude l’avviso', !!(await until(async () => (await errorToast.count()) === 0, 3000)))
  await page.getByTestId('status-activity').click()
  const entry = page.locator('[data-testid="activity-entry"][data-kind="error"]')
  check('registro: l’errore chiuso resta nel registro delle attività', !!(await until(() => entry.first().isVisible(), 3000)) && /esiste/i.test(await entry.first().innerText()))
  await page.keyboard.press('Escape')
  await until(async () => (await page.locator('.dialog').count()) === 0, 3000)

  // 4. Dialoghi che non perdono il testo.
  await page.locator('[data-path="main.js"]').focus()
  await page.keyboard.press('F2')
  await input.waitFor()
  await input.fill('nuovo-nome-scritto.js')
  await page.mouse.click(8, 300)
  await wait(300)
  check('dialoghi: il clic fuori non chiude un dialogo in cui si è scritto', await input.isVisible())
  check('dialoghi: c’è la ✕ nell’intestazione', await page.getByTestId('dialog-close').first().isVisible())
  await page.keyboard.press('Escape')
  const discard = page.locator('.dialog', { hasText: 'Vuoi scartare le modifiche?' })
  check('dialoghi: Esc chiede se scartare quello che si è scritto', !!(await until(() => discard.isVisible(), 3000)))
  await page.keyboard.press('Escape')
  await wait(300)
  check('dialoghi: Esc sulla domanda chiude solo la domanda e il testo resta', (await input.inputValue().catch(() => '')) === 'nuovo-nome-scritto.js')
  await page.getByTestId('dialog-close').first().click()
  await page.locator('.dialog', { hasText: 'Vuoi scartare le modifiche?' }).getByRole('button', { name: 'Scarta le modifiche' }).click()
  check('dialoghi: «Scarta le modifiche» chiude il dialogo', !!(await until(async () => (await page.locator('.dialog').count()) === 0, 3000)))

  // 5. Database in memoria con una tabella → elencato alla chiusura.
  await run.palette('Nuova query SQL')
  const sqlEditor = page.locator('[data-editor-path^="query/query-"] .view-lines')
  const hasEditor = await until(() => sqlEditor.isVisible(), 10000)
  if (hasEditor) {
    await sqlEditor.click()
    await page.keyboard.press('Control+A')
    await page.keyboard.type('CREATE TABLE appunti (testo TEXT);', { delay: 5 })
    await page.keyboard.press('Control+Enter')
    await wait(1500)
  }
  await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
  const others = page.getByTestId('close-others')
  const listed = await until(() => others.isVisible(), 8000)
  check('chiusura: il database in memoria con tabelle è nell’elenco del lavoro da perdere', !!listed && /memoria/.test(await others.innerText()), listed ? '' : hasEditor ? 'dialogo assente' : 'editor SQL non trovato')
  // L'errore voluto del punto 3 (rinomina su un nome esistente) finisce anche nella console: non conta.
  const issues = run.issues.filter((issue) => !issue.includes('Esiste già: easey.json'))
  check('nessun errore nella console', issues.length === 0, issues.join(' | '))
  // «Chiudi senza salvare» chiude davvero (e il collaudo non resta appeso sul dialogo alla fine).
  if (listed) {
    const closed = run.app.waitForEvent('close', { timeout: 15000 }).then(() => true, () => false)
    await page.getByTestId('close-discard').click()
    check('chiusura: «Chiudi senza salvare» chiude l’app', await closed)
    run.app = null
  }
} catch (error) {
  run.fail(error)
} finally {
  await run.finish()
}
