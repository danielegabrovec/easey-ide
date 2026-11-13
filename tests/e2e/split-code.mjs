// Collaudo della vista affiancata grafica ↔ codice (standard «Vista affiancata grafica ↔ codice»):
//  1. designer: «Affianca codice» → grafica a sinistra, codice a destra; l'Esplora resta
//  2. clic su un elemento → il suo codice selezionato e illuminato, senza rubare il fuoco
//  3. clic su una riga del codice → l'elemento selezionato nel designer
//  4. secondo clic → il codice si chiude; Ctrl+Alt+K fa lo stesso
//  5. nodi e blocchi: codice pulito (senza __labStep), nodo ↔ righe nei due sensi, pannello richiudibile
import { createRun, ensureBuilt, until, wait } from './helpers.mjs'

ensureBuilt()
const run = createRun('split-code')
const { check } = run

try {
  const page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })
  await run.newProject('web-js', 'Affiancata')
  await page.getByTestId('open-designer').click()
  const frame = page.frameLocator('[data-testid="designer-frame"]')
  await frame.locator('h1').waitFor({ timeout: 15000 })
  await wait(400)
  const editor = page.locator('[data-editor-path="index.html"]')

  // 1. Affianca codice
  await page.getByTestId('split-code').click()
  check('«Affianca codice»: il codice si apre', !!(await until(() => editor.isVisible(), 8000)))
  const sideBySide = await until(async () => {
    const designerBox = await page.getByTestId('designer').boundingBox()
    const editorBox = await editor.boundingBox()
    return designerBox && editorBox && editorBox.x >= designerBox.x + designerBox.width - 2 && editorBox.width > 200 ? { designerBox, editorBox } : null
  }, 5000)
  check('grafica a sinistra, codice a destra (due gruppi affiancati)', !!sideBySide, JSON.stringify(sideBySide))
  check('il designer resta visibile accanto al codice', await page.getByTestId('designer').isVisible())
  check('l’Esplora resta visibile', await page.locator('[data-path="index.html"]').isVisible())
  check('il pulsante dice che il codice è affiancato', (await page.getByTestId('split-code').getAttribute('aria-pressed')) === 'true')
  await run.shot('01-affiancata')

  // 2. Grafica → codice
  const clickIn = async (selector) => {
    const box = await page.evaluate((s) => {
      const stage = document.querySelector('.designer-stage')
      const scale = stage.getBoundingClientRect().width / stage.offsetWidth
      const f = document.querySelector('[data-testid="designer-frame"]').getBoundingClientRect()
      const r = document.querySelector('[data-testid="designer-frame"]').contentDocument.querySelector(s).getBoundingClientRect()
      return { x: f.x + (r.left + r.width / 2) * scale, y: f.y + (r.top + r.height / 2) * scale }
    }, selector)
    await page.mouse.click(box.x, box.y)
  }
  await clickIn('#titolo')
  const lit = await until(
    () =>
      page.evaluate(() => {
        const host = document.querySelector('[data-editor-path="index.html"]')
        const flash = host?.querySelector('.link-flash')
        const line = [...(host?.querySelectorAll('.view-line') ?? [])].find((l) => l.textContent.includes('id="titolo"'))
        if (!flash || !line) return null
        return Math.abs(flash.getBoundingClientRect().top - line.getBoundingClientRect().top) < 4
      }),
    5000
  )
  check('clic su un elemento: la sua riga nel codice si illumina', lit === true, String(lit))
  const selectedText = await page.evaluate(() => {
    const host = document.querySelector('[data-editor-path="index.html"]')
    const selection = host?.querySelector('.selected-text')
    const line = [...(host?.querySelectorAll('.view-line') ?? [])].find((l) => l.textContent.includes('id="titolo"'))
    return !!selection && !!line && Math.abs(selection.getBoundingClientRect().top - line.getBoundingClientRect().top) < 4
  })
  check('clic su un elemento: il suo codice è selezionato', selectedText)
  check('il fuoco resta al designer', (await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'designer-overlay')
  const flashGone = await until(async () => (await page.locator('[data-editor-path="index.html"] .link-flash').count()) === 0, 4000)
  check('l’evidenziazione sfuma e se ne va', !!flashGone)

  // 3. Codice → grafica
  await editor.locator('.view-line', { hasText: 'id="pulsante"' }).click()
  check('clic su una riga del codice: l’elemento è selezionato nel designer', !!(await until(async () => (await page.getByTestId('designer-selection').innerText()).startsWith('button#pulsante'), 5000)))

  // 4. Secondo clic e Ctrl+Alt+K
  await page.getByTestId('split-code').click()
  check('secondo clic: il codice affiancato si chiude', !!(await until(async () => (await editor.count()) === 0, 5000)))
  check('...e l’Esplora c’è ancora', await page.locator('[data-path="index.html"]').isVisible())
  await page.getByTestId('designer-overlay').focus()
  await page.keyboard.press('Control+Alt+K')
  check('Ctrl+Alt+K riapre il codice accanto', !!(await until(() => editor.isVisible(), 5000)))
  await page.keyboard.press('Control+Alt+K')
  check('Ctrl+Alt+K lo richiude', !!(await until(async () => (await editor.count()) === 0, 5000)))

  // 5. Nodi
  await run.palette('Nuovo programma a nodi')
  await page.locator('.dialog input').press('Enter')
  const nodes = page.getByTestId('nodes-editor')
  await nodes.waitFor({ timeout: 15000 })
  const generated = nodes.getByTestId('visual-generated')
  await until(async () => ((await generated.getAttribute('data-code')) ?? '').includes('textContent'), 8000)
  check('nodi: il codice mostrato è pulito (senza __labStep)', !((await generated.getAttribute('data-code')) ?? '').includes('__labStep'))
  await page.locator('.react-flow__node[data-id="scrivi"]').click()
  const nodeLit = await until(async () => {
    const range = await generated.getAttribute('data-highlight')
    if (!range) return null
    const line = Number(range.split('-')[0])
    return ((await generated.getAttribute('data-code')) ?? '').split('\n')[line - 1]?.includes('textContent') ? range : null
  }, 5000)
  check('nodi: clic su un nodo → le sue righe illuminate nel codice', !!nodeLit, String(await generated.getAttribute('data-highlight')))
  await page.locator('.react-flow__pane').click({ position: { x: 10, y: 10 } })
  await wait(200)
  await generated.locator('.view-line', { hasText: 'textContent' }).click()
  check('nodi: clic su una riga del codice → il suo nodo selezionato', !!(await until(async () => (await page.locator('.react-flow__node.selected[data-id="scrivi"]').count()) === 1, 5000)))
  await nodes.getByTestId('split-code').click()
  check('nodi: «Affianca codice» nasconde il codice generato', !!(await until(async () => (await nodes.getByTestId('visual-generated').count()) === 0, 3000)))
  await nodes.getByTestId('split-code').click()
  check('nodi: e lo rimostra', !!(await until(async () => (await nodes.getByTestId('visual-generated').count()) === 1, 3000)))
  await run.shot('02-nodi')

  check('nessun errore JavaScript nella finestra', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
