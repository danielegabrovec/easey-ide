// Collaudo degli strumenti di disegno della tela (1.7). `npm run build` prima.
//  1. R + trascinamento = rettangolo libero della misura disegnata (classe libero, id, regola #id), poi si torna a V
//  2. tastiera: O + clic = ellisse alla misura base (100×100); T poi Esc torna a Seleziona
//  3. F disegna una tavola; un rettangolo disegnato dentro diventa suo figlio (niente classe libero)
//  4. Ctrl+Z toglie l'ultimo disegno; durante il disegno si vede l'anteprima con la misura
import { createRun, ensureBuilt, until, wait } from './helpers.mjs'
import { canvasTools } from './canvas-helpers.mjs'

ensureBuilt()
const run = createRun('designer-draw')
const { check } = run

try {
  const page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })
  const root = await run.newProject('web-js', 'Disegno')
  await page.getByTestId('open-designer').click()
  const frame = page.frameLocator('[data-testid="designer-frame"]')
  check('canvas pronto', !!(await until(async () => (await frame.locator('h1').count()) === 1, 15000)))
  await wait(400)
  const { html, box, centre, drag, ruleOf, px, idsWithClass } = canvasTools(page, root)
  const pressed = (tool) => page.getByTestId(`tool-${tool}`).getAttribute('aria-pressed')

  check('striscia degli strumenti a sinistra della tela', await page.getByTestId('draw-tools').isVisible())
  check('all’inizio è scelto Seleziona', (await pressed('select')) === 'true')

  // 1. Rettangolo trascinato nel bianco sotto la scheda.
  await page.getByTestId('tool-rect').click()
  check('R scelto', (await pressed('rect')) === 'true')
  const card = await box('main')
  const start = { x: card.x + 20, y: card.y + card.height + 40 }
  let preview = null
  await drag(start, { x: start.x + 150, y: start.y + 90 }, {
    hold: async () => {
      preview = await page.getByTestId('designer-draw-preview').evaluate((el) => ({ shown: getComputedStyle(el).display !== 'none', tool: el.dataset.tool }))
      preview.label = await page.getByTestId('designer-angle').innerText().catch(() => '')
    }
  })
  check('durante il disegno si vede l’anteprima con la misura', !!preview?.shown && preview.tool === 'rect' && /\d+ × \d+/.test(preview.label), JSON.stringify(preview))
  const rectId = await until(() => idsWithClass('lab-rettangolo')[0], 8000)
  check('nasce un rettangolo con un id', !!rectId, html().slice(html().indexOf('<body'), html().indexOf('<body') + 600))
  check('…libero nel body, prima dello script', /class="libero lab-rettangolo"/.test(html()) && html().indexOf('lab-rettangolo') < html().lastIndexOf('<script'))
  await until(() => /position:\s*absolute/.test(ruleOf(rectId)), 5000)
  const rule = ruleOf(rectId)
  const scale = (await box('h1')).scale
  check('regola #id con posizione, misura disegnata e margine zero', /position:\s*absolute/.test(rule) && /margin:\s*0/.test(rule) && Math.abs(px(rule, 'width') - 150 / scale) < 4 && Math.abs(px(rule, 'height') - 90 / scale) < 4, rule)
  const drawn = await box(`#${rectId}`)
  check('compare dove l’ho disegnato', Math.abs(drawn.x - start.x) < 4 && Math.abs(drawn.y - start.y) < 4, JSON.stringify({ drawn, start }))
  check('dopo il disegno si torna a Seleziona', (await pressed('select')) === 'true')

  // 2. Tastiera: O + clic = ellisse 100×100.
  await page.getByTestId('designer-overlay').focus()
  await page.keyboard.press('o')
  check('il tasto O sceglie l’ellisse', (await pressed('ellipse')) === 'true')
  // A «adatta» la pagina è stretta: l'ellisse va sotto il rettangolo (dentro la pagina).
  const clickAt = { x: drawn.x + 10, y: drawn.y + drawn.height + 20 }
  await page.mouse.click(clickAt.x, clickAt.y)
  const ellipseId = await until(() => idsWithClass('lab-ellisse')[0], 8000)
  await until(() => !isNaN(px(ruleOf(ellipseId), 'width')), 5000)
  check('un clic = ellisse alla misura base 100×100', px(ruleOf(ellipseId), 'width') === 100 && px(ruleOf(ellipseId), 'height') === 100, ruleOf(ellipseId))
  await page.getByTestId('designer-overlay').focus()
  await page.keyboard.press('t')
  check('T sceglie il testo', (await pressed('text')) === 'true')
  await page.keyboard.press('Escape')
  check('Esc torna a Seleziona', (await pressed('select')) === 'true')

  // 3. Tavola e rettangolo disegnato dentro.
  await page.getByTestId('tool-frame').click()
  const eb = await box(`#${ellipseId}`)
  const frameStart = { x: card.x + 20, y: eb.y + eb.height + 30 }
  await drag(frameStart, { x: frameStart.x + 260, y: frameStart.y + 160 })
  const frameId = await until(() => idsWithClass('tavola')[0], 8000)
  check('F disegna una tavola (libera)', !!frameId && new RegExp(`id="${frameId}" class="libero tavola"`).test(html()), html().slice(html().indexOf('tavola') - 60, html().indexOf('tavola') + 60))
  await wait(300)
  const fb = await box(`#${frameId}`)
  await page.getByTestId('tool-rect').click()
  await drag({ x: fb.x + 20, y: fb.y + 20 }, { x: fb.x + 90, y: fb.y + 70 })
  const inner = await until(() => idsWithClass('lab-rettangolo').find((id) => id !== rectId), 8000)
  const frameHtml = html().slice(html().indexOf(`id="${frameId}"`), html().indexOf('</div>', html().indexOf(`id="${frameId}"`)) + 6)
  check('il rettangolo disegnato nella tavola è suo figlio, senza classe libero', !!inner && frameHtml.includes(`id="${inner}" class="lab-rettangolo"`), frameHtml)

  // 4. Ctrl+Z toglie l'ultimo disegno.
  await page.getByTestId('designer-overlay').focus()
  await page.keyboard.press('Control+z')
  check('Ctrl+Z toglie il rettangolo appena disegnato', !!(await until(() => !html().includes(`id="${inner}"`), 5000)))
  check('…e il resto resta', html().includes(`id="${frameId}"`) && html().includes(`id="${rectId}"`))
  await run.shot('01-disegno')

  check('nessun errore nella console', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
