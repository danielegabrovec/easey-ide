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
  // (resta vicino alla tavola: tirando il puntatore ben fuori l'elemento uscirebbe dalla tavola)
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 40, { steps: 6 })
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

  // Palette: ricerca e Invio = inserisce il primo risultato (dopo la selezione)
  await clickIn('#pulsante')
  await page.getByTestId('designer-palette-search').fill('domande')
  const onlyFaq = await until(async () => (await page.locator('[data-testid="designer-palette"] [data-block]').count()) === 1, 3000)
  check('palette: la ricerca «domande» trova solo le Domande frequenti', !!onlyFaq, String(await page.locator('[data-testid="designer-palette"] [data-block]').count()))
  await page.getByTestId('designer-palette-search').press('Enter')
  check('palette: Invio inserisce la sezione con le sue regole', !!(await until(() => html().includes('lab-faq') && css().includes('.lab-faq summary {'), 8000)))
  await page.getByTestId('designer-palette-search').fill('')

  // Stili pronti: «Titolo» sul titolo
  await clickIn('#titolo')
  await page.locator('[data-preset="text-titolo"]').click()
  check('stili pronti: «Titolo» scrive più proprietà insieme', !!(await until(() => /#titolo \{[^}]*font-weight: 700;[^}]*letter-spacing: -0\.01em;/.test(css()), 8000)), css().slice(-300))

  // Padding lato per lato
  await clickIn('#pulsante')
  await page.getByTestId('style-padding-top').fill('40px')
  await page.getByTestId('style-padding-top').press('Enter')
  check('padding: il solo lato alto diventa la scorciatoia «40px 0 0»', !!(await until(() => /#pulsante \{[^}]*padding: 40px 0 0;/.test(css()), 8000)), css().slice(-200))

  // Copia stile dal titolo e incolla sul pulsante
  await clickIn('#titolo')
  await page.getByTestId('style-copy').click()
  await clickIn('#pulsante')
  await page.getByTestId('style-paste').click()
  check('copia stile: il pulsante riceve lo stile del titolo', !!(await until(() => /#pulsante \{[^}]*letter-spacing: -0\.01em;/.test(css()), 8000)), css().slice(-300))

  // Tema pronto dalla scheda Sito
  await page.getByTestId('insp-tab-site').click()
  await page.locator('[data-theme-id="foresta"]').click()
  check('tema: variabili e pagina scritte nel CSS', !!(await until(() => css().includes('--colore-primario: #15803d;') && /body \{[^}]*background: var\(--colore-sfondo\)/.test(css()), 8000)), css().slice(0, 300))
  check('tema: il canvas usa i colori nuovi', !!(await until(() => page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="designer-frame"]').contentDocument.body).backgroundColor === 'rgb(251, 253, 248)'), 5000)))
  check('tema: la scheda Sito lo mostra come attivo', !!(await until(async () => (await page.locator('[data-theme-id="foresta"].active').count()) === 1, 3000)))
  await run.shot('07-tema')
  await page.getByTestId('insp-tab-style').click()

  // Pagina intera dalla palette: in fondo al body, prima degli script
  await page.getByTestId('designer-palette-search').fill('pagina contatti')
  await page.locator('[data-block="pagina-contatti"]').click()
  const pageAdded = await until(() => {
    const text = html()
    const start = text.indexOf('class="lab-pagina"')
    return start > 0 && text.indexOf('lab-faq', start) > start && text.indexOf('lab-piede', start) > start && start < text.indexOf('<script src="script.js">')
  }, 8000)
  check('pagina intera: intestazione, contatti, domande e piè di pagina in fondo al body', !!pageAdded)
  await page.getByTestId('designer-palette-search').fill('')

  // Livelli: trascino il titolo prima del pulsante
  await page.getByTestId('designer-layers-tab').click()
  await page.locator('[data-layer="titolo"]').dragTo(page.locator('[data-layer="pulsante"]'), { targetPosition: { x: 30, y: 2 } })
  check('livelli: il titolo trascinato torna prima del pulsante', !!(await until(() => html().indexOf('<h1 id="titolo">') < html().indexOf('<button id="pulsante"'), 8000)))
  await run.shot('08-livelli')
  await page.locator('.designer-left .insp-tabs button').first().click()

  // Modello "Sito con il designer": pagina a sezioni con una tavola libera.
  await run.newProject('web-designer', 'Sito pronto')
  await page.getByTestId('open-designer').click()
  const ready = await until(async () => (await frame.locator('.lab-hero h1').count()) === 1 && (await frame.locator('.tavola').count()) === 1, 15000)
  check('modello "Sito con il designer": sezioni e tavola libera', !!ready)
  await run.shot('06-modello')

  // Pagine del sito: nuova pagina con intestazione e piè di pagina comuni, poi si torna alla home.
  const siteRoot = join(run.projects, 'Sito pronto')
  await page.getByTestId('designer-new-page').click()
  await page.locator('.dialog input').fill('Chi sono')
  await page.keyboard.press('Enter')
  const newFile = join(siteRoot, 'chi-sono.html')
  const created = await until(() => {
    try {
      const text = readFileSync(newFile, 'utf8')
      return text.includes('<title>Chi sono</title>') && text.includes('lab-intestazione') && text.includes('lab-piede') && text.includes('<h1>Chi sono</h1>') && !text.includes('tavola')
    } catch {
      return false
    }
  }, 8000)
  check('pagine: nuova pagina con titolo, intestazione e piè di pagina del sito', !!created)
  check('pagine: il designer apre la pagina nuova', !!(await until(async () => (await page.getByTestId('designer-page').inputValue()) === 'chi-sono.html' && (await frame.locator('main h1').innerText({ timeout: 500 })) === 'Chi sono', 10000)))
  await wait(500)
  check('pagine: l’Invio che conferma non riapre il dialogo (fuoco restituito dopo l’evento)', (await page.locator('.dialog').count()) === 0)
  check('pagine: la pagina nuova usa lo stesso foglio di stile', (await frame.locator('header.lab-intestazione').count()) === 1)
  await run.shot('09-nuova-pagina')
  await page.getByTestId('designer-page').selectOption('index.html')
  check('pagine: dal selettore si torna alla home', !!(await until(async () => (await frame.locator('.lab-hero h1').count()) === 1, 10000)))
  const listed = await until(async () => {
    const options = (await page.locator('[data-testid="designer-page"] option').allInnerTexts()).join(',')
    return options === 'index.html,chi-sono.html' ? options : null
  }, 5000)
  check('pagine: il selettore elenca entrambe le pagine', !!listed, (await page.locator('[data-testid="designer-page"] option').allInnerTexts()).join(','))

  check('nessun errore JavaScript nella finestra', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
