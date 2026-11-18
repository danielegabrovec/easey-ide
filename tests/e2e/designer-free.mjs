// Collaudo di «Sposta liberamente» nel designer (1.6, richiesta del titolare: «se devo spostarlo in un punto
// particolare si deve poter fare»). `npm run build` prima.
//  1. il pulsante è acceso di partenza (0.1.1), il titolo trascinato resta esattamente dove lo si lascia (classe libero, left/top nel CSS)
//  2. il contenitore fa da riferimento e non si accorcia; il titolo si sposta di nuovo trascinandolo e con le frecce
//  3. tasto destro «Rimetti in fila» lo riporta nel flusso; «Mettilo dove vuoi» lo rende libero dov'è
//  4. spento il pulsante, trascinare rimette in fila come prima; la scelta si ricorda
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRun, ensureBuilt, until, wait } from './helpers.mjs'

ensureBuilt()
const run = createRun('designer-free')
const { check } = run

try {
  const page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })
  const root = await run.newProject('web-js', 'Libero')
  const html = () => readFileSync(join(root, 'index.html'), 'utf8')
  const css = () => readFileSync(join(root, 'style.css'), 'utf8')

  await page.getByTestId('open-designer').click()
  const frame = page.frameLocator('[data-testid="designer-frame"]')
  check('canvas pronto', !!(await until(async () => (await frame.locator('h1').count()) === 1, 15000)))
  await wait(400)

  const box = (selector) =>
    page.evaluate((selector) => {
      const stage = document.querySelector('.designer-stage')
      const scale = stage.getBoundingClientRect().width / stage.offsetWidth
      const frameEl = document.querySelector('[data-testid="designer-frame"]')
      const f = frameEl.getBoundingClientRect()
      const node = frameEl.contentDocument.querySelector(selector)
      if (!node) return null
      const r = node.getBoundingClientRect()
      return { x: f.x + r.left * scale, y: f.y + r.top * scale, width: r.width * scale, height: r.height * scale, scale }
    }, selector)
  const centre = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
  const dragBy = async (from, dx, dy) => {
    const start = centre(from)
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 8, start.y + 8, { steps: 3 })
    await page.mouse.move(start.x + dx, start.y + dy, { steps: 14 })
    await wait(150)
    await page.mouse.up()
  }
  const ruleOf = (id) => (new RegExp(`#${id}\\s*\\{([^}]*)\\}`).exec(css()) ?? [])[1] ?? ''
  const px = (rule, prop) => Number((new RegExp(`(?:^|[;\\s])${prop}:\\s*(-?\\d+)px`).exec(rule) ?? [])[1] ?? NaN)

  // 1. Acceso di partenza (0.1.1: come in Figma, ciò che trascini resta dove lo lasci) e trascinato.
  const toggle = page.getByTestId('designer-free-move')
  check('«Sposta liberamente» è acceso di partenza', (await toggle.getAttribute('aria-pressed')) === 'true')
  // Fuori dalla scheda, nel bianco sotto: il titolo deve restare lì (nel body, prima degli script).
  const before = await box('h1')
  const card = await box('main')
  const dx = 30
  const dy = card.y + card.height + 50 - (before.y + before.height / 2)
  await dragBy(before, dx, dy)
  const freed = await until(() => /<h1[^>]*class="[^"]*\blibero\b/.test(html()), 8000)
  check('il titolo diventa libero (classe «libero»)', !!freed, html().slice(html().indexOf('<h1') - 40, html().indexOf('<h1') + 120))
  const id = (/<h1[^>]*id="([^"]+)"/.exec(html()) ?? [])[1]
  check('…con un id per la sua regola', !!id)
  await until(() => /position:\s*absolute/.test(ruleOf(id)), 5000)
  const rule = ruleOf(id)
  check('…e nel CSS posizione assoluta con left e top', /position:\s*absolute/.test(rule) && !isNaN(px(rule, 'left')) && !isNaN(px(rule, 'top')), rule)
  const after = await box('h1')
  check('resta dove l’ho lasciato (lo spostamento del mouse, al pixel)', Math.abs(after.x - before.x - dx) < 6 && Math.abs(after.y - before.y - dy) < 6, JSON.stringify({ dx: after.x - before.x, dy: after.y - before.y, want: [dx, dy] }))
  const body = html().split('<body>')[1] ?? ''
  check('…nel body, prima dello script', body.indexOf('<h1') > body.indexOf('</main>') && body.indexOf('<h1') < body.indexOf('<script'), body.slice(0, 400))
  check('il contenitore fa da riferimento e non si accorcia (relative e altezza minima)', /position:\s*relative/.test(css()) && /min-height:/.test(css()), css().slice(-400))
  await run.shot('01-libero')

  // 2. Di nuovo trascinato (spostamento libero) e con le frecce.
  const leftBefore = px(ruleOf(id), 'left')
  await dragBy(await box('h1'), -60, 0)
  check('trascinato di nuovo, si sposta a sinistra', !!(await until(() => px(ruleOf(id), 'left') < leftBefore - 20, 5000)), ruleOf(id))
  const topBefore = px(ruleOf(id), 'top')
  await page.getByTestId('designer-overlay').focus()
  await page.keyboard.press('Shift+ArrowDown')
  check('Maiusc+↓ lo abbassa di 10 px', !!(await until(() => px(ruleOf(id), 'top') === topBefore + 10, 5000)), ruleOf(id))

  // 3. Rimetti in fila / Mettilo dove vuoi.
  await page.mouse.click(centre(await box('h1')).x, centre(await box('h1')).y, { button: 'right' })
  await page.getByTestId('designer-back-to-flow').click()
  check('«Rimetti in fila»: niente più classe libero né posizione assoluta', !!(await until(() => !/<h1[^>]*\blibero\b/.test(html()) && !/position:\s*absolute/.test(ruleOf(id)), 5000)), ruleOf(id))
  await wait(300)
  await page.mouse.click(centre(await box('h1')).x, centre(await box('h1')).y, { button: 'right' })
  await page.getByTestId('designer-make-free').click()
  check('«Mettilo dove vuoi»: libero dov’è, senza saltare', !!(await until(() => /<h1[^>]*\blibero\b/.test(html()) && /position:\s*absolute/.test(ruleOf(id)), 5000)), ruleOf(id))

  // 4. Spento: il trascinamento rimette in fila come prima (Rimetti in fila prima, poi un altro elemento).
  await toggle.click()
  check('spento il pulsante', (await toggle.getAttribute('aria-pressed')) === 'false')
  await run.app.close()
  const again = await run.launch()
  await again.getByTestId('open-designer').click().catch(() => undefined)
  const remembered = await until(async () => (await again.getByTestId('designer-free-move').getAttribute('aria-pressed').catch(() => null)) === 'false', 15000)
  check('la scelta si ricorda dopo il riavvio', !!remembered)

  check('nessun errore nella console', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
