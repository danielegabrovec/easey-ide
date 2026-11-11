// Collaudo end-to-end di F1.5 (assistente AI) con l'Ollama vero. Se Ollama non risponde, il collaudo
// verifica solo che l'IDE lo segnali senza errori, e termina con successo.
//  1. barra di stato con il modello scelto in automatico
//  2. autocompletamento inline: testo grigio → Tab → codice inserito
//  3. chat: domanda e risposta in streaming
//  4. "Proponi una correzione" → confronto prima/dopo → Applica → file modificato
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRun, ensureBuilt, until } from './helpers.mjs'

ensureBuilt()
const run = createRun('ai')
const { check } = run

const endpoint = process.env.LAB_IDE_OLLAMA ?? 'http://127.0.0.1:11434'
const ollamaUp = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(3000) })
  .then((r) => r.ok)
  .catch(() => false)

try {
  const page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })
  const root = await run.newProject('console-js', 'Prova AI')
  const status = page.locator('[data-status-item="ai"]')
  await until(async () => (await status.count()) > 0, 10000)
  const statusText = await status.innerText()

  if (!ollamaUp) {
    check('senza Ollama: la barra di stato lo segnala', statusText.includes('non disponibile'), statusText)
    await page.keyboard.press('Control+Shift+A')
    check('senza Ollama: il pannello spiega cosa fare', !!(await until(async () => (await page.getByText('Ollama non risponde').count()) > 0)))
  } else {
    check('barra di stato: modello di autocompletamento scelto', /✦ \S+/.test(statusText) && !statusText.includes('non disponibile'), statusText)

    // 2. Autocompletamento inline
    const editor = page.locator('[data-editor-path="main.js"] .view-lines')
    await editor.click()
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.type('// restituisce la somma di due numeri', { delay: 10 })
    await page.keyboard.press('Enter')
    await page.keyboard.type('function somma(a, b) {', { delay: 10 })
    await page.keyboard.press('Enter')
    const ghost = await until(async () => (await page.locator('[data-editor-path="main.js"] .ghost-text-decoration, [data-editor-path="main.js"] .ghost-text').count()) > 0, 60000, 300)
    check('autocompletamento: suggerimento in grigio', !!ghost)
    await run.shot('01-suggerimento')
    if (ghost) {
      await page.keyboard.press('Tab')
      const saved = await until(() => /function somma\(a, b\) \{\s*return a \+ b;?\s*\}\s*$/.test(readFileSync(join(root, 'main.js'), 'utf8')), 8000)
      const text = readFileSync(join(root, 'main.js'), 'utf8')
      check('autocompletamento: Tab inserisce solo il corpo (return a + b), graffe bilanciate', !!saved && text.split('{').length === text.split('}').length, text.split('function somma')[1]?.slice(0, 80))
    }

    // 3. Chat
    await page.keyboard.press('Control+Shift+A')
    await page.getByTestId('ai-input').fill('Rispondi soltanto con la parola PRONTO, in maiuscolo, senza altro testo.')
    await page.getByTestId('ai-send').click()
    const answer = await until(
      async () => {
        const last = page.getByTestId('ai-answer').last()
        return (await last.getAttribute('data-pending')) === 'false' ? last.innerText() : null
      },
      180000,
      500
    )
    check('chat: risposta completa dal modello locale', !!answer && /PRONTO/i.test(answer), answer?.slice(0, 120))
    await run.shot('02-chat')

    // 4. Correzione proposta e applicata
    writeFileSync(join(root, 'doppio.js'), '// doppio(n) deve restituire il doppio di n\nfunction doppio(n) {\n  return n * 3\n}\n\nconsole.log(doppio(2)) // deve stampare 4\n')
    await until(async () => (await page.locator('[data-path="doppio.js"]').count()) > 0, 8000)
    await page.locator('[data-path="doppio.js"]').click()
    await page.locator('[data-editor-path="doppio.js"] .view-lines').click()
    await run.palette('Proponi una correzione')
    const apply = await until(async () => (await page.getByTestId('ai-apply').count()) > 0, 180000, 500)
    check('correzione: risposta con pulsante Applica', !!apply)
    if (apply) {
      await page.getByTestId('ai-apply').last().click()
      await page.getByTestId('ai-apply-confirm').waitFor({ timeout: 10000 })
      await run.shot('03-confronto')
      await page.getByTestId('ai-apply-confirm').click()
      const fixed = await until(() => {
        const text = readFileSync(join(root, 'doppio.js'), 'utf8')
        return /n\s*\*\s*2|2\s*\*\s*n|n\s*\+\s*n/.test(text) && !/n\s*\*\s*3/.test(text) ? text : null
      }, 10000)
      check('correzione: applicata al file e salvata', !!fixed, readFileSync(join(root, 'doppio.js'), 'utf8').slice(0, 160))
    }
  }
  check('nessun errore JavaScript nella finestra', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
