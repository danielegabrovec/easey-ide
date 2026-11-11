// Collaudo end-to-end della Scrittura rapida (senza progetto):
//  1. si apre dal Benvenuto senza creare progetti; l'esempio JS gira da solo
//  2. JS: valori accanto alle righe, console con riga, errori con riga, sintassi, ciclo infinito fermato
//  3. await di primo livello e timer
//  4. TypeScript: valori, errore di tipo segnalato, riga dell'errore riportata sul .ts
//  5. Python (Pyodide): print con riga, valori, errore con riga, ciclo infinito fermato
//  6. SQL: dati d'esempio, risultati, errore, completamento con le tabelle
//  7. HTML: anteprima viva e console della pagina
//  8. raccolta: Ctrl+S, sovrascrivi, nuovo, riapri, rinomina, elimina (Cestino)
//  9. livelli di aiuto; con Ollama: suggerimento in grigio (leggero = una riga) e "Genera con AI"
// 10. riavvio: la bozza e il linguaggio restano
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createRun, ensureBuilt, until, wait } from './helpers.mjs'

ensureBuilt()
const run = createRun('quick')
const { check } = run
const collection = join(run.work, 'userData', 'Scrittura rapida')
const endpoint = process.env.LAB_IDE_OLLAMA ?? 'http://127.0.0.1:11434'
const ollamaUp = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(3000) })
  .then((r) => r.ok)
  .catch(() => false)

const clean = (text) => text.replace(/ /g, ' ')
let page

const editorText = async () => clean(await page.locator('[data-testid="quick-editor"] .view-lines').innerText())
const outputText = async () => clean(await page.getByTestId('quick-output').innerText())
const status = async () => (await page.getByTestId('quick-status').count()) ? page.getByTestId('quick-status').getAttribute('data-status') : null

// Incolla dagli appunti: scrivere tasto per tasto farebbe intervenire l'auto-rientro e le parentesi automatiche.
async function setCode(text) {
  await page.locator('[data-testid="quick-editor"] .view-lines').click()
  await page.evaluate((value) => navigator.clipboard.writeText(value), text)
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Control+V')
  // L'incolla è asincrono: si aspetta che il testo sia davvero nell'editor.
  const first = text.split('\n')[0].trim().replace(/\s+/g, ' ')
  await until(async () => (await editorText()).replace(/\s+/g, ' ').includes(first), 5000, 50)
}

async function runAndWait(expected = ['ok', 'error', 'timeout'], timeout = 15000) {
  await wait(50)
  await page.keyboard.press('Control+Enter')
  await wait(150)
  return until(async () => {
    const s = await status()
    return expected.includes(s) ? s : null
  }, timeout)
}

async function language(id) {
  await page.locator(`[data-quick-language="${id}"]`).click()
  await until(async () => (await page.getByTestId('quick-panel').getAttribute('data-language')) === id, 5000)
}

