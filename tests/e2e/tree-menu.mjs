// Collaudo del tasto destro dell'albero (1.6, `npm run build` prima):
//  1. su un file: titolo col nome, gruppi, sottomenu «Apri con» che si apre passando col mouse
//  2. «Duplica» crea «nome copia.ext» e la apre; «Copia → Nome» mette il nome negli appunti
//  3. su una cartella: «Duplica» spento con il perché; «Nuovo → File…» crea il file nella cartella
//  4. da tastiera: Maiusc+F10 sulla riga apre il menu con la prima voce attiva; → apre il sottomenu, Esc lo chiude
//  5. «Apri il terminale qui» apre un terminale nella cartella
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRun, ensureBuilt, terminalText, until, wait } from './helpers.mjs'

ensureBuilt()
const run = createRun('tree-menu')
const { check } = run

try {
  const page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })
  const root = await run.newProject('web-js', 'Menu')
  await page.getByTestId('side-panel').waitFor({ timeout: 5000 }).catch(() => undefined)
  if ((await page.getByTestId('side-panel').count()) > 0) await page.keyboard.press('Control+Alt+B')
  mkdirSync(join(root, 'pagine'), { recursive: true })
  writeFileSync(join(root, 'pagine', 'note.txt'), 'ciao')
  await page.locator('[data-path="pagine"]').waitFor({ timeout: 8000 })

  // 1. File: titolo, gruppi e sottomenu.
  await page.locator('[data-path="index.html"]').click({ button: 'right' })
  const menu = page.locator('.context-menu').first()
  check('tasto destro su un file: il titolo è il nome del file', (await menu.locator('.context-menu-heading').first().innerText()).trim() === 'index.html')
  check('ci sono i gruppi (separatori)', (await menu.locator('hr').count()) >= 3)
  await page.getByTestId('tree-sub-openWith').hover()
  const sub = page.locator('.context-submenu')
  check('passando su «Apri con» si apre il sottomenu', !!(await until(() => sub.isVisible(), 2000)))
  check('il sottomenu propone anteprima e designer', (await sub.getByTestId('tree-menu-openPreview').count()) === 1 && (await sub.getByTestId('tree-menu-openDesigner').count()) === 1)
  const { boxes, width } = await page.evaluate(() => ({ boxes: [...document.querySelectorAll('.context-menu')].map((el) => el.getBoundingClientRect().toJSON()), width: window.innerWidth }))
  check('il sottomenu sta accanto al menu, dentro la finestra', boxes.length === 2 && boxes[1].left >= boxes[0].left + 50 && boxes[1].right <= width)
  await run.shot('01-sottomenu')

  // 2. Duplica e Copia → Nome.
  await page.getByTestId('tree-menu-duplicate').click()
  check('«Duplica» crea «index copia.html»', !!(await until(() => existsSync(join(root, 'index copia.html')), 5000)))
  check('la copia si apre nell’editor', !!(await until(() => page.locator('[data-editor-path="index copia.html"]').isVisible(), 5000)))
  await run.app.evaluate(({ clipboard }) => clipboard.writeText(''))
  await page.locator('[data-path="index.html"]').click({ button: 'right' })
  await page.getByTestId('tree-sub-copy').click()
  await page.locator('.context-submenu').getByTestId('tree-menu-copyName').click()
  check('«Copia → Nome» mette il nome negli appunti', !!(await until(async () => (await run.app.evaluate(({ clipboard }) => clipboard.readText())) === 'index.html', 3000)))

  // 3. Cartella: Duplica spento con il perché; Nuovo → File dentro la cartella.
  await page.locator('[data-path="pagine"]').click({ button: 'right' })
  const dup = page.locator('.context-menu').first().getByTestId('tree-menu-duplicate')
  check('cartella: «Duplica» è spento', (await dup.getAttribute('aria-disabled')) === 'true')
  check('…e dice perché', ((await dup.getAttribute('title')) ?? '').includes('solo i file'))
  await dup.click({ force: true })
  check('una voce spenta non chiude il menu e non fa niente', await page.locator('.context-menu').first().isVisible())
  await page.getByTestId('tree-sub-new').hover()
  await page.locator('.context-submenu').getByTestId('tree-menu-newFile').click()
  const input = page.locator('.dialog input').first()
  await input.waitFor({ timeout: 3000 })
  await input.fill('stile.css')
  await input.press('Enter')
  check('«Nuovo → File…» sulla cartella crea il file lì dentro', !!(await until(() => existsSync(join(root, 'pagine', 'stile.css')), 5000)))

  // 4. Tastiera. Il file appena creato si apre nell'editor, che prende il fuoco quando è pronto: si aspetta, poi
  // il fuoco va sulla riga dell'albero.
  await page.locator('[data-editor-path="pagine/stile.css"]').waitFor({ timeout: 8000 }).catch(() => undefined)
  await wait(500)
  const row = page.locator('[data-path="index.html"]')
  await until(async () => {
    await row.focus()
    return page.evaluate(() => document.activeElement?.getAttribute('data-path') === 'index.html')
  }, 4000)
  await page.keyboard.press('Shift+F10')
  const keyMenu = page.locator('.context-menu').first()
  check('Maiusc+F10 sulla riga apre il menu', !!(await until(() => keyMenu.isVisible(), 2000)))
  check('…con la prima voce attiva', (await keyMenu.locator('button.active').count()) === 1)
  // Giù fino a un sottomenu, → lo apre, Esc chiude solo il sottomenu.
  for (let i = 0; i < 8 && !(await keyMenu.locator('button.active.submenu').count()); i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  check('→ apre il sottomenu della voce', !!(await until(() => page.locator('.context-submenu').isVisible(), 2000)))
  await page.keyboard.press('Escape')
  check('Esc chiude solo il sottomenu', (await page.locator('.context-submenu').count()) === 0 && (await keyMenu.isVisible()))
  await page.keyboard.press('Escape')
  check('un secondo Esc chiude il menu', !!(await until(async () => (await page.locator('.context-menu').count()) === 0, 2000)))

  // 5. Terminale nella cartella.
  await page.locator('[data-path="pagine"]').click({ button: 'right' })
  await page.locator('.context-menu').first().getByTestId('tree-menu-terminalHere').click()
  await wait(1500)
  await page.keyboard.type('cd\r')
  check('«Apri il terminale qui» parte nella cartella', !!(await until(async () => (await terminalText(page)).toLowerCase().includes('pagine'), 8000)), (await terminalText(page)).slice(-200))

  check('nessun errore nella console', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
