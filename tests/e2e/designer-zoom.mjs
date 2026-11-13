// Collaudo dello zoom del canvas del designer (P2-2): con Esplora e chat aperte la pagina scendeva a
// scala ~0,3 senza modo di ingrandirla. Ctrl+rotellina, Ctrl+0 / Ctrl+1 / Ctrl+= / Ctrl+-, percentuale
// nella barra, spazio + trascinamento per spostare la vista, maniglie e spostamenti esatti a ogni zoom.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRun, ensureBuilt, until, wait } from './helpers.mjs'

ensureBuilt()
const run = createRun('designer-zoom')
const { check } = run

try {
  const page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })
  const root = await run.newProject('web-js', 'Zoom')
  const css = () => readFileSync(join(root, 'style.css'), 'utf8')

  await page.getByTestId('open-designer').click()
  const frame = page.frameLocator('[data-testid="designer-frame"]')
  check('canvas pronto', !!(await until(async () => (await frame.locator('h1').count()) === 1, 15000)))
  await wait(400)

  const scale = () => page.evaluate(() => Number(document.querySelector('.designer-stage').dataset.scale))
  const zoomLabel = () => page.getByTestId('designer-zoom').evaluate((s) => s.options[s.selectedIndex].text)
  const box = (selector) =>
    page.evaluate((selector) => {
      const stage = document.querySelector('.designer-stage')
      const k = stage.getBoundingClientRect().width / stage.offsetWidth
      const frameEl = document.querySelector('[data-testid="designer-frame"]')
      const f = frameEl.getBoundingClientRect()
      const node = frameEl.contentDocument.querySelector(selector)
      if (!node) return null
      const r = node.getBoundingClientRect()
      return { x: f.x + r.left * k, y: f.y + r.top * k, width: r.width * k, height: r.height * k, scale: k }
    }, selector)

  // 1. «Adatta» con una percentuale visibile.
  const fit = await scale()
  const label = await zoomLabel()
  check('zoom: all’avvio «Adatta» con la percentuale', /^Adatta · \d+ %$/.test(label) && label.includes(`${Math.round(fit * 100)} %`), `${label} (scala ${fit})`)

  // 2. Ctrl+1 = 100 %, Ctrl+0 = adatta (il fuoco è nel canvas: il designer è il pannello attivo).
  await page.getByTestId('designer-overlay').focus()
  await page.keyboard.press('Control+1')
  check('Ctrl+1: 100 %', !!(await until(async () => (await scale()) === 1, 3000)), String(await scale()))
  check('Ctrl+1: la barra mostra 100 %', (await zoomLabel()) === '100 %', await zoomLabel())
  await page.keyboard.press('Control+0')
  check('Ctrl+0: torna ad «Adatta»', !!(await until(async () => (await scale()) === fit, 3000)), String(await scale()))

  // 3. Ctrl+= / Ctrl+- a gradini (e non cambiano la dimensione del testo dell'IDE).
  const settingsFile = join(run.work, 'userData', 'settings.json')
  const fontSize = () => (existsSync(settingsFile) ? JSON.parse(readFileSync(settingsFile, 'utf8')).fontSize ?? null : null)
  const fontBefore = fontSize()
  await page.keyboard.press('Control+=')
  const stepped = await until(async () => ((await scale()) > fit ? await scale() : null), 3000)
  check('Ctrl+=: un gradino in più', !!stepped, String(stepped))
  await page.keyboard.press('Control+-')
  check('Ctrl+-: un gradino in meno', !!(await until(async () => (await scale()) < stepped, 3000)))
  await wait(300)
  const fontAfter = fontSize()
  check('Ctrl+= nel designer non ingrandisce il testo dell’IDE', fontBefore === fontAfter, `${fontBefore} → ${fontAfter}`)

  // 4. Ctrl+rotellina sul titolo: ingrandisce e il titolo resta sotto il puntatore.
  await page.keyboard.press('Control+0')
  await until(async () => (await scale()) === fit, 3000)
  // Pagina lunga (solo nel canvas): così la vista può scorrere in verticale anche ingrandita.
  await page.evaluate(() => {
    const d = document.querySelector('[data-testid="designer-frame"]').contentDocument
    d.body.style.minHeight = '3000px'
  })
  await wait(100)
  const h1 = await box('h1')
  const point = { x: h1.x + h1.width / 2, y: h1.y + h1.height / 2 }
  await page.mouse.move(point.x, point.y)
  await page.keyboard.down('Control')
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, -120)
    await wait(60)
  }
  await page.keyboard.up('Control')
  await wait(200)
  const zoomed = await scale()
  const h1After = await box('h1')
  const under = point.x >= h1After.x && point.x <= h1After.x + h1After.width && point.y >= h1After.y && point.y <= h1After.y + h1After.height
  check('Ctrl+rotellina: ingrandisce', zoomed > fit * 1.5, `${fit} → ${zoomed}`)
  check('Ctrl+rotellina: il titolo resta sotto il puntatore', under, JSON.stringify({ point, h1After }))
  check('Ctrl+rotellina: la barra mostra la percentuale nuova', (await zoomLabel()) === `${Math.round(zoomed * 100)} %`, await zoomLabel())
  await run.shot('01-rotellina')

  // 5. Spazio + trascinamento sposta la vista (in orizzontale la pagina, in verticale lo scorrimento).
  await page.getByTestId('designer-zoom').selectOption('2')
  await until(async () => (await scale()) === 2, 3000)
  const host = await page.getByTestId('designer-host').boundingBox()
  const stageLeft = () => page.evaluate(() => document.querySelector('.designer-stage').getBoundingClientRect().left)
  const scrollTop = () => page.evaluate(() => document.querySelector('[data-testid="designer-frame"]').contentDocument.scrollingElement.scrollTop)
  const leftBefore = await stageLeft()
  const topBefore = await scrollTop()
  const start = { x: host.x + host.width / 2, y: host.y + host.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.keyboard.down('Space')
  await wait(50)
  const grab = await page.getByTestId('designer-host').evaluate((h) => h.classList.contains('panning'))
  await page.mouse.down()
  await page.mouse.move(start.x - 150, start.y - 80, { steps: 8 })
  await page.mouse.up()
  await page.keyboard.up('Space')
  const leftAfter = await stageLeft()
  const topAfter = await scrollTop()
  check('spazio: compare la mano', grab)
  check('spazio + trascina: la pagina si sposta di lato', Math.abs(leftAfter - (leftBefore - 150)) <= 2, `${leftBefore} → ${leftAfter}`)
  check('spazio + trascina: la pagina scorre in verticale (px dello schermo / scala)', Math.abs(topAfter - (topBefore + 40)) <= 2, `${topBefore} → ${topAfter}`)
  check('spazio + trascina: nessuna selezione cambiata né elemento spostato', !/#titolo|#pulsante/.test(css()))
  await page.mouse.move(start.x, start.y)
  await page.mouse.wheel(0, -2000)
  await wait(150)

  // 6. Maniglie esatte a ogni zoom: 10 px sullo schermo e ridimensionamento in px della pagina.
  for (const zoom of ['0.5', '2']) {
    await page.getByTestId('designer-zoom').selectOption(zoom)
    await until(async () => (await scale()) === Number(zoom), 3000)
    await page.evaluate(() => document.querySelector('[data-testid="designer-frame"]').contentDocument.querySelector('#pulsante').scrollIntoView({ block: 'center', inline: 'center' }))
    // A 200 % la pagina è più larga del canvas: la vista si porta sul pulsante.
    const button = await box('#pulsante')
    const hostBox = await page.getByTestId('designer-host').boundingBox()
    if (button.x + button.width > hostBox.x + hostBox.width - 30 || button.x < hostBox.x) {
      const dx = button.x + button.width / 2 - (hostBox.x + hostBox.width / 2)
      await page.mouse.move(hostBox.x + hostBox.width / 2, hostBox.y + 40)
      await page.mouse.wheel(dx, 0)
      await wait(150)
    }
    const b = await box('#pulsante')
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
    await page.getByTestId('designer-selection').waitFor()
    const handle = await page.locator('.dz-handle.h-e').boundingBox()
    check(`zoom ${zoom}: maniglia di 10 px sullo schermo`, Math.abs(handle.width - 10) <= 1, String(handle.width))
    const widthBefore = b.width / b.scale
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(handle.x + handle.width / 2 + 30, handle.y + handle.height / 2, { steps: 6 })
    await page.mouse.move(handle.x + handle.width / 2 + 60, handle.y + handle.height / 2, { steps: 6 })
    await page.mouse.up()
    const expected = Math.round(widthBefore + 60 / Number(zoom))
    const written = await until(() => {
      const value = Number(/#pulsante \{[^}]*width: (\d+)px/.exec(css())?.[1])
      return Math.abs(value - expected) <= 2 ? value : null
    }, 6000)
    check(`zoom ${zoom}: la maniglia allarga di 60 px dello schermo = ${Math.round(60 / Number(zoom))} px della pagina`, !!written, `${expected} atteso | ${/#pulsante \{[^}]*\}/.exec(css())?.[0]}`)
    await page.keyboard.press('Control+z')
    await wait(300)
  }
  await run.shot('02-maniglie')

  // 7. Ritorno ad «Adatta» dal menu.
  await page.getByTestId('designer-zoom').selectOption('fit')
  check('menu: «Adatta» ripristina la scala iniziale', !!(await until(async () => (await scale()) === fit, 3000)))

  check('nessun errore JavaScript nella finestra', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
