// Collaudo end-to-end di F0+F1 sull'app costruita (`npm run build` prima).
//  1. progetto web TypeScript dal modello → anteprima, clic → console con la riga del .ts
//  2. modifica nell'editor → autosalvataggio → anteprima ricaricata
//  3. riga di comando della console; errori di tipo nel pannello Problemi
//  4. errore di sintassi → errore di compilazione (una sola volta) con file e riga
//  5. programma console JS → F5 → output e uscita 0
//  6. programma console TS interattivo col Node di sistema; nessun problema "fantasma"
//  7. shell vera
//  8. riavvio col Node interno forzato (PC senza Node): stesso programma interattivo
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { consoleText, createRun, ensureBuilt, problemCount, terminalText, until } from './helpers.mjs'

ensureBuilt()
const run = createRun('smoke')
const { check } = run

async function runInteractiveTs(label) {
  const page = run.page
  await page.keyboard.press('F5')
  const asked = await until(async () => (await terminalText(page)).includes('Come ti chiami?'), 20000)
  check(`${label}: il programma TS chiede input`, !!asked, asked ? '' : await terminalText(page))
  await page.locator('.terminal-host:visible').click()
  await page.keyboard.type('Ada')
  await page.keyboard.press('Enter')
  const greeted = await until(async () => (await terminalText(page)).includes('Ciao Ada!'), 8000)
  check(`${label}: legge la risposta (readline)`, !!greeted, greeted ? '' : await terminalText(page))
  await page.keyboard.type('3 4 5')
  await page.keyboard.press('Enter')
  const finished = await until(async () => {
    const text = await terminalText(page)
    return text.includes('Programma terminato (codice 0)') ? text : null
  }, 10000)
  check(`${label}: risultato (media 4) e uscita 0`, !!finished && /media[\s│|]*4/.test(finished), finished ? '' : await terminalText(page))
}

try {
  let page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })
  check('avvio: pagina di benvenuto', true)
  await run.shot('01-benvenuto')

  // 1. Progetto web TypeScript
  const projectRoot = await run.newProject('web-ts', 'Contatore TS')
  check('progetto creato su disco', existsSync(join(projectRoot, 'src', 'main.ts')) && existsSync(join(projectRoot, 'easey.json')))
  const frame = page.frameLocator('[data-testid="preview-frame"]')
  const loaded = await until(async () => (await frame.locator('#valore').innerText({ timeout: 500 })) === '0', 15000)
  check('anteprima: la pagina TS è caricata e il modulo è eseguito', !!loaded)
  await frame.locator('#incrementa').click()
  await frame.locator('#incrementa').click()
  const logged = await until(async () => {
    const text = await consoleText(page)
    return text.includes('Nuovo valore:') && /src\/main\.ts:1\d/.test(text) ? text : null
  })
  check('console: console.log con posizione sul file .ts originale', !!logged)
  check('anteprima: il DOM si aggiorna', (await frame.locator('#valore').innerText()) === '2')
  check('problemi: progetto nuovo senza errori', (await problemCount(page)) === 0)
  await run.shot('02-progetto-ts')

  // 2. Modifica nell'editor → autosalvataggio → ricarica
  await page.locator('[data-path="src/main.ts"]').click()
  const editor = page.locator('[data-editor-path="src/main.ts"] .view-lines')
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type("console.warn('modificato dall editor'", { delay: 5 })
  check('autosalvataggio + anteprima dal vivo', !!(await until(async () => (await consoleText(page)).includes('modificato dall editor'), 12000)))
  check('file salvato su disco', readFileSync(join(projectRoot, 'src', 'main.ts'), 'utf8').includes('modificato dall editor'))

  // 3. Riga di comando della console + errori di tipo
  await page.getByTestId('console-input').fill('document.title + " / " + (2 + 3)')
  await page.getByTestId('console-input').press('Enter')
  check('console: valuta espressioni nella pagina', !!(await until(async () => (await consoleText(page)).includes('Contatore TypeScript / 5'))))
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('const numero: number = "testo"', { delay: 5 })
  check('problemi: errore di tipo TS segnalato', !!(await until(async () => (await problemCount(page)) > 0, 15000)))
  await run.shot('03-problemi')

  // 4. Errore di sintassi → errore di compilazione
  await page.keyboard.press('Enter')
  await page.keyboard.type('let = ;', { delay: 5 })
  const compileError = await until(async () => {
    const text = await consoleText(page)
    return text.includes('Errore di compilazione') && text.includes('src/main.ts:') ? text : null
  }, 12000)
  check('console: errore di compilazione con file e riga', !!compileError)
  check('console: errore di compilazione riportato una sola volta', !!compileError && !compileError.includes('Uncaught'))
  await run.shot('04-errore-compilazione')

  // 5. Programma console JavaScript
  await run.newProject('console-js', 'Console JS')
  await page.keyboard.press('F5')
  const jsOut = await until(async () => {
    const text = await terminalText(page)
    return text.includes('Programma terminato (codice 0)') ? text : null
  }, 20000)
  check('terminale: programma JS eseguito con uscita 0', !!jsOut && jsOut.includes('Più di 30 anni'), jsOut ? '' : await terminalText(page))
  await run.shot('05-console-js')

  // 6. Programma console TypeScript interattivo (Node di sistema se presente)
  await run.newProject('console-ts', 'Console TS')
  check('problemi: nessun errore "fantasma" dal progetto precedente', !!(await until(async () => (await problemCount(page)) === 0, 8000)))
  await runInteractiveTs('Node di sistema')
  await run.shot('06-console-ts')

  // 7. Shell vera
  await page.getByTestId('terminal-new').click()
  await until(async () => (await terminalText(page)).includes('>'), 15000)
  await page.locator('.terminal-host:visible').click()
  await page.keyboard.type('echo ciao-dalla-shell')
  await page.keyboard.press('Enter')
  // (le righe si uniscono: con la chat laterale aperta il terminale è stretto e il comando va a capo)
  check('terminale: shell reale', !!(await until(async () => (await terminalText(page)).replace(/\n/g, '').split('ciao-dalla-shell').length > 2, 15000)))
  await run.shot('07-shell')
  await run.app.close()

  // 8. Riavvio con il Node interno forzato: l'ultimo progetto si riapre da solo.
  page = await run.launch({ LAB_IDE_FORCE_BUNDLED_NODE: '1' })
  check('riavvio: l’ultimo progetto si riapre', !!(await until(async () => (await page.locator('[data-path="src/statistiche.ts"]').count()) > 0, 20000)))
  await runInteractiveTs('Node interno (senza Node installato)')
  await run.shot('08-node-interno')

  // Informazioni: autore, licenza e componenti di terze parti inclusi nell'app.
  await page.keyboard.press('Escape')
  await run.palette('Informazioni')
  check('informazioni: autore e licenza', (await page.getByTestId('about-author').innerText()).includes('Daniele Gabrovec'))
  await page.getByTestId('about-third').click()
  check('informazioni: componenti di terze parti', !!(await until(async () => (await page.getByTestId('legal-text').innerText().catch(() => '')).includes('monaco-editor'), 5000)))
  const closeTop = () => page.locator('.dialog').last().getByRole('button', { name: 'Chiudi' }).click()
  await closeTop()
  await page.getByTestId('about-license').click()
  check('informazioni: testo della licenza MIT', (await page.getByTestId('legal-text').innerText()).includes('Copyright (c) 2026 Daniele Gabrovec'))
  await run.shot('09-informazioni')
  await closeTop()
  await closeTop()

  check('nessun errore JavaScript nella finestra', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
