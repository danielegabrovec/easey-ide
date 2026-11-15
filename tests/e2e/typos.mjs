// Collaudo delle parole sbagliate e della chat che conosce la Scrittura rapida (1.6, `npm run build` prima):
//  1. nella Scrittura rapida «consle.log» è sottolineato con «Forse volevi scrivere «console»?»; Ctrl+. → corretto
//  2. in un file Python del progetto «pritn» è un avviso nei Problemi; la correzione rapida lo sistema
//  3. con la Scrittura rapida in uso la chat mostra il suo nome (non «nessun file aperto») e i suggerimenti del suo linguaggio
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRun, ensureBuilt, until, wait } from './helpers.mjs'

ensureBuilt()
const run = createRun('typos')
const { check } = run

/** Messaggi del pannello Problemi (lo apre). */
async function problemMessages(page) {
  await run.palette('Mostra Problemi')
  const rows = page.locator('.problems .problem-row .message')
  await until(async () => (await rows.count()) > 0, 5000)
  return rows.allInnerTexts().catch(() => [])
}

/** Ctrl+. sulla parola e la prima correzione rapida. */
async function quickFix(page) {
  await page.keyboard.press('Control+.')
  const item = page.locator('.action-widget .action-label, .monaco-list-row .action-label, .action-widget [role="option"]').filter({ hasText: 'Correggi in' }).first()
  const shown = await until(async () => (await item.count()) > 0, 5000)
  if (!shown) return false
  await page.keyboard.press('Enter')
  return true
}

try {
  const page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })

  // 1. Scrittura rapida (JavaScript).
  await page.getByTestId('open-quick').click()
  await page.getByTestId('quick-editor').waitFor({ timeout: 10000 })
  await page.locator('[data-testid="quick-editor"] .view-lines').click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type("consle.log('ciao')")
  const squiggle = page.locator('[data-testid="quick-editor"] .squiggly-warning')
  check('Scrittura rapida: «consle» è sottolineato', !!(await until(async () => (await squiggle.count()) > 0, 5000)))
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  check('Ctrl+. propone «Correggi in «console»» e lo applica', await quickFix(page))
  const fixed = await until(async () => (await page.locator('[data-testid="quick-editor"] .view-lines').innerText()).replace(/ /g, ' ').includes("console.log('ciao')"), 3000)
  check('…il testo diventa console.log', !!fixed)
  check('…e l’avviso sparisce', !!(await until(async () => (await squiggle.count()) === 0, 3000)))

  // 3. La chat vede la Scrittura rapida.
  await page.getByTestId('side-panel').waitFor({ timeout: 5000 }).catch(async () => {
    await page.keyboard.press('Control+Alt+B')
    await page.getByTestId('side-panel').waitFor({ timeout: 5000 })
  })
  const chip = page.getByTestId('ai-chip-file')
  check('chat: il chip dice «Scrittura rapida · JS», non «nessun file aperto»', !!(await until(async () => ((await chip.innerText().catch(() => '')) ?? '').includes('Scrittura rapida'), 5000)), await chip.innerText().catch(() => ''))
  const starters = await page.getByTestId('ai-starter').allInnerTexts().catch(() => [])
  check('chat: i suggerimenti d’avvio parlano della Scrittura rapida in JavaScript', starters.some((s) => s.includes('Scrittura rapida')) && !starters.some((s) => s.includes('scrittura-rapida.js')), starters.join(' | '))

  // 2. File Python del progetto.
  const root = await run.newProject('console-js', 'Parole')
  writeFileSync(join(root, 'prova.py'), 'numeri = [1, 2, 3]\nfor n in numeri:\n    pritn(n)\n')
  await page.locator('[data-path="prova.py"]').waitFor({ timeout: 8000 })
  await page.locator('[data-path="prova.py"]').click()
  await page.locator('[data-editor-path="prova.py"]').waitFor({ timeout: 8000 })
  await page.locator('[data-editor-path="prova.py"] .squiggly-warning').first().waitFor({ timeout: 6000 }).catch(() => undefined)
  const messages = await problemMessages(page)
  check('file Python: «pritn» segnalato nei Problemi con «print»', messages.some((m) => m.includes('«print»')), JSON.stringify(messages))
  await page.locator('[data-editor-path="prova.py"] .view-lines').click()
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('End')
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  check('file Python: la correzione rapida c’è', await quickFix(page))
  await page.keyboard.press('Control+S')
  check('…e il file salvato dice print(n)', !!(await until(() => readFileSync(join(root, 'prova.py'), 'utf8').includes('print(n)'), 5000)), readFileSync(join(root, 'prova.py'), 'utf8'))
  await wait(300)

  check('nessun errore nella console', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
