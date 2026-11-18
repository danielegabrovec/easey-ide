// Collaudo della schermata iniziale (disegno comune approvato: docs/SCHERMATA-INIZIALE.md di Easey DB).
// `npm run build` prima. Con LAB_IDE_SHOTS salva le schermate in scuro e chiaro, larga e a 1024×700.
//  1. senza progetto: a tutta finestra, Esplora/Anteprima/Console/assistente non si vedono; titolo, tre strade,
//     «Oppure», Impara (Manuale con avanzamento, percorsi), modelli
//  2. il pulsante «AI» apre l'assistente sopra la schermata e lo richiude
//  3. aperto un progetto torna la disposizione di lavoro; il logo riporta la schermata (con «Torna a…» ed Esc)
//  4. «Riprendi»: il progetto recente con la data in parole e «Apri»
//  5. 1024×700: niente scorrimento in orizzontale, titoli delle strade su una riga, tema chiaro
import { createRun, ensureBuilt, until, wait } from './helpers.mjs'

ensureBuilt()
const run = createRun('start')
const { check } = run

const visible = (page, selector) => page.evaluate((s) => {
  const el = document.querySelector(s)
  if (!el) return false
  const r = el.getBoundingClientRect()
  if (!r.width || !r.height) return false
  // Coperto dalla schermata iniziale? Si guarda cosa c'è davvero al centro dell'elemento.
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 20))
  return !!top && (el === top || el.contains(top))
}, selector)

async function layoutChecks(page, label) {
  const result = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="start-host"]')
    const desk = document.querySelector('.start-desk')
    const titles = [...document.querySelectorAll('.start-road strong')].map((el) => {
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 22
      return el.getBoundingClientRect().height <= lh * 1.4
    })
    return { scrollX: host ? host.scrollWidth - host.clientWidth : -1, deskWidth: desk?.getBoundingClientRect().width ?? 0, titlesOneLine: titles.every(Boolean), roads: titles.length }
  })
  check(`${label}: niente scorrimento in orizzontale`, result.scrollX <= 1, JSON.stringify(result))
  check(`${label}: i titoli delle tre strade stanno su una riga`, result.roads === 3 && result.titlesOneLine, JSON.stringify(result))
}

