// Collaudo di righelli, guide, aggancio e misure della tela. `npm run build` prima.
//  1. righelli in alto e a sinistra con i numeri; la selezione si vede evidenziata nel righello
//  2. trascinando dal righello in alto nasce una guida orizzontale; un elemento libero ci si aggancia,
//     mentre lo sposto si vedono la guida d'aggancio e le misure in px
//  3. Alt sopra un altro elemento: le distanze fra i due
//  4. le guide non vanno nei file e si ricordano riaprendo; riportata sul righello la guida sparisce
//  5. il pulsante Righelli li spegne (e la scelta si ricorda)
import { createRun, ensureBuilt, until, wait } from './helpers.mjs'
import { canvasTools } from './canvas-helpers.mjs'

ensureBuilt()
const run = createRun('designer-rulers')
const { check } = run

const openDesigner = async (page) => {
  await page.getByTestId('open-designer').click()
  const frame = page.frameLocator('[data-testid="designer-frame"]')
  await until(async () => (await frame.locator('h1').count()) === 1, 15000)
  await wait(400)
}

try {
  let page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })
  const root = await run.newProject('web-js', 'Righelli')
  await openDesigner(page)
  let tools = canvasTools(page, root)

  // 1. Righelli.
  check('righello in alto e a sinistra', (await page.getByTestId('ruler-top').isVisible()) && (await page.getByTestId('ruler-left').isVisible()))
  const numbers = await page.getByTestId('ruler-top').locator('.ruler-num').allInnerTexts()
  check('il righello ha i numeri in px della pagina (c’è lo 0)', numbers.length >= 2 && numbers.includes('0'), numbers.join(' '))
  const h1 = await tools.box('h1')
  await page.mouse.click(tools.centre(h1).x, tools.centre(h1).y)
  const band = await until(async () => (await page.getByTestId('ruler-top').locator('.ruler-sel').boundingBox()), 4000)
  check('la selezione si vede evidenziata nel righello', !!band && Math.abs(band.x - h1.x) < 3 && Math.abs(band.width - h1.width) < 4, JSON.stringify({ band, h1 }))

  // 2. Guida dal righello e aggancio.
  const card = await tools.box('main')
  const guideY = Math.round(card.y + card.height + 60)
  const top = await page.getByTestId('ruler-top').boundingBox()
  await page.mouse.move(card.x + 40, top.y + top.height / 2)
  await page.mouse.down()
  await page.mouse.move(card.x + 60, guideY, { steps: 10 })
  await page.mouse.up()
  const guide = page.getByTestId('user-guide-y')
  check('trascinando dal righello nasce una guida', (await guide.count()) === 1)
  const gb = await guide.boundingBox()
  const guideLine = gb.y + gb.height / 2
  check('…dove l’ho lasciata', Math.abs(guideLine - guideY) < 2, JSON.stringify({ guideLine, guideY }))

  await page.getByTestId('tool-rect').click()
  const start = { x: card.x + 30, y: guideY + 50 }
  await tools.drag(start, { x: start.x + 120, y: start.y + 60 })
  const rectId = await until(() => tools.idsWithClass('lab-rettangolo')[0], 8000)
  await until(() => !isNaN(tools.px(tools.ruleOf(rectId), 'top')), 5000)
  await wait(300)
  // Lo porto con il bordo alto a 3 px dalla guida: deve agganciarsi.
  const rb = await tools.box(`#${rectId}`)
  const from = tools.centre(rb)
  const seen = {}
  await tools.drag(from, { x: from.x + 40, y: from.y - (rb.y - guideLine) + 3 }, {
    hold: async () => {
      seen.snap = await page.getByTestId('designer-snap-guide').count()
      seen.measures = await page.getByTestId('designer-measure').count()
    }
  })
  check('mentre sposto: guida d’aggancio e misure in px', seen.snap > 0 && seen.measures > 0, JSON.stringify(seen))
  await wait(500)
  const after = await tools.box(`#${rectId}`)
  check('il bordo alto si aggancia alla guida', Math.abs(after.y - guideLine) < 1.5, JSON.stringify({ top: after.y, guideLine }))

  // 3. Alt sopra un altro elemento.
  await page.mouse.click(tools.centre(after).x, tools.centre(after).y)
  await page.keyboard.down('Alt')
  const card2 = await tools.box('main')
  await page.mouse.move(tools.centre(card2).x, tools.centre(card2).y, { steps: 4 })
  await page.mouse.move(tools.centre(card2).x + 5, tools.centre(card2).y + 5, { steps: 2 })
  const altMeasures = await until(async () => (await page.getByTestId('designer-measure').count()) > 0, 3000)
  const altLabel = altMeasures ? await page.getByTestId('designer-measure').first().innerText() : ''
  await page.keyboard.up('Alt')
  check('Alt sopra un altro elemento: le distanze fra i due', !!altMeasures && /^\d+$/.test(altLabel.trim()), altLabel)

  // 4. Le guide non vanno nei file e si ricordano.
  check('la guida non va né nell’HTML né nel CSS', !/guid/i.test(tools.html()) && !/guid/i.test(tools.css()))
  await run.app.close()
  page = await run.launch()
  await openDesigner(page)
  tools = canvasTools(page, root)
  check('riaprendo, la guida c’è ancora', !!(await until(async () => (await page.getByTestId('user-guide-y').count()) === 1, 8000)))
  const g2 = await page.getByTestId('user-guide-y').boundingBox()
  const top2 = await page.getByTestId('ruler-top').boundingBox()
  await page.mouse.move(g2.x + 200, g2.y + g2.height / 2)
  await page.mouse.down()
  await page.mouse.move(g2.x + 200, top2.y + 5, { steps: 10 })
  await page.mouse.up()
  check('riportata sul righello, la guida sparisce', !!(await until(async () => (await page.getByTestId('user-guide-y').count()) === 0, 4000)))

  // Zoom a metà trascinamento: la guida finisce comunque sotto il puntatore (prima usava lo zoom di partenza).
  const top3 = await page.getByTestId('ruler-top').boundingBox()
  const hostBox = await page.getByTestId('designer-host').boundingBox()
  const midX = hostBox.x + hostBox.width / 2
  await page.mouse.move(midX, top3.y + 5)
  await page.mouse.down()
  await page.mouse.move(midX, hostBox.y + 200, { steps: 6 })
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -300)
  await page.keyboard.up('Control')
  await wait(300)
  const finalY = hostBox.y + 260
  await page.mouse.move(midX, finalY, { steps: 6 })
  await page.mouse.up()
  await wait(200)
  const zoomedGuide = await page.getByTestId('user-guide-y').last().boundingBox()
  check('zoom durante il trascinamento: la guida resta sotto il puntatore', !!zoomedGuide && Math.abs(zoomedGuide.y + zoomedGuide.height / 2 - finalY) < 2, JSON.stringify({ guide: zoomedGuide && zoomedGuide.y + zoomedGuide.height / 2, finalY }))
  await page.getByTestId('designer-overlay').focus()
  await page.keyboard.press('Control+0')
  await wait(300)

  // 5. Spegnere i righelli.
  await page.getByTestId('designer-rulers').click()
  check('il pulsante Righelli li spegne', (await page.getByTestId('ruler-top').count()) === 0 && (await page.getByTestId('designer-rulers').getAttribute('aria-pressed')) === 'false')
  await page.getByTestId('designer-rulers').click()
  check('…e li riaccende', (await page.getByTestId('ruler-top').count()) === 1)
  await run.shot('01-righelli')

  check('nessun errore nella console', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
