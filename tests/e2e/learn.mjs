// Collaudo end-to-end di F6 (didattica): corso incluso con verifica automatica JS, TS, HTML/CSS e SQL,
// suggerimenti, soluzione sbloccabile, progressi persistenti, importazione di un manuale della Collana, tutor.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRun, ensureBuilt, repo, until } from './helpers.mjs'

ensureBuilt()
const run = createRun('didattica')
const { check } = run

// Un manuale finto con la struttura reale della Collana (README, indice, capitoli "NN - Titolo.md", riquadri 🧪).
const manual = join(run.work, 'SQL da Zero')
mkdirSync(manual)
writeFileSync(join(manual, 'README.md'), '# SQL da Zero\n\nImparare SQL con il centro fitness.\n')
writeFileSync(join(manual, '00 - Indice.md'), '# Indice\n')
writeFileSync(join(manual, '01 - Le tabelle.md'), '# Le tabelle\n\nUna tabella ha righe e colonne.\n\n> 💡 Ogni riga è un cliente.\n\n> 🧪 Scrivi una query con SELECT che mostri tutti i clienti.\n')
writeFileSync(join(manual, '02 - Filtrare.md'), '# Filtrare con WHERE\n\n> 🧪 Filtra i clienti di Milano con WHERE.\n\n> 🧪 Ordina i clienti per nome con ORDER BY.\n')

const courseDir = join(repo, 'resources', 'courses', 'primi-passi', 'esercizi')
const workDir = join(run.work, 'userData', 'Corsi', 'primi-passi')
const solution = (exercise, file) => readFileSync(join(courseDir, exercise, 'soluzione', file), 'utf8')

async function openExercise(panel, id) {
  if ((await panel.getByTestId('learn-exercise').count()) > 0) await panel.getByTestId('learn-back').click()
  await panel.locator(`[data-exercise="${id}"]`).click()
  await panel.getByTestId('learn-start').click()
}

/** Avvia la verifica e aspetta l'esito NUOVO (il contatore dei tentativi deve crescere). */
async function verdict(panel, expected) {
  const result = panel.getByTestId('learn-result')
  const before = Number((await result.getAttribute('data-attempts', { timeout: 300 }).catch(() => null)) ?? -1)
  await panel.getByTestId('learn-check').click()
  return until(async () => {
    const attempts = Number((await result.getAttribute('data-attempts', { timeout: 300 }).catch(() => null)) ?? -1)
    if (attempts <= before) return null
    return (await result.getAttribute('data-passed')) ?? null
  }, 20000).then((value) => (value === expected ? value : `${value}`))
}

async function editorShows(page, path, text) {
  return until(async () => {
    const lines = await page.locator(`[data-editor-path="${path}"] .view-lines`).first().innerText().catch(() => '')
    return lines.replace(/ /g, ' ').includes(text)
  }, 10000)
}

