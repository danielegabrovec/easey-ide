// Collaudo della disposizione e dell'Esplora (revisione del 13/11/2026: P0-2, P1-4, P1-5).
//  1. il designer non nasconde più l'albero dei file; anteprima e console si nascondono e tornano
//  2. Ctrl+B e il pulsante nella barra mostrano/nascondono l'Esplora; Ctrl+J i pannelli
//  3. finestra stretta (1100 e 1024 px): niente barra o pannelli oltre il bordo
//  4. Esplora: trascinamento di file e cartelle, tastiera (frecce, Invio, F2, Canc)
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRun, ensureBuilt, until, wait } from './helpers.mjs'

ensureBuilt()
const run = createRun('layout')
const { check } = run

const visible = (page, selector) => page.locator(selector).first().isVisible().catch(() => false)

try {
  const page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })
  const root = await run.newProject('web-js', 'Disposizione')
  await page.locator('[data-path="index.html"]').waitFor({ timeout: 10000 })

  // 1. Designer: l'albero resta, anteprima e console si fanno da parte.
  await page.getByTestId('open-designer').click()
  await page.frameLocator('[data-testid="designer-frame"]').locator('h1').waitFor({ timeout: 15000 })
  await wait(400)
  check('designer: l’albero dei file resta visibile', await visible(page, '[data-path="index.html"]'))
  check('designer: nessun gruppo ingrandito', (await page.evaluate(() => document.querySelectorAll('.dv-groupview.dv-maximized, .dv-maximized').length)) === 0)
  check('designer: anteprima e console nascoste per fare spazio', !(await visible(page, '[data-testid="console-list"]')))
  check('designer: il pulsante dei pannelli dice che sono nascosti', (await page.getByTestId('toggle-panels').getAttribute('aria-pressed')) === 'false')
  await run.shot('01-designer')

  // Tornando a un file i pannelli riappaiono da soli; tornando al designer si rifanno da parte.
  await page.locator('[data-path="style.css"]').click()
  check('aprendo un file dall’albero: anteprima e console tornano', !!(await until(() => visible(page, '[data-testid="console-list"]'), 3000)))
  await page.locator('.dv-tab', { hasText: 'Designer' }).click()
  check('tornando al designer: si rifanno da parte', !!(await until(async () => !(await visible(page, '[data-testid="console-list"]')), 3000)))

  // Il pulsante e Ctrl+J li mostrano e nascondono a mano (e la scelta resta).
  await page.getByTestId('toggle-panels').click()
  check('pulsante «Mostra anteprima e console»: tornano', !!(await until(() => visible(page, '[data-testid="console-list"]'), 3000)))
  await page.keyboard.press('Control+J')
  check('Ctrl+J: li nasconde di nuovo', !!(await until(async () => !(await visible(page, '[data-testid="console-list"]')), 3000)))
  await page.keyboard.press('Control+J')
  check('Ctrl+J: e li rimostra', !!(await until(() => visible(page, '[data-testid="console-list"]'), 3000)))

  // 2. Ctrl+B e il pulsante nella barra.
  await page.keyboard.press('Control+B')
  check('Ctrl+B: l’Esplora si nasconde', !!(await until(async () => !(await visible(page, '[data-path="index.html"]')), 3000)))
  check('il pulsante dice che l’Esplora è nascosto', (await page.getByTestId('toggle-sidebar').getAttribute('aria-pressed')) === 'false')
  await page.getByTestId('toggle-sidebar').click()
  check('pulsante nella barra: l’Esplora torna', !!(await until(() => visible(page, '[data-path="index.html"]'), 3000)))
  await page.keyboard.press('Control+B')
  await page.keyboard.press('Control+Shift+E')
  check('Ctrl+Shift+E rimostra l’Esplora nascosto', !!(await until(() => visible(page, '[data-path="index.html"]'), 3000)))
  check('...e il pulsante lo sa', (await page.getByTestId('toggle-sidebar').getAttribute('aria-pressed')) === 'true')

  // Scrittura rapida e Benvenuto: l'albero c'è sempre.
  await page.getByTestId('open-quick').click()
  await wait(500)
  check('Scrittura rapida: l’albero dei file resta visibile', await visible(page, '[data-path="index.html"]'))
  await page.locator('.dv-tab', { hasText: /Benvenuto/ }).click()
  check('Benvenuto: anteprima e console di nuovo al loro posto', !!(await until(() => visible(page, '[data-testid="console-list"]'), 3000)))
  // P2-4/P2-10: gli strumenti visuali si trovano anche nel Benvenuto.
  const visualButtons = await Promise.all(['welcome-designer', 'welcome-blocks', 'welcome-nodes', 'welcome-database'].map((id) => page.getByTestId(id).isVisible()))
  check('Benvenuto: pulsanti per Designer, Blocchi, Nodi e Database', visualButtons.every(Boolean), visualButtons.join(','))
  await page.getByTestId('welcome-designer').click()
  check('Benvenuto: «Designer» apre il designer', !!(await until(() => visible(page, '[data-testid="designer"]'), 5000)))

  // 4. Esplora: trascinamento su una cartella e tastiera.
  mkdirSync(join(root, 'pagine'))
  writeFileSync(join(root, 'pagine', 'chi-sono.html'), '<h1>Chi sono</h1>\n')
  writeFileSync(join(root, 'note.txt'), 'appunti\n')
  await page.locator('.panel-toolbar [title="Aggiorna"]').click().catch(() => undefined)
  await until(async () => (await page.locator('[data-path="note.txt"]').count()) === 1 && (await page.locator('[data-path="pagine"]').count()) === 1, 8000)
  await page.locator('[data-path="note.txt"]').dragTo(page.locator('[data-path="pagine"]'))
  const moved = await until(() => existsSync(join(root, 'pagine', 'note.txt')) && !existsSync(join(root, 'note.txt')), 8000)
  check('Esplora: un file trascinato su una cartella si sposta lì', !!moved)
  check('Esplora: l’albero mostra il file nella nuova cartella', !!(await until(async () => (await page.locator('[data-path="pagine/note.txt"]').count()) === 1, 5000)))
  await page.locator('[data-path="pagine/note.txt"]').dragTo(page.getByTestId('explorer-tree'), { targetPosition: { x: 60, y: 5 + (await page.getByTestId('explorer-tree').boundingBox()).height - 12 } })
  check('Esplora: lasciato nello spazio vuoto torna nella cartella principale', !!(await until(() => existsSync(join(root, 'note.txt')), 8000)))

  // Tastiera: frecce, F2 (rinomina), Canc (con conferma), Invio (apre).
  // (il clic apre il file e porta il fuoco nell'editor: col Tab o col fuoco si resta nell'albero)
  await page.locator('[data-path="index.html"]').focus()
  await page.keyboard.press('ArrowDown')
  const afterDown = await page.evaluate(() => document.activeElement?.getAttribute('data-path'))
  check('Esplora: la freccia giù sposta il fuoco sulla riga dopo', !!afterDown && afterDown !== 'index.html', String(afterDown))
  await page.keyboard.press('ArrowUp')
  check('Esplora: la freccia su torna indietro', (await page.evaluate(() => document.activeElement?.getAttribute('data-path'))) === 'index.html')
  await page.keyboard.press('F2')
  check('Esplora: F2 apre «Rinomina»', !!(await until(async () => (await page.locator('.dialog input').count()) === 1, 3000)))
  await page.keyboard.press('Escape')
  await page.locator('.dialog').waitFor({ state: 'detached', timeout: 3000 }).catch(() => undefined)
  await page.locator('[data-path="note.txt"]').focus()
  await page.keyboard.press('Delete')
  check('Esplora: Canc chiede conferma', !!(await until(async () => (await page.locator('.dialog').count()) === 1, 3000)))
  await page.keyboard.press('Escape')
  await wait(300)
  check('Esplora: annullando, il file resta', existsSync(join(root, 'note.txt')))
  await page.locator('[data-path="style.css"]').focus()
  await page.keyboard.press('Enter')
  check('Esplora: Invio apre il file', !!(await until(async () => (await page.locator('.dv-tab.dv-active-tab', { hasText: 'style.css' }).count()) > 0, 5000)))
  await page.locator('.dv-tab', { hasText: 'Designer' }).click()

  // 3. Finestra stretta.
  for (const [width, height] of [
    [1100, 700],
    [1024, 640]
  ]) {
    await page.setViewportSize({ width, height })
    await wait(700)
    const info = await page.evaluate(() => ({
      inner: window.innerWidth,
      scroll: document.documentElement.scrollWidth,
      outside: [...document.querySelectorAll('.toolbar > *, .designer-toolbar *, .designer-right')].filter((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > window.innerWidth + 1).length
    }))
    check(`${width} px: niente oltre il bordo della finestra`, info.scroll <= info.inner && info.outside === 0, JSON.stringify(info))
    check(`${width} px: Impostazioni raggiungibili`, await page.locator('.toolbar [title="Impostazioni"]').isVisible())
    await run.shot(`02-${width}`)
  }
  await page.setViewportSize({ width: 1500, height: 920 })

  check('nessun errore JavaScript nella finestra', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