try {
  let page = await run.launch()
  await page.waitForSelector('[data-testid="start-screen"]', { timeout: 20000 })
  await wait(600)

  // 1. Tutta la finestra.
  check('senza progetto la schermata iniziale c’è', await page.getByTestId('start-screen').isVisible())
  const cover = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="start-host"]').getBoundingClientRect()
    const dock = document.querySelector('.dock-host').getBoundingClientRect()
    return { w: Math.abs(host.width - dock.width), h: Math.abs(host.height - dock.height), win: window.innerWidth - host.width }
  })
  check('…copre tutta l’area dei pannelli', cover.w < 2 && cover.h < 2 && cover.win < 4, JSON.stringify(cover))
  check('…Esplora, Anteprima e Console non si vedono', !(await visible(page, '[data-testid="explorer-tree"], .tree')) && !(await visible(page, '.dv-tab')))
  check('…e nemmeno la colonna dell’assistente', (await page.getByTestId('side-panel').count()) === 0)
  check('titolo «Cosa costruiamo oggi?»', (await page.locator('.start-hero h1').innerText()) === 'Cosa costruiamo oggi?')
  check('nome, versione e stato dell’AI', (await page.locator('.start-who').innerText()).includes('Easey IDE') && /versione \d+\.\d+/.test(await page.locator('.start-who').innerText()) && (await page.getByTestId('start-ai').count()) === 1)
  check('l’illustrazione: il codice e la pagina che produce', (await page.locator('.start-code pre').innerText()).includes('conta.onclick') && (await page.locator('.start-page .body').innerText()).includes('Ciao, Ada!'))
  check('tre strade, la prima evidenziata', (await page.locator('.start-road').count()) === 3 && (await page.locator('.start-road.main').getAttribute('data-testid')) === 'welcome-new-project')
  check('«Oppure» con le altre strade e le scorciatoie', (await page.locator('.start-more').innerText()).includes('Scrittura rapida') && (await page.locator('.start-more kbd').count()) >= 2)
  check('«Riprendi» senza progetti invita a creare il primo', await page.getByTestId('start-recent-empty').isVisible())
  check('«Impara»: invito al primo percorso, Manuale, novità', (await page.getByTestId('guide-offer').count()) === 1 && (await page.getByTestId('start-manual').count()) === 1 && (await page.getByTestId('start-news').count()) === 1)
  check('i modelli di progetto in una riga', !!(await until(async () => (await page.locator('.start-model').count()) >= 4, 5000)))
  await layoutChecks(page, '1500×920 scuro')
  await run.shot('01-scuro')

  // 2. Assistente sopra la schermata.
  await page.getByTestId('toolbar-assistant').click()
  check('«AI» nella barra apre l’assistente anche sopra la schermata', !!(await until(async () => (await page.getByTestId('side-panel').count()) === 1, 3000)))
  await page.getByTestId('toolbar-assistant').click()
  check('…e lo richiude', !!(await until(async () => (await page.getByTestId('side-panel').count()) === 0, 3000)))

  // 3. Progetto: torna il lavoro; il logo riporta la schermata.
  await page.getByTestId('guide-offer-later').click()
  await run.newProject('web-js', 'Inizio')
  check('aperto un progetto la schermata se ne va', !!(await until(async () => (await page.getByTestId('start-screen').count()) === 0, 8000)))
  check('…e torna la disposizione di lavoro (Esplora con i file, Anteprima, Console)', !!(await until(async () => (await visible(page, '[data-path="index.html"]')) && (await page.locator('.dv-tab', { hasText: 'Anteprima' }).count()) === 1 && (await page.locator('.dv-tab', { hasText: 'Console' }).count()) === 1, 8000)))
  await page.getByTestId('brand-home').click()
  check('il logo riporta la schermata iniziale', !!(await until(() => page.getByTestId('start-screen').isVisible(), 3000)))
  check('…con «Torna a «Inizio»»', (await page.getByTestId('start-back').innerText()).includes('Inizio'))
  // 4. Riprendi.
  const first = page.locator('.start-recent li').first()
  check('«Riprendi»: il progetto con la data in parole', (await first.innerText()).includes('Inizio') && /aperto adesso|oggi, \d/.test(await first.innerText()), await first.innerText())
  await page.keyboard.press('Escape')
  check('Esc torna al progetto', !!(await until(async () => (await page.getByTestId('start-screen').count()) === 0, 3000)))
  await page.getByTestId('brand-home').click()
  await page.getByTestId('start-back').click()
  check('«Torna a…» torna al progetto', !!(await until(async () => (await page.getByTestId('start-screen').count()) === 0, 3000)))

  check('nessun errore nella console', run.issues.length === 0, run.issues.join(' | '))

  // 5. Riavvio: c'è il recente (data «oggi»), poi finestra stretta e tema chiaro.
  await run.app.close()
  page = await run.launch()
  await page.waitForSelector('[data-testid="start-screen"], .toolbar', { timeout: 20000 })
  await page.getByTestId('brand-home').click()
  await page.getByTestId('start-screen').waitFor({ timeout: 5000 })
  await wait(400)
  await run.shot('02-scuro-recenti')
  await page.setViewportSize({ width: 1024, height: 700 })
  await wait(400)
  await layoutChecks(page, '1024×700 scuro')
  await run.shot('03-scuro-1024')
  await run.palette('Cambia tema')
  await page.getByTestId('brand-home').click()
  await page.getByTestId('start-screen').waitFor({ timeout: 5000 })
  await wait(400)
  check('tema chiaro attivo', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light')
  await layoutChecks(page, '1024×700 chiaro')
  await run.shot('04-chiaro-1024')
  await page.setViewportSize({ width: 1500, height: 920 })
  await wait(400)
  await run.shot('05-chiaro')
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