try {
  let page = await run.launch({ LAB_IDE_PICK_DIR: manual })
  await page.waitForSelector('.welcome', { timeout: 20000 })
  await page.getByTestId('welcome-courses').click()
  let panel = page.getByTestId('learn-panel')
  check('catalogo: corso incluso «primi passi»', !!(await until(async () => (await panel.locator('[data-course="primi-passi"]').count()) === 1, 10000)))
  await panel.locator('[data-course="primi-passi"]').click()
  check('corso: 4 lezioni con testo e riquadri', (await panel.locator('[data-lesson]').count()) === 4 && (await panel.locator('.callout-warn').count()) >= 1)
  await run.shot('01-corso')

  // 1. JavaScript: parto, verifico (fallisce con spiegazioni), suggerimento, soluzione, correggo, supero.
  await panel.locator('[data-exercise="media-allenamenti"]').click()
  await panel.getByTestId('learn-start').click()
  const jsFile = join(workDir, 'media-allenamenti', 'allenamenti.js')
  check('JS: cartella di lavoro creata e file aperto', !!(await until(async () => existsSync(jsFile) && (await page.locator('[data-editor-path="allenamenti.js"]').count()) > 0, 10000)))
  check('JS: il codice di partenza non supera la verifica', (await verdict(panel, 'false')) === 'false')
  check('JS: i controlli falliti sono spiegati', (await panel.locator('.learn-result li.ko').count()) >= 5, await panel.getByTestId('learn-result').innerText())
  await panel.getByTestId('learn-hint').click()
  check('suggerimento 1 di 3', (await panel.getByTestId('learn-hints').locator('li').count()) === 1 && (await panel.getByTestId('learn-hint').innerText()).includes('1/3'))
  await panel.getByTestId('learn-solution').click()
  check('soluzione sbloccata dopo un tentativo', (await panel.getByTestId('learn-solution-code').innerText()).includes('totaleMinuti(minuti) / minuti.length'))
  await run.shot('02-js-da-correggere')
  writeFileSync(jsFile, solution('media-allenamenti', 'allenamenti.js'))
  await editorShows(page, 'allenamenti.js', 'totale += m')
  check('JS: dopo la correzione l’esercizio è superato', (await verdict(panel, 'true')) === 'true')
  await run.shot('03-js-superato')

  // 2. TypeScript
  await openExercise(panel, 'prezzo-abbonamento')
  const tsFile = join(workDir, 'prezzo-abbonamento', 'abbonamento.ts')
  await until(() => existsSync(tsFile), 8000)
  writeFileSync(tsFile, solution('prezzo-abbonamento', 'abbonamento.ts'))
  await editorShows(page, 'abbonamento.ts', 'SCONTO[durata]')
  check('TS: superato (compilato con esbuild, tipi rimossi)', (await verdict(panel, 'true')) === 'true')

  // 3. HTML/CSS: regole su elementi e stili calcolati.
  await openExercise(panel, 'scheda-corso')
  const htmlDir = join(workDir, 'scheda-corso')
  await until(() => existsSync(join(htmlDir, 'index.html')), 8000)
  check('HTML: la pagina vuota non supera', (await verdict(panel, 'false')) === 'false')
  writeFileSync(join(htmlDir, 'index.html'), solution('scheda-corso', 'index.html'))
  writeFileSync(join(htmlDir, 'style.css'), solution('scheda-corso', 'style.css').replace('color: green', 'color: red'))
  await editorShows(page, 'index.html', 'Tappetino')
  check('HTML: colore sbagliato segnalato', (await verdict(panel, 'false')) === 'false' && (await panel.getByTestId('learn-result').innerText()).includes('atteso «green»'))
  writeFileSync(join(htmlDir, 'style.css'), solution('scheda-corso', 'style.css'))
  await page.waitForTimeout(600)
  check('HTML: superato con gli stili giusti', (await verdict(panel, 'true')) === 'true')
  await run.shot('04-html')

  // 4. SQL: risultato confrontato con la soluzione, ordine compreso.
  await openExercise(panel, 'clienti-attivi')
  const sqlFile = join(workDir, 'clienti-attivi', 'query.sql')
  await until(() => existsSync(sqlFile), 8000)
  writeFileSync(sqlFile, 'SELECT nome, scadenza FROM clienti WHERE attivo = 1;\n')
  await editorShows(page, 'query.sql', 'attivo = 1')
  check('SQL: ordine mancante segnalato', (await verdict(panel, 'false')) === 'false' && (await panel.getByTestId('learn-result').innerText()).includes('prima differenza'))
  writeFileSync(sqlFile, solution('clienti-attivi', 'query.sql'))
  await editorShows(page, 'query.sql', 'ORDER BY scadenza')
  check('SQL: superato', (await verdict(panel, 'true')) === 'true')
  await run.shot('05-sql')

  await panel.getByTestId('learn-back').click()
  check('progressi: 4 di 4 nel corso', (await panel.locator('.learn-progress').first().innerText()).includes('4 di 4'))
  check('progressi salvati su disco', Object.values(JSON.parse(readFileSync(join(run.work, 'userData', 'learn-progress.json'), 'utf8'))['primi-passi']).filter((p) => p.stato === 'superato').length === 4)

  // 5. Riavvio: i progressi restano.
  await run.app.close()
  page = await run.launch({ LAB_IDE_PICK_DIR: manual })
  await page.waitForSelector('.toolbar', { timeout: 20000 })
  await run.palette('Apri lezioni ed esercizi')
  panel = page.getByTestId('learn-panel')
  check('dopo il riavvio i progressi restano (4 di 4)', !!(await until(async () => (await panel.locator('[data-course="primi-passi"]').innerText().catch(() => '')).includes('4 di 4'), 10000)))

  // 6. Importazione di un manuale della Collana.
  await panel.getByTestId('learn-import-manual').click()
  const card = panel.locator('[data-course="manuale-sql-da-zero"]')
  check('manuale importato: 2 lezioni, 3 esercizi', !!(await until(async () => (await card.innerText().catch(() => '')).includes('2 lezioni · 3 esercizi'), 10000)))
  await card.click()
  await panel.locator('[data-lesson="cap02"] > summary').click()
  await panel.locator('[data-exercise="cap02-es1"]').click()
  await panel.getByTestId('learn-start').click()
  await until(async () => (await page.locator('[data-editor-path="query.sql"]').count()) > 0, 10000)
  await panel.getByTestId('learn-done').click()
  await panel.getByTestId('learn-back').click()
  check('esercizio del manuale segnato come fatto', (await panel.locator('.learn-progress').first().innerText()).includes('1 di 3'))
  await run.shot('06-manuale')

  // 7. Tutor AI: l'assistente si apre con la richiesta (se Ollama è disponibile parte la risposta).
  await panel.locator('[data-lesson="cap02"] > summary').click()
  await panel.locator('[data-exercise="cap02-es1"]').click()
  await panel.getByTestId('learn-tutor').click()
  check('tutor: si apre l’assistente', !!(await until(async () => (await page.getByTestId('ai-messages').count()) > 0, 8000)))
  await run.shot('07-tutor')

  check('nessun errore JavaScript nella finestra', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
