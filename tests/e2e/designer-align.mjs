// Collaudo di Allinea, livelli, rotazione, occhio/lucchetto e «Da libero a layout» (1.7). `npm run build` prima.
//  1. tre rettangoli disegnati, scelti con Ctrl+clic: compare la barra Allinea; «in alto» e «distribuisci» scrivono il CSS
//  2. livelli: «in primo piano» scrive z-index; maniglia di rotazione con Maiusc = scatti di 15°
//  3. titolo e paragrafo in fila: «Mettili liberi e allinea» li rende liberi senza salti e li allinea a sinistra
//  4. occhio e lucchetto nei Livelli: solo nel designer (il file non cambia)
//  5. «Da libero a layout» su una tavola: flex nel CSS, un passo solo; Ctrl+Z torna com'era
import { createRun, ensureBuilt, until, wait } from './helpers.mjs'
import { canvasTools } from './canvas-helpers.mjs'

ensureBuilt()
const run = createRun('designer-align')
const { check } = run

try {
  const page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })
  const root = await run.newProject('web-js', 'Allinea')
  await page.getByTestId('open-designer').click()
  const frame = page.frameLocator('[data-testid="designer-frame"]')
  check('canvas pronto', !!(await until(async () => (await frame.locator('h1').count()) === 1, 15000)))
  await wait(400)
  const { html, css, box, centre, drag, ruleOf, px, idsWithClass } = canvasTools(page, root)
  // page.mouse.click non conosce i tasti modificatori: si tiene premuto Ctrl a mano.
  const ctrlClick = async (point) => {
    await page.keyboard.down('Control')
    await page.mouse.click(point.x, point.y)
    await page.keyboard.up('Control')
  }

  // 1. Tre rettangoli a altezze diverse sotto la scheda.
  // A «adatta» la pagina è stretta: posizioni in frazioni della pagina, tutte dentro.
  const card = await box('main')
  const stage = await page.locator('.designer-stage').boundingBox()
  const base = { x: stage.x + stage.width * 0.08, y: card.y + card.height + 30 }
  const spots = [
    { x: base.x, y: base.y },
    { x: stage.x + stage.width * 0.36, y: base.y + 20 },
    { x: stage.x + stage.width * 0.68, y: base.y + 8 }
  ]
  for (const [i, spot] of spots.entries()) {
    await page.getByTestId('tool-rect').click()
    await drag(spot, { x: spot.x + stage.width * 0.18 + i * 4, y: spot.y + 30 })
    await until(() => idsWithClass('lab-rettangolo').length === i + 1, 8000)
    await wait(250)
  }
  const ids = idsWithClass('lab-rettangolo')
  check('tre rettangoli disegnati', ids.length === 3, ids.map((id) => `${id}: ${ruleOf(id).replace(/\s+/g, ' ')}`).join(' | '))
  await until(() => ids.every((id) => !isNaN(px(ruleOf(id), 'top'))), 5000)
  await page.mouse.click(centre(await box(`#${ids[0]}`)).x, centre(await box(`#${ids[0]}`)).y)
  for (const id of ids.slice(1)) await ctrlClick(centre(await box(`#${id}`)))
  check('con tre scelti compare la barra Allinea', !!(await until(() => page.getByTestId('arrange-bar').isVisible(), 5000)))
  await page.getByTestId('arrange-top').click()
  const sameTop = await until(() => new Set(ids.map((id) => px(ruleOf(id), 'top'))).size === 1, 5000)
  check('«Allinea in alto»: stesso top per tutti', !!sameTop, ids.map((id) => px(ruleOf(id), 'top')).join(','))
  await wait(300)
  await page.getByTestId('arrange-distribute-h').click()
  const gaps = () => {
    const rows = ids.map((id) => ({ left: px(ruleOf(id), 'left'), width: px(ruleOf(id), 'width') })).sort((a, b) => a.left - b.left)
    return [rows[1].left - (rows[0].left + rows[0].width), rows[2].left - (rows[1].left + rows[1].width)]
  }
  check('«Distribuisci in orizzontale»: spazi uguali', !!(await until(() => Math.abs(gaps()[0] - gaps()[1]) <= 1, 5000)), gaps().join(','))
  await wait(300)
  await page.getByTestId('arrange-same-width').click()
  check('«Stessa larghezza»: come il primo', !!(await until(() => new Set(ids.map((id) => px(ruleOf(id), 'width'))).size === 1, 5000)), ids.map((id) => px(ruleOf(id), 'width')).join(','))

  // 2. Livelli e rotazione.
  await wait(300)
  await page.mouse.click(centre(await box(`#${ids[0]}`)).x, centre(await box(`#${ids[0]}`)).y)
  await page.mouse.click(centre(await box(`#${ids[0]}`)).x, centre(await box(`#${ids[0]}`)).y, { button: 'right' })
  await page.getByTestId('designer-restack-menu').hover()
  await page.getByTestId('designer-restack-front').click()
  check('«Porta in primo piano»: z-index più alto dei fratelli', !!(await until(() => px(ruleOf(ids[0]), 'z-index') || /z-index:\s*3/.test(ruleOf(ids[0])), 5000)), ruleOf(ids[0]))
  await wait(300)
  const handle = page.getByTestId('designer-rotate')
  const hb = await handle.boundingBox()
  const rb = await box(`#${ids[0]}`)
  const c = centre(rb)
  // Dalla maniglia (sopra il centro) verso destra: circa 90°, con Maiusc a scatti di 15°.
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.keyboard.down('Shift')
  await page.mouse.move(c.x + 60, c.y - 8, { steps: 10 })
  await wait(100)
  const angle = await page.getByTestId('designer-angle').innerText().catch(() => '')
  await page.mouse.up()
  await page.keyboard.up('Shift')
  check('durante la rotazione si vede l’angolo', /°/.test(angle), angle)
  const rotated = await until(() => /transform:\s*rotate\((-?\d+)deg\)/.exec(ruleOf(ids[0])), 5000)
  check('rotazione scritta a scatti di 15°', !!rotated && Number(rotated[1]) % 15 === 0 && Number(rotated[1]) !== 0, ruleOf(ids[0]))

  // 3. Elementi in fila: «Mettili liberi e allinea».
  await wait(300)
  const h1 = await box('h1')
  const p = await box('main p')
  await page.mouse.click(centre(h1).x, centre(h1).y)
  await ctrlClick(centre(p))
  await page.getByTestId('arrange-left').click()
  await page.getByTestId('arrange-make-free').click()
  const freed = await until(() => /<h1[^>]*\blibero\b/.test(html()) && /<p[^>]*\blibero\b/.test(html()), 8000)
  check('«Mettili liberi e allinea»: titolo e paragrafo liberi', !!freed, html().slice(html().indexOf('<main'), html().indexOf('</main>')))
  const h1Id = (/<h1[^>]*id="([^"]+)"/.exec(html()) ?? [])[1]
  const pId = (/<p[^>]*id="([^"]+)"[^>]*libero|<p[^>]*libero[^>]*id="([^"]+)"/.exec(html()) ?? []).slice(1).find(Boolean)
  await until(() => !isNaN(px(ruleOf(h1Id), 'left')) && !isNaN(px(ruleOf(pId), 'left')), 5000)
  check('…allineati a sinistra (stesso left)', px(ruleOf(h1Id), 'left') === px(ruleOf(pId), 'left'), `${ruleOf(h1Id)} | ${ruleOf(pId)}`)
  await wait(400)
  const h1After = await box('h1')
  check('…senza salti (il titolo resta alla sua altezza)', Math.abs(h1After.y - h1.y) < 4, JSON.stringify({ before: h1.y, after: h1After.y }))

  // 4. Occhio e lucchetto nei Livelli.
  await page.getByTestId('designer-layers-tab').click()
  const before = html()
  const row = page.locator(`[data-layer="${ids[1]}"]`)
  await row.hover()
  await row.getByTestId('layer-eye').click()
  const hidden = await until(() => frame.locator(`#${ids[1]}`).evaluate((el) => getComputedStyle(el).visibility === 'hidden'), 5000)
  check('occhio: nascosto nel designer', !!hidden)
  await row.getByTestId('layer-lock').click()
  await row.getByTestId('layer-eye').click()
  await wait(300)
  const lb = await box(`#${ids[1]}`)
  await page.mouse.click(centre(lb).x, centre(lb).y)
  await wait(200)
  const label = await page.getByTestId('designer-selection').innerText().catch(() => '')
  check('lucchetto: un clic sopra non lo sceglie', !label.includes(ids[1]), label)
  check('occhio e lucchetto non cambiano il file', html() === before)
  await row.getByTestId('layer-lock').click()
  await page.locator('.designer-left .insp-tabs button').first().click()

  // 5. «Da libero a layout» su una tavola con due rettangoli affiancati.
  await page.getByTestId('tool-frame').click()
  const lowest = Math.max(...(await Promise.all(['h1', 'main p'].map(async (s) => (await box(s)).y + (await box(s)).height))), ...(await Promise.all(ids.map(async (id) => (await box(`#${id}`)).y + (await box(`#${id}`)).height))))
  const fStart = { x: stage.x + stage.width * 0.05, y: Math.max(lowest, card.y + card.height) + 40 }
  await drag(fStart, { x: fStart.x + stage.width * 0.85, y: fStart.y + 120 })
  const frameId = await until(() => idsWithClass('tavola')[0], 8000)
  await wait(300)
  const fb = await box(`#${frameId}`)
  for (const fx of [0.08, 0.55]) {
    await page.getByTestId('tool-rect').click()
    await drag({ x: fb.x + fb.width * fx, y: fb.y + 25 }, { x: fb.x + fb.width * (fx + 0.35), y: fb.y + 75 })
    await wait(300)
  }
  await until(() => idsWithClass('lab-rettangolo').length === 5, 8000)
  await wait(300)
  const fb2 = await box(`#${frameId}`)
  await page.mouse.click(fb2.x + fb2.width - 8, fb2.y + fb2.height - 8, { button: 'right' })
  await page.getByTestId('designer-free-to-layout').click()
  const flexed = await until(() => /display:\s*flex/.test(ruleOf(frameId)), 8000)
  check('«Da libero a layout»: la tavola diventa flex', !!flexed, ruleOf(frameId))
  check('…non è più una tavola e i figli perdono la posizione assoluta', !new RegExp(`id="${frameId}"[^>]*\\btavola\\b`).test(html()) && !idsWithClass('lab-rettangolo').slice(3).some((id) => /position:\s*absolute/.test(ruleOf(id))), css().slice(-600))
  await page.getByTestId('designer-overlay').focus()
  await page.keyboard.press('Control+z')
  check('Ctrl+Z: torna tavola libera in un passo solo', !!(await until(() => new RegExp(`id="${frameId}"[^>]*\\btavola\\b`).test(html()) && !/display:\s*flex/.test(ruleOf(frameId)), 8000)), ruleOf(frameId))
  await run.shot('01-allinea')

  check('nessun errore nella console', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
