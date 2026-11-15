// Collaudo della selezione multipla nel designer (1.6, richiesta del titolare: «se premo tasto sinistro e trascino
// dovrebbe creare il rettangolo di selezione multipla»). `npm run build` prima.
//  1. trascinato sullo sfondo, il rettangolo compare e prende gli elementi che ci stanno dentro
//  2. un colore dall'ispettore va a tutti gli scelti
//  3. Maiusc + clic aggiunge e toglie; Esc lascia solo il primo
//  4. elementi liberi scelti insieme si spostano insieme (frecce); Canc li toglie tutti
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRun, ensureBuilt, until, wait } from './helpers.mjs'

ensureBuilt()
const run = createRun('designer-multi')
const { check } = run

try {
  const page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })
  const root = await run.newProject('web-js', 'Multi')
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

  // 1. Rettangolo sullo sfondo attorno a titolo e paragrafo (dentro la scheda <main>).
  const h1 = await box('h1')
  const p = await box('main p')
  const main = await box('main')
  const start = { x: main.x - 30, y: h1.y - 4 }
  const end = { x: Math.max(h1.x + h1.width, p.x + p.width) + 4, y: p.y + p.height + 4 }
  // Lo sfondo a sinistra della scheda è il body.
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 10, start.y + 10, { steps: 3 })
  await page.mouse.move(end.x, end.y, { steps: 12 })
  check('trascinando sullo sfondo compare il rettangolo di selezione', await page.getByTestId('designer-marquee').isVisible())
  await page.mouse.up()
  check('il rettangolo sparisce al rilascio', (await page.getByTestId('designer-marquee').count()) === 0)
  const multi = page.getByTestId('designer-multi')
  check('titolo e paragrafo sono scelti insieme (contorno anche sul secondo)', !!(await until(async () => (await multi.count()) === 1, 3000)), String(await multi.count()))
  check('l’etichetta dice quanti sono', (await page.getByTestId('designer-selection').innerText()).includes('2 scelti'))
  check('l’ispettore avvisa che gli stili valgono per tutti', !!(await until(() => page.getByTestId('designer-multi-note').isVisible(), 3000)))
  await run.shot('01-rettangolo')

  // 2. Un colore a tutti: rosso dal campo del colore del testo.
  const colorField = page.locator('[data-testid="designer-inspector"] input[placeholder^="rgb"], [data-testid="designer-inspector"] [data-prop="color"] input[type="text"]').first()
  const hasField = (await colorField.count()) > 0
  if (hasField) {
    await colorField.fill('#ff0000')
    await colorField.press('Enter')
    const ids = () => [...html().matchAll(/<(h1|p)[^>]*id="([^"]+)"/g)].map((m) => m[2])
    const coloured = await until(() => {
      const list = ids()
      return list.length >= 2 && list.every((id) => new RegExp(`#${id}\\s*\\{[^}]*color:\\s*#ff0000`).test(css())) ? list : null
    }, 6000)
    check('un colore cambiato nell’ispettore va a tutti gli scelti', !!coloured, ids().join(','))
  } else check('campo del colore trovato nell’ispettore', false)

  // 3. Maiusc + clic toglie il paragrafo; Esc lascia solo il primo.
  await page.keyboard.down('Shift')
  await page.mouse.click(centre(await box('main p')).x, centre(await box('main p')).y)
  await page.keyboard.up('Shift')
  check('Maiusc + clic toglie un elemento dalla selezione', !!(await until(async () => (await multi.count()) === 0, 3000)))
  await page.keyboard.down('Shift')
  await page.mouse.click(centre(await box('main p')).x, centre(await box('main p')).y)
  await page.keyboard.up('Shift')
  check('Maiusc + clic lo aggiunge di nuovo', !!(await until(async () => (await multi.count()) === 1, 3000)))
  await page.getByTestId('designer-overlay').focus()
  await page.keyboard.press('Escape')
  check('Esc lascia solo il primo', !!(await until(async () => (await multi.count()) === 0, 3000)) && (await page.getByTestId('designer-selection').count()) === 1)

  // 4. Liberi insieme: Sposta liberamente su titolo e paragrafo, poi scelti col rettangolo, frecce, Canc.
  // Prima il paragrafo: il titolo, diventato libero, gli starebbe sopra.
  for (const selector of ['main p', 'h1']) {
    const b = await box(selector)
    await page.mouse.click(centre(b).x, centre(b).y, { button: 'right' })
    const item = page.getByTestId('designer-make-free')
    const offered = await until(async () => (await item.count()) === 1, 3000)
    if (offered) await item.click()
    else await page.keyboard.press('Escape')
    const done = await until(() => (selector === 'h1' ? /<h1[^>]*\blibero\b/ : /<p[^>]*\blibero\b/).test(html()), 5000)
    check(`«Mettilo dove vuoi» su ${selector}`, !!offered && !!done, offered ? (html().split('<main')[1] ?? '').slice(0, 300) : 'voce non offerta dal menu')
    await wait(600)
  }
  check('titolo e paragrafo resi liberi', /<h1[^>]*\blibero\b/.test(html()) && /<p[^>]*\blibero\b/.test(html()), (html().split('<body>')[1] ?? '').slice(0, 500))
  const h1b = await box('h1')
  await page.mouse.click(centre(h1b).x, centre(h1b).y)
  await page.keyboard.down('Shift')
  await page.mouse.click(centre(await box('main p')).x, centre(await box('main p')).y)
  await page.keyboard.up('Shift')
  await until(async () => (await multi.count()) === 1, 3000)
  const topOf = (tag) => {
    const id = (new RegExp(`<${tag}[^>]*id="([^"]+)"`).exec(html()) ?? [])[1]
    return Number((new RegExp(`#${id}\\s*\\{[^}]*top:\\s*(-?\\d+)px`).exec(css()) ?? [])[1] ?? NaN)
  }
  const tops = [topOf('h1'), topOf('p')]
  await page.getByTestId('designer-overlay').focus()
  await page.keyboard.press('Shift+ArrowDown')
  check('Maiusc+↓ abbassa di 10 px tutti gli elementi liberi scelti', !!(await until(() => topOf('h1') === tops[0] + 10 && topOf('p') === tops[1] + 10, 5000)), JSON.stringify({ tops, now: [topOf('h1'), topOf('p')] }))
  await page.keyboard.press('Delete')
  check('Canc toglie tutti gli scelti', !!(await until(() => !/<h1/.test(html()) && !/<p[\s>]/.test(html().split('<main')[1] ?? ''), 5000)))
  check('…e il resto della pagina resta', html().includes('<main') && html().includes('<button'))

  check('nessun errore nella console', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
