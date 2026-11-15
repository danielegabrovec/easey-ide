// Collaudo delle guide (`npm run build` prima), come in Easey DB:
//  1. primo avvio: invito al primo percorso nel Benvenuto; «Più tardi» lo chiude e non torna al riavvio
//  2. «Cosa fare adesso» senza progetto (crea un progetto, Scrittura rapida, corsi) e con un progetto («Esegui»)
//  3. F1 apre l'aiuto della parte in cui si è (Benvenuto, editor)
//  4. Glossario con la ricerca
//  5. percorso «Il tuo primo programma»: il passo va avanti da solo quando si fa l'azione vera; ✕ esce
import { createRun, ensureBuilt, until, wait } from './helpers.mjs'

ensureBuilt()
const run = createRun('guide')
const { check } = run

try {
  let page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })

  // 1. Invito al primo percorso
  const offer = page.getByTestId('guide-offer')
  check('primo avvio: invito al primo percorso nel Benvenuto', !!(await until(() => offer.isVisible(), 5000)))
  await page.getByTestId('guide-offer-later').click()
  check('«Più tardi» chiude l’invito', !!(await until(async () => (await offer.count()) === 0, 3000)))

  // 2. Cosa fare adesso, senza progetto
  const next = page.getByTestId('welcome-next-steps')
  check('«Cosa fare adesso» c’è nel Benvenuto', !!(await until(() => next.isVisible(), 5000)))
  const noProject = await until(async () => (await page.getByTestId('next-hint-no-project').count()) === 1 && (await page.getByTestId('next-hint-quick').count()) === 1, 5000)
  check('senza progetto propone di crearne uno e la Scrittura rapida', !!noProject)

  // 3. F1 nel Benvenuto
  await page.locator('.welcome').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('F1')
  const help = page.getByTestId('help-page')
  check('F1 apre l’aiuto della parte in cui sei (Benvenuto)', !!(await until(async () => (await help.getAttribute('data-page')) === 'benvenuto', 3000)))
  check('la pagina d’aiuto ha il suo testo', (await help.innerText()).includes('Scrittura rapida'))
  await page.keyboard.press('Escape')
  await until(async () => (await page.locator('.dialog').count()) === 0, 3000)

  // Progetto: il suggerimento diventa «Esegui»; F1 nell'editor
  await run.newProject('web-js', 'Guide')
  await page.getByTestId('side-panel').waitFor({ timeout: 5000 }).catch(() => undefined)
  if ((await page.getByTestId('side-panel').count()) > 0) await page.keyboard.press('Control+Alt+B')
  await run.palette('Benvenuto')
  check('con un progetto propone di eseguirlo', !!(await until(async () => (await page.getByTestId('next-hint-run').count()) === 1, 5000)))
  await page.getByTestId('next-hint-run').click()
  check('il suggerimento esegue davvero (anteprima attiva)', !!(await until(async () => (await page.locator('.dv-tab.dv-active-tab', { hasText: 'Anteprima' }).count()) > 0, 8000)))
  await wait(1000)
  await run.palette('Benvenuto')
  check('dopo l’esecuzione il suggerimento «Esegui» sparisce', !!(await until(async () => (await page.getByTestId('welcome-next-steps').isVisible()) && (await page.getByTestId('next-hint-run').count()) === 0, 6000)))
  await page.locator('[data-path="index.html"]').click()
  await page.locator('[data-editor-path="index.html"] .view-lines').click()
  await page.keyboard.press('F1')
  check('F1 nell’editor apre l’aiuto dell’editor (non la palette di Monaco)', !!(await until(async () => (await help.getAttribute('data-page').catch(() => null)) === 'editor', 3000)))
  await page.keyboard.press('Escape')
  await until(async () => (await page.locator('.dialog').count()) === 0, 3000)

  // 4. Glossario
  await run.palette('Glossario della programmazione')
  const search = page.getByTestId('glossary-search')
  await search.waitFor({ timeout: 5000 })
  await search.fill('ciclo')
  check('glossario: la ricerca trova «Ciclo»', !!(await until(async () => (await page.locator('[data-glossary-term="ciclo"]').count()) === 1, 3000)))
  await search.fill('zzzz')
  check('glossario: nessun risultato lo dice', await page.getByTestId('glossary-empty').isVisible())
  await run.shot('01-glossario')

  // 5. Percorso «Il tuo primo programma»
  await run.palette('Percorsi guidati')
  await page.getByTestId('tour-start-primo-programma').click()
  const bubble = page.getByTestId('tour-bubble')
  check('percorso: la nuvoletta parte dal primo passo', !!(await until(async () => (await bubble.getAttribute('data-step')) === 'intro', 3000)))
  await page.keyboard.press('Enter')
  check('Invio va al passo dopo (apri la Scrittura rapida)', !!(await until(async () => (await bubble.getAttribute('data-step')) === 'open', 3000)))
  check('il pulsante da premere è evidenziato', !!(await until(() => page.getByTestId('tour-spot').isVisible(), 3000)))
  await page.getByTestId('open-quick').click()
  check('fatta l’azione vera, il percorso va avanti da solo', !!(await until(async () => (await bubble.getAttribute('data-step')) === 'language', 5000)))
  check('«Passo 3 di 7»', (await page.getByTestId('tour-progress').innerText()).includes('3'))
  await run.shot('02-percorso')
  await page.getByTestId('tour-exit').click()
  check('✕ esce dal percorso', !!(await until(async () => (await page.getByTestId('tour').count()) === 0, 3000)))

  check('nessun errore nella console', run.issues.length === 0, run.issues.join(' | '))

  // Riavvio: l'invito non torna
  await run.app.close()
  page = await run.launch()
  await page.waitForSelector('.toolbar', { timeout: 20000 })
  await run.palette('Benvenuto')
  await wait(800)
  check('dopo il riavvio l’invito non torna', (await page.getByTestId('guide-offer').count()) === 0)
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