try {
  page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })

  // 1. Apertura senza progetto
  await page.getByTestId('welcome-quick').click()
  await page.getByTestId('quick-panel').waitFor({ timeout: 10000 })
  check('si apre dal Benvenuto', true)
  check('nessun progetto creato o aperto', (await page.locator('.toolbar .project-name').count()) === 0 && readdirSync(run.projects).length === 0)
  const starter = await until(async () => (await outputText()).includes('somma 46'), 15000)
  check("l'esempio JS gira da solo all'apertura", !!starter, await outputText())
  const inline = await until(async () => {
    const text = await editorText()
    return /→ 9/.test(text) ? text : null
  }, 5000)
  check('valore accanto alla riga (Math.max → 9)', !!inline, inline ?? (await editorText()))
  await run.shot('01-js-esempio')

  // 2. JavaScript
  await setCode('const a = 2 + 3\nconsole.log("somma", a)\na * 10\n')
  const lines = await until(async () => {
    const text = await editorText()
    return text.includes('a = 5') && text.includes('→ 50') && (await outputText()).includes('somma 5') ? text : null
  }, 10000)
  check('esecuzione automatica mentre si scrive: variabile, console e valore accanto alle righe', !!lines, lines ?? (await editorText()))
  const logLine = await page.locator('.quick-out.log .quick-line').first().innerText()
  check('la console indica la riga di chi stampa', logLine.trim() === '2', logLine)

  await setCode('const x = 1\nfunction f() { return null.y }\nf()\n')
  check('errore a runtime: stato «error»', (await runAndWait()) === 'error')
  const err = await page.getByTestId('quick-error').first().innerText()
  check("errore con il tipo e la riga dov'è nato", /TypeError/.test(err) && (await page.locator('[data-testid="quick-error"] .quick-line').first().innerText()).trim() === '2', err)

  await setCode('const = 5\n')
  await runAndWait(['error'])
  check('errore di sintassi segnalato', /Errore di sintassi/.test(await outputText()), await outputText())

  await setCode('while (true) {}\n')
  const started = Date.now()
  const loop = await runAndWait(['timeout'], 12000)
  check('ciclo infinito: fermato allo scadere del tempo (5 s)', loop === 'timeout', `${loop} dopo ${Date.now() - started} ms`)
  await run.shot('02-js-ciclo-infinito')
  await setCode('1 + 1\n')
  check("dopo il ciclo infinito l'esecuzione riparte", (await runAndWait(['ok'])) === 'ok' && /→ 2/.test(await editorText()))

  // 3. await di primo livello e timer
  await setCode("await new Promise((r) => setTimeout(r, 200))\nconsole.log('dopo')\nsetTimeout(() => console.log('timer'), 100)\n")
  const awaited = await runAndWait(['ok'])
  check('await di primo livello e timer: aspetta la fine', awaited === 'ok' && /dopo[\s\S]*timer/.test(await outputText()), await outputText())

  // 4. TypeScript
  await language('typescript')
  await setCode('const n: number = 4\nconst quad = (x: number): number => x * x\nquad(n)\nconst s: string = 5\n')
  const ts = await until(async () => ((await editorText()).includes('→ 16') ? true : null), 12000)
  check('TypeScript: tipi tolti ed eseguito (→ 16)', !!ts, await editorText())
  check('TypeScript: errore di tipo sottolineato nell editor', !!(await until(async () => (await page.locator('[data-testid="quick-editor"] .squiggly-error').count()) > 0, 15000)))
  await setCode('interface P { a: number }\n\nconst p: P = { a: 1 }\nthrow new Error("boom")\n')
  await runAndWait(['error'])
  const tsLine = await page.locator('[data-testid="quick-error"] .quick-line').first().innerText()
  check("TypeScript: la riga dell'errore è quella del .ts (4)", tsLine.trim() === '4', tsLine)
  await run.shot('03-ts')

  // 5. Python
  await language('python')
  await setCode('x = 6 * 7\nprint("ciao", x)\nx + 1\nfor i in range(3):\n    print(i)\n')
  const py = await runAndWait(['ok', 'error'], 40000)
  const pyOut = await outputText()
  check('Python (Pyodide): eseguito senza installazioni', py === 'ok', `${py}: ${pyOut}`)
  check('Python: print con la riga e valori accanto alle righe', /ciao 42/.test(pyOut) && /x = 42/.test(await editorText()) && /→ 43/.test(await editorText()), await editorText())
  await run.shot('04-python')
  await setCode('def f():\n    return 1 / 0\n\nf()\n')
  const pyState = await runAndWait(['error'], 20000)
  const pyErr = (await page.getByTestId('quick-error').count()) ? await page.getByTestId('quick-error').first().innerText() : `${pyState}: ${await outputText()}`
  check('Python: errore con tipo e riga (ZeroDivisionError, riga 2)', /ZeroDivisionError/.test(pyErr) && /^2\b/.test(pyErr.trim()), pyErr)
  await setCode('while True:\n    pass\n')
  check('Python: ciclo infinito fermato', (await runAndWait(['timeout'], 15000)) === 'timeout')
  await setCode('print(sum(range(10)))\n')
  check('Python: riparte subito (worker di riserva già caricato)', (await runAndWait(['ok'], 10000)) === 'ok' && (await outputText()).includes('45'))

  // 6. SQL
  await language('sql')
  await page.getByTestId('quick-sql-sample').selectOption('negozio')
  check("SQL: dati d'esempio caricati (tabelle visibili)", !!(await until(async () => (await page.getByTestId('quick-sql-tables').innerText()).includes('clienti'), 10000)))
  await setCode('SELECT nome FROM clienti ORDER BY nome LIMIT 2;\n')
  await runAndWait(['ok'])
  check('SQL: risultato in tabella', (await page.locator('[data-testid="quick-sql-grid"] tbody tr').count()) === 2)
  await setCode('INSERT INTO clienti (nome) VALUES (\'Zed\');\nSELECT COUNT(*) AS n FROM clienti;\n')
  await runAndWait(['ok'])
  const first = await page.locator('[data-testid="quick-sql-grid"] tbody td:not(.rownum)').first().innerText()
  await runAndWait(['ok'])
  const second = await page.locator('[data-testid="quick-sql-grid"] tbody td:not(.rownum)').first().innerText()
  check('SQL: database pulito a ogni esecuzione (rieseguire non duplica)', first === second, `${first} / ${second}`)
  await setCode('SELECT * FROM inesistente;\n')
  await runAndWait(['error'])
  check('SQL: errore mostrato', (await page.getByTestId('quick-sql-error').count()) > 0)
  await setCode('SELECT * FROM cl')
  await page.keyboard.press('Control+Space')
  const suggested = await until(async () => {
    const text = await page.locator('[data-testid="quick-editor"] .suggest-widget').innerText()
    return text.includes('clienti') ? text : null
  }, 5000)
  await run.shot('05a-sql-completamento')
  check('SQL: completamento con le tabelle del database in memoria', !!suggested, suggested ?? (await page.locator('.suggest-widget').count()) + ' widget')
  await page.keyboard.press('Escape')
  await run.shot('05-sql')

  // 7. HTML
  await language('html')
  const frame = page.frameLocator('[data-testid="quick-page"]')
  await until(async () => (await frame.locator('#conta').count()) > 0, 10000)
  await frame.locator('#conta').click()
  await frame.locator('#conta').click()
  check('HTML: anteprima viva (clic → DOM aggiornato)', (await frame.locator('#valore').innerText()) === '2')
  check('HTML: console della pagina con la riga', !!(await until(async () => (await outputText()).includes('clic numero 2'), 5000)), await outputText())
  await run.shot('06-html')

  // 8. Raccolta
  await language('javascript')
  await setCode('// Somma veloce\nconst t = 1 + 2\n')
  await page.keyboard.press('Control+S')
  const dialog = page.locator('.dialog')
  await dialog.waitFor({ timeout: 5000 })
  await run.shot('07a-salva')
  const proposed = (await dialog.locator('input').count()) ? await dialog.locator('input').inputValue() : await dialog.innerText()
  check('Ctrl+S: titolo proposto dal primo commento', proposed === 'Somma veloce', proposed)
  await dialog.locator('.btn.primary').click()
  const saved = join(collection, 'Somma veloce.js')
  check('salvato come file vero nella raccolta', !!(await until(() => existsSync(saved), 5000)))
  check('compare nella raccolta', !!(await until(async () => (await page.locator('[data-snippet="Somma veloce.js"]').count()) > 0, 5000)))
  await page.locator('[data-testid="quick-editor"] .view-lines').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.insertText('t * 2\n')
  check('modifica → segnata come non salvata', !!(await until(async () => (await page.getByTestId('quick-dirty').count()) > 0, 3000)))
  await page.keyboard.press('Control+S')
  check('Ctrl+S sovrascrive senza chiedere', !!(await until(() => readFileSync(saved, 'utf8').includes('t * 2'), 5000)) && (await page.locator('.dialog').count()) === 0)
  await page.getByTestId('quick-new').click()
  check('nuovo foglio vuoto', !!(await until(async () => (await editorText()).trim() === '', 3000)))
  await page.locator('[data-snippet="Somma veloce.js"]').click()
  check('riapre il salvataggio', !!(await until(async () => (await editorText()).includes('Somma veloce'), 5000)))
  await page.getByTestId('quick-title').fill('Somma rinominata')
  await page.getByTestId('quick-title').press('Enter')
  check('cambiare titolo rinomina il file', !!(await until(() => existsSync(join(collection, 'Somma rinominata.js')) && !existsSync(saved), 5000)))
  await page.locator('[data-snippet="Somma rinominata.js"]').hover()
  await page.locator('[data-delete-snippet="Somma rinominata.js"]').click()
  await page.locator('.dialog .btn.danger').click()
  check('elimina (nel Cestino)', !!(await until(() => !existsSync(join(collection, 'Somma rinominata.js')), 5000)))
  await run.shot('07-raccolta')

  // 9. Livelli di aiuto e AI
  await page.locator('[data-testid="quick-levels"] [data-level="strong"]').click()
  check('livello di aiuto: Forte', !!(await until(async () => (await page.getByTestId('quick-panel').getAttribute('data-level')) === 'strong', 3000)))
  await page.locator('[data-testid="quick-levels"] [data-level="off"]').click()
  await setCode('const lista = [1, 2]\nlista.')
  await wait(800)
  check('livello Spento: nessun suggerimento automatico', (await page.locator('.suggest-widget.visible').count()) === 0)
  await page.locator('[data-testid="quick-levels"] [data-level="medium"]').click()
  await setCode('const lista = [1, 2]\nlista.')
  await page.keyboard.type('ma', { delay: 60 })
  check('livello Intermedio: suggerimenti mentre si scrive', !!(await until(async () => (await page.locator('.suggest-widget.visible').count()) > 0, 5000)))
  await page.keyboard.press('Escape')

  if (ollamaUp) {
    await page.locator('[data-testid="quick-levels"] [data-level="light"]').click()
    // Checkbox React che salva via IPC: clic + attesa (uncheck() non vede subito il cambio).
    await page.getByTestId('quick-autorun').click()
    await until(async () => !(await page.getByTestId('quick-autorun').isChecked()), 3000)
    await setCode('// restituisce il doppio di un numero\nfunction doppio(n) {\n  ')
    // I suggerimenti in grigio partono mentre si digita (non dopo un incolla).
    await page.keyboard.type('ret', { delay: 80 })
    // Con l'elenco dei suggerimenti aperto Monaco mostra il grigio solo se estende la voce scelta: lo si chiude.
    await wait(120)
    await page.keyboard.press('Escape')
    const ghost = page.locator('[data-testid="quick-editor"] .ghost-text-decoration, [data-testid="quick-editor"] .ghost-text')
    const light = await until(async () => ((await ghost.count()) > 0 ? true : null), 60000, 300)
    check('AI livello Leggero: suggerimento in grigio', !!light)
    await run.shot('08-ai-leggero')
    if (light) {
      await page.keyboard.press('Tab')
      await wait(300)
      const model = await editorText()
      const third = model.split('\n')[2] ?? ''
      check('AI livello Leggero: Tab accetta una sola riga', model.split('\n').length === 3 && third.trim().length > 'ret'.length, model)
    }
    await page.keyboard.press('Escape')
    await page.locator('[data-testid="quick-levels"] [data-level="strong"]').click()
    await setCode('// Scrittura rapida: funzione che restituisce il quadrato di un numero\n')
    await page.keyboard.press('Control+I')
    await page.getByTestId('quick-prompt').fill('funzione quadrato(n) che restituisce n per n, poi stampa quadrato(7) con console.log')
    await page.getByTestId('quick-prompt').press('Enter')
    const generated = await until(async () => ((await page.getByTestId('quick-prompt').count()) === 0 ? await editorText() : null), 120000, 500)
    check('Genera con AI: codice inserito nell editor', !!generated && /quadrato/.test(generated), generated ?? '')
    const ran = await until(async () => (await outputText()).includes('49'), 20000)
    check('Genera con AI: il codice generato viene eseguito (49)', !!ran, await outputText())
    await run.shot('09-ai-genera')
    await page.getByTestId('quick-autorun').click()
    await until(() => page.getByTestId('quick-autorun').isChecked(), 3000)
  } else {
    console.log('— Ollama non risponde: controlli AI saltati')
  }

  // 10. Riavvio: bozza e linguaggio ripristinati
  await setCode('// bozza da ritrovare\n40 + 2\n')
  await wait(800)
  await run.app.close()
  page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })
  await page.keyboard.press('Control+Shift+Q')
  await page.getByTestId('quick-panel').waitFor({ timeout: 10000 })
  check('Ctrl+Shift+Q apre la Scrittura rapida', true)
  check('dopo il riavvio la bozza è ancora lì e gira', !!(await until(async () => (await editorText()).includes('bozza da ritrovare') && (await editorText()).includes('→ 42'), 10000)), await editorText())
  check('nessun errore nella console dell IDE', run.issues.length === 0, run.issues.slice(0, 3).join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('errore').catch(() => undefined)
}
await run.finish()
