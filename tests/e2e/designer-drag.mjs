// Collaudo del trascinamento nel designer (revisione del 13/11/2026: P0-1, P0-3, P0-4, P1-1, P1-2, P1-3, P1-8).
// Lo scenario dell'utente: il sottotitolo finisce fuori dalla scheda e lo si riporta dentro trascinandolo.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRun, ensureBuilt, until, wait } from './helpers.mjs'

ensureBuilt()
const run = createRun('designer-drag')
const { check } = run

try {
  const page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })
  const root = await run.newProject('web-js', 'Sito')
  const html = () => readFileSync(join(root, 'index.html'), 'utf8')
  const css = () => readFileSync(join(root, 'style.css'), 'utf8')
  const body = () => html().split('<body>')[1] ?? ''

  await page.getByTestId('open-designer').click()
  const frame = page.frameLocator('[data-testid="designer-frame"]')
  check('canvas pronto', !!(await until(async () => (await frame.locator('h1').count()) === 1, 15000)))
  await wait(400)

  // Rettangolo (coordinate della finestra) di un elemento nel canvas scalato.
  const box = (selector, index = 0) =>
    page.evaluate(
      ([selector, index]) => {
        const stage = document.querySelector('.designer-stage')
        const scale = stage.getBoundingClientRect().width / stage.offsetWidth
        const frameEl = document.querySelector('[data-testid="designer-frame"]')
        const f = frameEl.getBoundingClientRect()
        const node = frameEl.contentDocument.querySelectorAll(selector)[index]
        if (!node) return null
        const r = node.getBoundingClientRect()
        return { x: f.x + r.left * scale, y: f.y + r.top * scale, width: r.width * scale, height: r.height * scale, scale }
      },
      [selector, index]
    )
  const centre = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
  /** Afferra un elemento, lo porta sul punto indicato (a passi) e lo lascia; `before` gira prima del rilascio. */
  const dragTo = async (from, to, before) => {
    const start = centre(from)
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 8, start.y + 8, { steps: 3 })
    await page.mouse.move(to.x, to.y, { steps: 12 })
    await wait(120)
    const seen = before ? await before() : null
    await page.mouse.up()
    return seen
  }
  const parentTagOf = (selector) => page.evaluate((s) => document.querySelector('[data-testid="designer-frame"]').contentDocument.querySelector(s)?.parentElement?.tagName.toLowerCase() ?? null, selector)

  // 1. Clic su «Sottotitolo» senza selezione: entra nella scheda visibile, non in fondo al body.
  await page.getByTestId('designer-overlay').focus()
  await page.keyboard.press('Escape')
  await page.evaluate(() => document.querySelector('[data-testid="designer-frame"]').contentDocument.scrollingElement.scrollTo(0, 0))
  await page.locator('[data-block="sottotitolo"]').click()
  check('palette senza selezione: il sottotitolo entra nella scheda (<main>)', !!(await until(async () => html().includes('<h2') && (await parentTagOf('h2')) === 'main', 8000)), body())

  // 2. Lo porto fuori: rilascio sullo sfondo sotto la scheda → dopo <main> ma prima di <script>.
  await until(async () => (await frame.locator('h2').count()) === 1, 5000)
  let h2 = await box('h2')
  let main = await box('main')
  await dragTo(h2, { x: main.x + main.width / 2, y: main.y + main.height + 60 / main.scale })
  const outside = await until(async () => (await parentTagOf('h2')) === 'body' && html().indexOf('<h2') > html().indexOf('</main>'), 8000)
  check('sfondo sotto la scheda: il sottotitolo esce, dopo la scheda', !!outside, body())
  check('sfondo: mai dopo <script>', html().indexOf('<h2') < html().indexOf('<script src="script.js">'))
  await run.shot('01-fuori')

  // 3. Lo riporto dentro: rilascio nello spazio bianco in fondo alla scheda, sotto «Salutami».
  await wait(300)
  h2 = await box('h2')
  main = await box('main')
  const button = await box('main button')
  const bottomPadding = { x: main.x + 20 * main.scale, y: (button.y + button.height + main.y + main.height) / 2 }
  const seen = await dragTo(h2, bottomPadding, async () => ({
    label: await page.getByTestId('designer-drop-label').innerText().catch(() => ''),
    parent: await page.getByTestId('designer-drop-parent').count(),
    ghost: await page.evaluate(() => !!document.querySelector('[data-testid="designer-frame"]').contentDocument.querySelector('[data-lab-ghost]'))
  }))
  check('durante il trascinamento: etichetta «dentro main.scheda»', /dentro main\.scheda/.test(seen.label), seen.label)
  check('durante il trascinamento: contenitore evidenziato e fantasma dell’elemento', seen.parent === 1 && seen.ghost, JSON.stringify(seen))
  const backIn = await until(async () => (await parentTagOf('h2')) === 'main', 8000)
  check('padding in fondo alla scheda: il sottotitolo torna figlio della scheda', !!backIn, body())
  const atEnd = await until(() => html().indexOf('<h2') > html().indexOf('<button id="pulsante"') && html().indexOf('<h2') < html().indexOf('</main>'), 8000)
  check('...in fondo, dopo il pulsante (anche nel file salvato)', !!atEnd, body())
  check('dopo il rilascio il fantasma sparisce', !(await page.evaluate(() => !!document.querySelector('[data-testid="designer-frame"]').contentDocument.querySelector('[data-lab-ghost]'))))
  await run.shot('02-dentro')

  // 4. Esc durante il trascinamento annulla (non sposta il genitore, nessun errore).
  await wait(300)
  const beforeEsc = html()
  const pulsante = await box('#pulsante')
  const titolo = await box('#titolo')
  let start = centre(pulsante)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(titolo.x + titolo.width / 2, titolo.y + 3, { steps: 10 })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await wait(1200)
  check('Esc annulla il trascinamento: HTML invariato', html() === beforeEsc, body())
  check('Esc: nessun avviso d’errore', (await page.locator('.toast.error').count()) === 0)
  check('Esc: la selezione resta sul pulsante', (await page.getByTestId('designer-selection').innerText()).startsWith('button#pulsante'))

  // 5. Il <p> (senza id) sopra il titolo: si sposta lui e resta selezionato lui.
  const p = await box('main p')
  await dragTo(p, { x: titolo.x + titolo.width / 2, y: titolo.y + 3 })
  check('il <p> trascinato finisce sopra il titolo', !!(await until(() => html().indexOf('<p>') < html().indexOf('<h1 id="titolo">'), 8000)), body())
  check('dopo lo spostamento la selezione resta sul <p>', !!(await until(async () => (await page.getByTestId('designer-selection').innerText()).trim().startsWith('p'), 3000)), await page.getByTestId('designer-selection').innerText())

  // 6. Griglia: la terza scheda sulla metà SINISTRA della prima → prima della prima, con linea verticale.
  // La griglia va sullo sfondo sotto la scheda (dentro la scheda stretta sarebbe una colonna sola).
  await page.getByTestId('designer-palette-search').fill('griglia')
  main = await box('main')
  const overlayBox = await page.getByTestId('designer-overlay').boundingBox()
  await page.locator('[data-block="griglia"]').dragTo(page.getByTestId('designer-overlay'), {
    targetPosition: { x: main.x + main.width / 2 - overlayBox.x, y: main.y + main.height + 30 * main.scale - overlayBox.y }
  })
  await page.getByTestId('designer-palette-search').fill('')
  check('griglia lasciata sullo sfondo: dopo la scheda', !!(await until(() => html().indexOf('lab-griglia') > html().indexOf('</main>') && html().indexOf('lab-griglia') < html().indexOf('<script'), 8000)), body())
  await until(async () => (await frame.locator('.lab-griglia > article').count()) === 3, 8000)
  // Il body del modello è una griglia centrata che stringe tutto: nel canvas la griglia si allarga a tre colonne.
  await page.evaluate(() => {
    const grid = document.querySelector('[data-testid="designer-frame"]').contentDocument.querySelector('.lab-griglia')
    grid.style.width = '960px'
    grid.scrollIntoView({ block: 'center' })
  })
  await wait(400)
  const c1 = await box('.lab-griglia > article', 0)
  const c3 = await box('.lab-griglia > article', 2)
  const gridSeen = await dragTo({ x: c3.x, y: c3.y, width: 12, height: 12 }, { x: c1.x + c1.width * 0.2, y: c1.y + c1.height * 0.8 }, async () =>
    page.evaluate(() => {
      const line = document.querySelector('[data-testid="designer-drop-line"]')
      return line ? line.classList.contains('vertical') : null
    })
  )
  check('griglia: linea d’inserimento verticale', gridSeen === true, String(gridSeen))
  const order = await until(() => {
    const names = [...html().matchAll(/<h3>(\w+)<\/h3>/g)].map((m) => m[1]).join(',')
    return names === 'Terza,Prima,Seconda' ? names : null
  }, 8000)
  check('griglia: la terza scheda va prima della prima (decide la X)', !!order, [...html().matchAll(/<h3>(\w+)<\/h3>/g)].map((m) => m[1]).join(','))

  // 7. Tavola libera: dentro diventa libero, fuori torna nel flusso, ai bordi resta visibile.
  // La tavola va sullo sfondo, sotto la griglia.
  await wait(300)
  await page.evaluate(() => document.querySelector('[data-testid="designer-frame"]').contentDocument.querySelector('.lab-griglia').scrollIntoView({ block: 'center' }))
  await wait(200)
  const grid = await box('.lab-griglia')
  const overlayNow = await page.getByTestId('designer-overlay').boundingBox()
  await page.locator('[data-block="tavola"]').dragTo(page.getByTestId('designer-overlay'), {
    targetPosition: { x: grid.x + grid.width / 2 - overlayNow.x, y: grid.y + grid.height + 20 * grid.scale - overlayNow.y }
  })
  await until(async () => (await frame.locator('.tavola').count()) === 1, 8000)
  check('tavola lasciata sullo sfondo: figlia del body', (await parentTagOf('.tavola')) === 'body')
  await page.evaluate(() => {
    const tavola = document.querySelector('[data-testid="designer-frame"]').contentDocument.querySelector('.tavola')
    tavola.style.width = '960px'
    tavola.scrollIntoView({ block: 'center' })
  })
  await wait(400)
  let tavola = await box('.tavola')
  h2 = await box('main h2')
  // Il sottotitolo è in alto: la pagina si allunga (solo nel canvas) perché ci sia da scorrere.
  await page.evaluate(() => {
    const d = document.querySelector('[data-testid="designer-frame"]').contentDocument
    d.body.style.paddingBottom = '2500px'
    d.scrollingElement.scrollTo(0, 0)
  })
  await wait(200)
  h2 = await box('main h2')
  start = centre(h2)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 10, start.y + 10, { steps: 3 })
  // Trascino verso il basso: la pagina scorre da sola vicino al bordo del canvas.
  const host = await page.locator('.designer-host').boundingBox()
  const scrollBefore = await page.evaluate(() => document.querySelector('[data-testid="designer-frame"]').contentDocument.scrollingElement.scrollTop)
  await page.mouse.move(host.x + host.width / 2, host.y + host.height - 10, { steps: 8 })
  await wait(900)
  const scrollAfter = await page.evaluate(() => document.querySelector('[data-testid="designer-frame"]').contentDocument.scrollingElement.scrollTop)
  check('scorrimento automatico vicino al bordo basso del canvas', scrollAfter > scrollBefore + 50, `${scrollBefore} → ${scrollAfter}`)
  // Fuori dalla fascia del bordo, poi la tavola in vista (come farebbe la rotellina).
  await page.mouse.move(host.x + host.width / 2, host.y + host.height / 2, { steps: 4 })
  await page.evaluate(() => document.querySelector('[data-testid="designer-frame"]').contentDocument.querySelector('.tavola').scrollIntoView({ block: 'center' }))
  await wait(150)
  tavola = await box('.tavola')
  await page.mouse.move(tavola.x + 80 * tavola.scale, tavola.y + 60 * tavola.scale, { steps: 8 })
  await wait(150)
  const freeLabel = await page.getByTestId('designer-drop-label').innerText().catch(() => '')
  await page.mouse.up()
  check('tavola: etichetta «posizione libera» durante il trascinamento', /posizione libera/.test(freeLabel), freeLabel)
  const enteredFree = await until(async () => (await parentTagOf('h2')) === 'div' && /#titolo-1 \{[^}]*position: absolute;[^}]*left: \d+px;[^}]*top: \d+px;/.test(css()), 8000)
  check('tavola: un elemento del flusso portato dentro diventa libero', !!enteredFree, css().slice(-300))

  // Spinto oltre il bordo destro (puntatore ancora nella tavola) resta dentro e visibile.
  await wait(300)
  h2 = await box('.tavola h2')
  tavola = await box('.tavola')
  await dragTo(h2, { x: tavola.x + tavola.width - 4, y: h2.y + h2.height / 2 })
  const clamped = await until(() => {
    const left = Number(/#titolo-1 \{[^}]*left: (\d+)px/.exec(css())?.[1])
    const width = Number(/#titolo-1 \{[^}]*width: (\d+)px/.exec(css())?.[1] ?? 0)
    return left > 0 && left + width <= 962 ? left : null
  }, 8000)
  check('tavola: al bordo l’elemento resta dentro (niente parti tagliate)', !!clamped, css().slice(-200))

  // Tirato fuori sotto la tavola: torna nel flusso e perde la posizione assoluta.
  await wait(300)
  h2 = await box('.tavola h2')
  tavola = await box('.tavola')
  await dragTo(h2, { x: tavola.x + tavola.width / 2, y: tavola.y + tavola.height + 70 })
  const leftFree = await until(async () => (await parentTagOf('#titolo-1')) === 'body' && !/#titolo-1 \{[^}]*position: absolute/.test(css()), 8000)
  check('tavola: trascinato fuori torna nel flusso (senza position/left/top)', !!leftFree, `${await parentTagOf('#titolo-1')} | ${css().slice(-200)}`)
  await run.shot('03-tavola')

  check('nessun errore JavaScript nella finestra', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
