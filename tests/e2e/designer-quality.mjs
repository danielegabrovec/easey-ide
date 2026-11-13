// Collaudo della fetta «Ritocchi consigliati» (piano design, 13/11/2026): contrasto con correzione a
// un clic, griglia con una scheda orfana, spazi fuori scala, overflow sul telefono, immagini senza alt o
// da Internet, pulsanti piccoli. Ogni «Correggi» scrive CSS normale e si annulla con Ctrl+Z.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRun, ensureBuilt, until, wait } from './helpers.mjs'

ensureBuilt()
const run = createRun('designer-quality')
const { check } = run

try {
  const page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })
  const root = await run.newProject('web-js', 'Ritocchi')
  const htmlFile = join(root, 'index.html')
  const html = () => readFileSync(htmlFile, 'utf8')
  const css = () => readFileSync(join(root, 'style.css'), 'utf8')

  await page.getByTestId('open-designer').click()
  const frame = page.frameLocator('[data-testid="designer-frame"]')
  check('canvas pronto', !!(await until(async () => (await frame.locator('h1').count()) === 1, 15000)))
  await wait(400)
  const clickIn = async (selector) => {
    const box = await frame.locator(selector).first().boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  }
  const rules = () => page.locator('[data-testid="quality-list"] .quality-item').evaluateAll((items) => items.map((i) => i.getAttribute('data-rule')))
  const hasRule = (rule) => until(async () => (await rules()).includes(rule), 8000)
  const noRule = (rule) => until(async () => !(await rules()).includes(rule), 8000)

  // 1. La barra mostra i ritocchi; la scheda li elenca. Il pulsante del modello è basso (38 px).
  const qualityLabel = () => page.getByTestId('designer-quality').getAttribute('aria-label')
  check('barra: pulsante «Ritocchi» con il numero', !!(await until(async () => /\d+ ritocchi|1 ritocco/.test(await qualityLabel()), 8000)), await qualityLabel())
  await page.getByTestId('designer-quality').click()
  check('scheda Ritocchi aperta dalla barra', (await page.locator('[data-testid="insp-tab-quality"].active').count()) === 1)
  check('pulsante piccolo: segnalato', !!(await hasRule('pulsante-piccolo')), (await rules()).join(','))
  await page.getByTestId('quality-fix-pulsante-piccolo').click()
  check('pulsante piccolo: «Correggi» = min-height 44px', !!(await until(() => /#pulsante \{[^}]*min-height: 44px;/.test(css()), 8000)), css().slice(-200))
  check('pulsante piccolo: sparito dall’elenco', !!(await noRule('pulsante-piccolo')), (await rules()).join(','))

  // 2. Contrasto: titolo grigio chiaro → correzione a un clic.
  await page.getByTestId('insp-tab-style').click()
  await clickIn('#titolo')
  await page.getByTestId('style-color').fill('#e5e7eb')
  await until(() => /#titolo \{[^}]*color: #e5e7eb/.test(css()), 8000)
  await page.getByTestId('insp-tab-quality').click()
  check('contrasto: segnalato', !!(await hasRule('contrasto')), (await rules()).join(','))
  const message = await page.locator('[data-rule="contrasto"]').first().innerText()
  check('contrasto: il messaggio dice rapporto e soglia', /Contrasto 1,\d:1 fra testo e sfondo: serve almeno 3:1/.test(message), message)
  await page.getByTestId('quality-fix-contrasto').click()
  check('contrasto: corretto con un colore leggibile', !!(await until(() => !/#titolo \{[^}]*color: #e5e7eb/.test(css()), 8000)) && !!(await noRule('contrasto')))

  // 3. Spazio fuori scala (13 px) → 12 px.
  await page.getByTestId('insp-tab-style').click()
  await clickIn('#titolo')
  await page.getByTestId('style-padding-top').fill('13px')
  await page.getByTestId('style-padding-top').press('Enter')
  await until(() => /#titolo \{[^}]*padding: 13px 0 0;/.test(css()), 8000)
  await page.getByTestId('insp-tab-quality').click()
  check('spazio fuori scala: segnalato', !!(await hasRule('spazio-fuori-scala')))
  await page.locator('[data-rule="spazio-fuori-scala"] [data-testid="quality-fix-spazio-fuori-scala"]').first().click()
  check('spazio fuori scala: 13px → 12px', !!(await until(() => /#titolo \{[^}]*padding: 12px 0 0;/.test(css()), 8000)), css().slice(-250))

  // 4. Immagini da Internet e senza alt; titolo troppo largo per il telefono.
  writeFileSync(htmlFile, html().replace('<p>Premi il pulsante', '<img src="https://example.com/foto.png" width="120" height="80">\n      <div class="larga" style="width: 640px">Riga larga</div>\n      <p>Premi il pulsante'))
  check('immagine senza alt: segnalata', !!(await hasRule('immagine-senza-alt')), (await rules()).join(','))
  check('immagine da Internet: segnalata', !!(await hasRule('immagine-da-rete')))
  check('telefono: un elemento largo 640 px esce dallo schermo', !!(await hasRule('overflow-telefono')), (await rules()).join(','))

  // 5. Griglia di tre schede su due colonne: l’ultima resta sola → a tutta larghezza.
  await page.getByTestId('insp-tab-style').click()
  await clickIn('#pulsante')
  await page.getByTestId('designer-palette-search').fill('griglia di tre')
  await page.locator('[data-block="griglia"]').click()
  await page.getByTestId('designer-palette-search').fill('')
  await until(() => html().includes('lab-griglia'), 8000)
  // Si seleziona una scheda e con Esc si sale alla griglia che la contiene.
  await clickIn('.lab-griglia article')
  await page.getByTestId('designer-overlay').focus()
  await page.keyboard.press('Escape')
  await until(async () => (await page.getByTestId('insp-selector').innerText()).startsWith('#blocco'), 3000)
  await page.locator('[data-preset="layout-griglia-2"]').click()
  await until(() => /#blocco-\d+ \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/.test(css()), 8000)
  await page.getByTestId('insp-tab-quality').click()
  check('griglia orfana: segnalata', !!(await hasRule('griglia-orfana')), (await rules()).join(','))
  await run.shot('01-ritocchi')
  await page.getByTestId('quality-fix-griglia-orfana').click()
  check('griglia orfana: l’ultima scheda va a tutta larghezza', !!(await until(() => /grid-column: 1 \/ -1;/.test(css()), 8000)) && !!(await noRule('griglia-orfana')), css().slice(-200))

  // 6. «Correggi» si annulla con Ctrl+Z.
  await page.getByTestId('designer-overlay').focus()
  await page.keyboard.press('Control+z')
  check('Ctrl+Z annulla l’ultima correzione', !!(await until(() => !/grid-column: 1 \/ -1;/.test(css()), 8000)))
  await page.getByTestId('insp-tab-quality').click()
  check('Ctrl+Z: il ritocco torna nell’elenco', !!(await hasRule('griglia-orfana')))
  await run.shot('02-dopo')

  // L'immagine da Internet del collaudo non esiste (404): è voluto, non è un errore dell'app.
  check('nessun errore JavaScript nella finestra', run.issues.filter((i) => !/Failed to load resource/.test(i)).length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
