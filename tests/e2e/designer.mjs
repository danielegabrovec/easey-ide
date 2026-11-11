// Collaudo end-to-end di F3 (designer visuale) sull'app costruita.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRun, ensureBuilt, until, wait } from './helpers.mjs'

ensureBuilt()
const run = createRun('designer')
const { check } = run

try {
  const page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })
  const root = await run.newProject('web-js', 'Sito')
  const htmlFile = join(root, 'index.html')
  const cssFile = join(root, 'style.css')
  const originalHtml = readFileSync(htmlFile, 'utf8')
  const originalCss = readFileSync(cssFile, 'utf8')
  const html = () => readFileSync(htmlFile, 'utf8')
  const css = () => readFileSync(cssFile, 'utf8')

  await page.getByTestId('open-designer').click()
  const frame = page.frameLocator('[data-testid="designer-frame"]')
  check('canvas: la pagina è disegnata', !!(await until(async () => (await frame.locator('h1').innerText({ timeout: 500 })) === 'Ciao!', 15000)))
  check('canvas: gli script non vengono eseguiti in progettazione', (await frame.locator('script').count()) === 0)

  const clickIn = async (selector, options = {}) => {
    const box = await frame.locator(selector).first().boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, options)
    return box
  }

  // Selezione e stile
  await clickIn('#titolo')
  check('selezione: h1#titolo', (await page.getByTestId('designer-selection').innerText()).startsWith('h1#titolo'))
  await page.getByTestId('style-color').fill('#ff0000')
  await page.getByTestId('style-font-size').fill('48px')
  await page.getByTestId('style-font-size').press('Enter')
  const styled = await until(() => css().includes('#titolo {\n  color: #ff0000;\n  font-size: 48px;\n}'), 8000)
  check('stile: regola #titolo scritta nel CSS', !!styled, css().slice(-120))
  check('stile: il resto del CSS è intatto e l’HTML non cambia', css().startsWith(originalCss.trimEnd()) && html() === originalHtml)
  const color = await until(() => page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="designer-frame"]').contentDocument.querySelector('h1')).color === 'rgb(255, 0, 0)'), 5000)
  check('canvas: il colore nuovo è visibile', !!color)
  await run.shot('01-stile')

  // Tavola libera dalla palette (clic = dopo la selezione)
  await page.locator('[data-block="tavola"]').click()
  check('tavola libera inserita dopo il titolo', !!(await until(() => /<h1 id="titolo">Ciao!<\/h1>\n\s*<div id="blocco-1" class="tavola"><\/div>/.test(html()), 8000)), html().slice(0, 600))
  check('tavola: regole CSS aggiunte una volta', css().split('.tavola {').length === 2)

  // Trascino un titolo dalla palette dentro la tavola
  await until(async () => (await frame.locator('.tavola').count()) === 1, 5000)
  const tavola = await frame.locator('.tavola').boundingBox()
  await page.locator('[data-block="titolo"]').dragTo(page.getByTestId('designer-overlay'), {
    targetPosition: await (async () => {
      const overlay = await page.getByTestId('designer-overlay').boundingBox()
      return { x: tavola.x - overlay.x + 60, y: tavola.y - overlay.y + 50 }
    })()
  })
  const freeTitle = await until(() => /<div id="blocco-1" class="tavola">\n\s*<h1 id="titolo-1">Titolo<\/h1>\n\s*<\/div>/.test(html()) && /#titolo-1 \{[^}]*position: absolute;[^}]*left: \d+px;[^}]*top: \d+px;/.test(css()), 8000)
  check('palette: blocco trascinato nella tavola con posizione libera', !!freeTitle, css().slice(-200))
  await run.shot('02-tavola')

  // Spostamento libero con il mouse
  const leftBefore = Number(/#titolo-1 \{[^}]*left: (\d+)px/.exec(css())?.[1])
  const box = await clickIn('#titolo-1')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, { steps: 6 })
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 30, { steps: 6 })
  await page.mouse.up()
  const moved = await until(() => Number(/#titolo-1 \{[^}]*left: (\d+)px/.exec(css())?.[1]) > leftBefore + 20, 8000)
  check('libero: trascinamento aggiorna left/top nel CSS', !!moved, `${leftBefore} → ${/#titolo-1 \{[^}]*left: (\d+)px/.exec(css())?.[1]}`)
  await run.shot('03-spostato')

  // Modifica del testo in linea + annulla
  await clickIn('p', { clickCount: 2 })
  await page.getByTestId('designer-text-editor').waitFor({ timeout: 5000 })
  await page.keyboard.press('Control+A')
  await page.keyboard.type('Testo scritto nel designer')
  await page.keyboard.press('Enter')
  check('testo in linea: scritto nell’HTML', !!(await until(() => html().includes('<p>Testo scritto nel designer</p>'), 8000)))
  await page.getByTestId('designer-overlay').focus()
  await page.keyboard.press('Control+Z')
  check('annulla: torna il testo originale', !!(await until(() => html().includes('<p>Premi il pulsante e guarda la console in basso.</p>'), 8000)))

  // Punto di interruzione telefono
  await clickIn('#titolo')
  await page.getByTestId('bp-phone').click()
  await page.getByTestId('style-font-size').fill('28px')
  await page.getByTestId('style-font-size').press('Enter')
  check('telefono: regola dentro @media (max-width: 600px)', !!(await until(() => /@media \(max-width: 600px\) \{\s*#titolo \{\s*font-size: 28px;/.test(css()), 8000)))
  await run.shot('04-telefono')
  await page.getByTestId('bp-desktop').click()

  // Riordino a flusso: il pulsante sopra il titolo
  await clickIn('#pulsante')
  const button = await frame.locator('#pulsante').boundingBox()
  const title = await frame.locator('#titolo').boundingBox()
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2)
  await page.mouse.down()
  await page.mouse.move(button.x + button.width / 2, title.y + 6, { steps: 8 })
  await page.mouse.move(title.x + title.width / 2, title.y + 3, { steps: 4 })
  await page.mouse.up()
  const reordered = await until(() => html().indexOf('<button id="pulsante"') < html().indexOf('<h1 id="titolo">'), 8000)
  check('flusso: pulsante spostato prima del titolo', !!reordered)
  check('il resto dell’HTML resta intatto (script e commenti)', html().includes('<script src="script.js"></script>') && html().includes('<link rel="stylesheet" href="style.css" />'))

  // Dal codice al designer: modifica esterna del CSS
  writeFileSync(cssFile, css().replace('color: #ff0000;', 'color: #00aa00;'))
  const synced = await until(() => page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="designer-frame"]').contentDocument.querySelector('h1')).color === 'rgb(0, 170, 0)'), 8000)
  check('codice → designer: il canvas segue le modifiche al CSS', !!synced)
  await wait(300)
  await run.shot('05-finale')

  // Modello "Sito con il designer": pagina a sezioni con una tavola libera.
  await run.newProject('web-designer', 'Sito pronto')
  await page.getByTestId('open-designer').click()
  const ready = await until(async () => (await frame.locator('.lab-hero h1').count()) === 1 && (await frame.locator('.tavola').count()) === 1, 15000)
  check('modello "Sito con il designer": sezioni e tavola libera', !!ready)
  await run.shot('06-modello')

  check('nessun errore JavaScript nella finestra', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
