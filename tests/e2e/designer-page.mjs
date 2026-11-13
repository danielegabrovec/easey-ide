// Collaudo della fetta «Si parte bene» (piano design, 13/11/2026): la landing occupa tutta la larghezza
// a ogni misura, il body si stila sul suo tag, i temi ricolorano anche i pulsanti, le immagini sono
// segnaposto locali con proporzione e ritaglio scelti dall'ispettore.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRun, ensureBuilt, until, wait } from './helpers.mjs'

ensureBuilt()
const run = createRun('designer-page')
const { check } = run

try {
  const page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })
  const root = await run.newProject('web-js', 'Landing')
  const html = () => readFileSync(join(root, 'index.html'), 'utf8')
  const css = () => readFileSync(join(root, 'style.css'), 'utf8')

  await page.getByTestId('open-designer').click()
  const frame = page.frameLocator('[data-testid="designer-frame"]')
  check('canvas pronto', !!(await until(async () => (await frame.locator('h1').count()) === 1, 15000)))
  await wait(400)

  const inFrame = (fn, arg) => page.evaluate(([source, arg]) => new Function('d', 'arg', `return (${source})(d, arg)`)(document.querySelector('[data-testid="designer-frame"]').contentDocument, arg), [fn.toString(), arg])
  const background = (selector) => inFrame((d, s) => { const n = d.querySelector(s); return n ? getComputedStyle(n).backgroundColor : null }, selector)
  const clickIn = async (selector) => {
    const box = await frame.locator(selector).first().boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  }
  const theme = async (id) => {
    await page.getByTestId('insp-tab-site').click()
    await page.locator(`[data-theme-id="${id}"]`).click()
    await until(async () => (await page.locator(`[data-theme-id="${id}"].active`).count()) === 1, 5000)
    await page.getByTestId('insp-tab-style').click()
  }

  // 1. Il pulsante del modello segue il tema (prima restava indaco: due sistemi di colori).
  check('modello: pulsante indaco all’inizio', (await background('#pulsante')) === 'rgb(79, 70, 229)', await background('#pulsante'))
  await theme('oceano')
  check('tema Oceano: il pulsante del modello cambia colore', !!(await until(async () => (await background('#pulsante')) === 'rgb(3, 105, 161)', 5000)), await background('#pulsante'))
  check('tema: i nomi brevi del modello diventano alias', /--accento: var\(--colore-primario\);/.test(css()))

  // 2. Il body si stila sul selettore `body`, senza id aggiunto.
  const host = await page.getByTestId('designer-overlay').boundingBox()
  await page.mouse.click(host.x + 20, host.y + 20)
  check('clic sullo sfondo: selezionato il body', (await page.getByTestId('insp-selector').innerText()).startsWith('body'), await page.getByTestId('insp-selector').innerText())
  await page.getByTestId('style-padding-top').fill('8px')
  await page.getByTestId('style-padding-top').press('Enter')
  check('body: regola sul tag body, nessun id nell’HTML', !!(await until(() => /\nbody \{[^}]*padding: 8px 0 0;/.test(css()) && !/<body[^>]*id=/.test(html()), 8000)), css().slice(-200))
  await page.keyboard.press('Control+z')
  await page.getByTestId('designer-overlay').focus()
  await page.keyboard.press('Control+z')
  await until(() => !/padding: 8px 0 0/.test(css()), 5000)

  // 3. Pagina intera: si sceglie «Sostituisci la pagina».
  await page.getByTestId('designer-palette-search').fill('landing')
  await page.locator('[data-block="pagina-presentazione"]').click()
  await page.locator('.dialog').waitFor()
  check('pagina intera: chiede se sostituire o aggiungere', (await page.getByTestId('page-replace').count()) === 1 && (await page.getByTestId('page-append').count()) === 1)
  await page.getByTestId('page-replace').click()
  const replaced = await until(() => html().includes('class="lab-pagina"') && !html().includes('class="scheda"') && html().includes('<script src="script.js"></script>'), 8000)
  check('sostituisci: via la scheda del modello, la landing al suo posto, lo script resta', !!replaced, html().slice(html().indexOf('<body>'), html().indexOf('<body>') + 200))
  check('sostituisci: il body non è più una griglia centrata', !/body \{[^}]*place-items/.test(css()) && /body \{[^}]*margin: 0;/.test(css()))
  await page.getByTestId('designer-palette-search').fill('')
  await until(async () => (await frame.locator('.lab-hero').count()) === 1, 5000)
  const styled = await until(() => inFrame((d) => getComputedStyle(d.querySelector('.lab-hero')).backgroundImage.includes('gradient') && getComputedStyle(d.querySelector('.lab-intestazione')).display === 'flex'), 5000)
  check('sostituisci: nel canvas la landing ha già i suoi stili', !!styled)

  // 4. A tutta larghezza alle tre misure.
  for (const bp of ['desktop', 'tablet', 'phone']) {
    await page.getByTestId(`bp-${bp}`).click()
    await wait(400)
    const sizes = await inFrame((d) => ({ view: d.documentElement.clientWidth, page: d.querySelector('.lab-pagina').getBoundingClientRect().width, hero: d.querySelector('.lab-hero').getBoundingClientRect().width, overflow: d.documentElement.scrollWidth - d.documentElement.clientWidth }))
    check(`${bp}: la landing occupa tutta la larghezza (${sizes.view} px)`, Math.abs(sizes.page - sizes.view) <= 1 && Math.abs(sizes.hero - sizes.view) <= 1, JSON.stringify(sizes))
    check(`${bp}: niente scorrimento orizzontale`, sizes.overflow <= 0, JSON.stringify(sizes))
    await run.shot(`01-landing-${bp}`)
  }
  await page.getByTestId('bp-desktop').click()

  // 5. I pulsanti delle sezioni seguono il tema (anche quello del modulo contatti).
  await clickIn('.lab-piede')
  await page.getByTestId('designer-palette-search').fill('contatti con modulo')
  await page.locator('[data-block="contatti"]').click()
  await page.getByTestId('designer-palette-search').fill('')
  await until(async () => (await frame.locator('.lab-modulo button').count()) === 1, 8000)
  check('contatti: «Invia» nel colore del tema', !!(await until(async () => (await background('.lab-modulo button')) === 'rgb(3, 105, 161)', 5000)), await background('.lab-modulo button'))
  await theme('tramonto')
  check('tema Tramonto: «Invia» cambia colore', !!(await until(async () => (await background('.lab-modulo button')) === 'rgb(234, 88, 12)', 5000)), await background('.lab-modulo button'))

  // 6. Immagini: segnaposto locali (niente Internet), proporzione e ritaglio.
  await clickIn('.lab-modulo')
  await page.getByTestId('designer-palette-search').fill('galleria')
  await page.locator('[data-block="galleria"]').click()
  await page.getByTestId('designer-palette-search').fill('')
  const files = ['segnaposto-foto-1', 'segnaposto-foto-2', 'segnaposto-foto-3'].map((n) => join(root, 'img', `${n}.svg`))
  check('galleria: segnaposto creati in img/ del progetto', !!(await until(() => files.every((f) => existsSync(f)), 8000)), files.filter((f) => !existsSync(f)).join(', '))
  check('galleria: nessuna immagine da Internet', !/src="https?:/.test(html()))
  const loaded = await until(() => inFrame((d) => [...d.querySelectorAll('.lab-galleria img')].every((i) => i.complete && i.naturalWidth > 0)), 8000)
  check('galleria: le immagini si vedono nel canvas', !!loaded)
  await frame.locator('.lab-galleria img').first().scrollIntoViewIfNeeded()
  await wait(200)
  await clickIn('.lab-galleria img')
  await page.getByTestId('image-ratio-1:1').click()
  check('immagine: proporzione 1:1 con ritaglio «Riempi»', !!(await until(() => /#immagine-1 \{[^}]*aspect-ratio: 1 \/ 1;[^}]*height: auto;[^}]*object-fit: cover;/.test(css()), 8000)), css().slice(-200))
  const square = await until(() => inFrame((d) => { const r = d.querySelector('#immagine-1')?.getBoundingClientRect(); return r && Math.abs(r.width - r.height) <= 1 }), 5000)
  check('immagine: nel canvas è quadrata', !!square)
  await page.getByTestId('image-fit-contain').click()
  check('immagine: «Adatta» = object-fit: contain', !!(await until(() => /#immagine-1 \{[^}]*object-fit: contain;/.test(css()), 8000)))
  await run.shot('02-galleria')

  check('nessun errore JavaScript nella finestra', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
