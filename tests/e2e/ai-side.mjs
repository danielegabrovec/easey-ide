// Collaudo end-to-end della chat AI nel pannello laterale destro (standard «Pannello AI laterale»), con
// un fornitore finto compatibile Ollama (niente Ollama vero: risposte prevedibili e nessuna contesa).
//  1. chiuso all'avvio, «✦ AI» lo riapre; Ctrl+Alt+B apre e chiude; <aside> accessibile
//  2. maniglia: trascinamento, frecce da tastiera, limiti; ⤢ e doppio clic alternano scelta/70 %
//  3. Ctrl+Shift+A mette il fuoco nella casella, Esc torna all'editor
//  4. chip del documento dal vivo (file, «selezione righe 2-3», ×), chip «Problemi»
//  5. domanda sulla selezione → blocco di codice → Applica → confronto → file corretto
//  6. comandi «/» con la tendina; avviso se il file è cambiato dopo l'invio
//  7. stato (aperto, larghezza) ricordato dopo il riavvio
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { createRun, ensureBuilt, until } from './helpers.mjs'

ensureBuilt()
const run = createRun('ai-laterale')
const { check } = run

// Fornitore finto (API di Ollama): un modello, chat in streaming NDJSON. La risposta ricopia il primo
// blocco di codice della domanda correggendo «n * 3» in «n * 2».
const requests = []
const fake = createServer(async (req, res) => {
  let body = ''
  for await (const chunk of req) body += chunk
  res.setHeader('Content-Type', 'application/json')
  if (req.url === '/api/tags') {
    res.end(JSON.stringify({ models: [{ name: 'finto-chat:1b', details: { parameter_size: '1B', family: 'finto' }, capabilities: ['completion'] }] }))
  } else if (req.url === '/api/version') {
    res.end(JSON.stringify({ version: '0.0-finto' }))
  } else if (req.url === '/api/chat') {
    const data = JSON.parse(body)
    const last = data.messages[data.messages.length - 1].content
    requests.push(last)
    const code = /```[\w-]*\n([\s\S]*?)\n```/.exec(last)?.[1]
    const answer = code ? `Ecco la versione corretta:\n\n\`\`\`javascript\n${code.replace(/n \* 3/g, 'n * 2')}\n\`\`\`\n\nHo cambiato il 3 in 2.` : 'PRONTO'
    for (const piece of answer.match(/[\s\S]{1,12}/g)) res.write(JSON.stringify({ message: { role: 'assistant', content: piece }, done: false }) + '\n')
    res.end(JSON.stringify({ done: true }) + '\n')
  } else if (req.url === '/api/generate') {
    res.end(JSON.stringify({ response: '' }))
  } else {
    res.statusCode = 404
    res.end('{}')
  }
})
await new Promise((resolve) => fake.listen(0, '127.0.0.1', resolve))
const fakeUrl = `http://127.0.0.1:${fake.address().port}`
mkdirSync(join(run.work, 'userData'), { recursive: true })
writeFileSync(join(run.work, 'userData', 'settings.json'), JSON.stringify({ ai: { endpoint: fakeUrl } }))

const aside = (page) => page.getByRole('complementary', { name: 'Assistente AI' })
const asideWidth = async (page) => Math.round((await aside(page).boundingBox()).width)
const near = (a, b) => Math.abs(a - b) <= 2
const lastAnswerDone = (page) =>
  until(async () => {
    const last = page.getByTestId('ai-answer').last()
    return (await last.getAttribute('data-pending')) === 'false' ? last.innerText() : null
  }, 15000)
const focusedTestId = (page) => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '')
const focusInEditor = (page) => page.evaluate(() => !!document.activeElement?.closest('.monaco-editor'))

try {
  let page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })
  const root = await run.newProject('console-js', 'Laterale')
  writeFileSync(join(root, 'doppio.js'), '// doppio(n) deve restituire il doppio di n\nfunction doppio(n) {\n  return n * 3\n}\n\nconsole.log(doppio(2))\n')

  // 1. Apertura e chiusura
  check('chiuso all’avvio, con il pulsante «✦ AI» per aprirlo', (await aside(page).count()) === 0 && (await page.getByTestId('side-reopen').isVisible()))
  await page.getByTestId('side-reopen').click()
  check('«✦ AI» apre il pannello laterale (aside complementary «Assistente AI»)', await aside(page).isVisible())
  check('il pannello è fuori dalla griglia dei pannelli', (await page.locator('.dock-host [data-testid="side-panel"]').count()) === 0)
  await page.locator('[data-editor-path="main.js"] .view-lines').click()
  await page.keyboard.press('Control+Alt+B')
  check('Ctrl+Alt+B chiude il pannello', !!(await until(async () => (await aside(page).count()) === 0, 3000)))
  await page.keyboard.press('Control+Alt+B')
  check('Ctrl+Alt+B lo riapre', !!(await until(() => aside(page).isVisible(), 3000)))
  const rightEdge = await until(async () => {
    const b = await aside(page).boundingBox()
    return Math.abs(b.x + b.width - 1500) <= 1 ? b : null
  }, 3000)
  check('riaperto resta agganciato al bordo destro della finestra', !!rightEdge, JSON.stringify(await aside(page).boundingBox()))
  const statusReady = await until(async () => (await page.getByTestId('ai-model').count()) > 0, 10000)
  check('fornitore finto collegato: modello nella chat', !!statusReady)

  // 2. Larghezza
  const handle = page.getByTestId('side-resize')
  check('larghezza iniziale 400 px', near(await asideWidth(page), 400), String(await asideWidth(page)))
  const box = await handle.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 80, box.y + 200, { steps: 4 })
  await page.mouse.move(box.x + box.width / 2 - 150, box.y + 200, { steps: 4 })
  await page.mouse.up()
  check('trascinando la maniglia a sinistra si allarga (550 px)', near(await asideWidth(page), 550), String(await asideWidth(page)))
  check('la maniglia è un separator con aria-valuenow', (await handle.getAttribute('role')) === 'separator' && near(Number(await handle.getAttribute('aria-valuenow')), 550))
  await handle.focus()
  await page.keyboard.press('ArrowRight')
  check('freccia → dalla tastiera stringe di 20 px', near(await asideWidth(page), 530), String(await asideWidth(page)))
  const b2 = await handle.boundingBox()
  await page.mouse.move(b2.x + 3, b2.y + 200)
  await page.mouse.down()
  await page.mouse.move(b2.x + 3 + 900, b2.y + 200, { steps: 6 })
  await page.mouse.up()
  check('non scende sotto 300 px', near(await asideWidth(page), 300), String(await asideWidth(page)))
  await handle.focus()
  await page.keyboard.press('End')
  check('non supera il 70 % della finestra', near(await asideWidth(page), 1050), String(await asideWidth(page)))
  await page.mouse.move(b2.x + 3, b2.y + 200)
  // Torna a 530 per i passi successivi.
  for (let i = 0; i < 26; i++) await page.keyboard.press('ArrowRight')
  check('di nuovo 530 px', near(await asideWidth(page), 530), String(await asideWidth(page)))
  await page.getByTestId('ai-expand').click()
  check('⤢ allarga al 70 %', near(await asideWidth(page), 1050) && (await aside(page).getAttribute('data-expanded')) === 'true', String(await asideWidth(page)))
  await run.shot('01-espanso')
  await page.getByTestId('ai-expand').click()
  check('⤢ di nuovo torna alla larghezza scelta', near(await asideWidth(page), 530), String(await asideWidth(page)))
  await handle.dblclick()
  check('doppio clic sulla maniglia allarga', near(await asideWidth(page), 1050), String(await asideWidth(page)))
  await handle.dblclick()
  check('doppio clic di nuovo riduce', near(await asideWidth(page), 530), String(await asideWidth(page)))

  // 3. Fuoco
  await page.locator('[data-editor-path="main.js"] .view-lines').click()
  await page.keyboard.press('Control+Shift+A')
  check('Ctrl+Shift+A mette il fuoco nella casella', !!(await until(async () => (await focusedTestId(page)) === 'ai-input', 3000)))
  await page.keyboard.press('Escape')
  check('Esc nella casella torna all’editor', !!(await until(() => focusInEditor(page), 3000)))

  // 4. Chip del documento
  await until(async () => (await page.locator('[data-path="doppio.js"]').count()) > 0, 8000)
  await page.locator('[data-path="doppio.js"]').click()
  const chip = page.getByTestId('ai-chip-file')
  check('chip: file aperto, intero', !!(await until(async () => (await chip.innerText()).includes('doppio.js · file intero'), 5000)), await chip.innerText())
  await page.locator('[data-editor-path="doppio.js"] .view-lines').click()
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Shift+ArrowDown')
  // Righe intere 2-3: la selezione finisce all'inizio della riga 4, che non conta.
  check('chip dal vivo: «selezione righe 2-3»', !!(await until(async () => (await chip.innerText()).includes('selezione righe 2-3'), 3000)), await chip.innerText())
  await page.getByTestId('ai-chip-file-remove').click()
  check('× stacca il documento', (await page.getByTestId('ai-chip-file-add').count()) === 1)
  await page.getByTestId('ai-chip-file-add').click()
  check('＋ lo riallega', (await chip.count()) === 1)

  // 5. Domanda sulla selezione e «Applica al documento»
  await page.getByTestId('ai-input').fill('Correggi questa funzione')
  await page.getByTestId('ai-send').click()
  const answer = await lastAnswerDone(page)
  check('risposta dal fornitore finto', !!answer && answer.includes('n * 2'), answer?.slice(0, 80))
  const sent = requests[requests.length - 1] ?? ''
  check('inviati la domanda e solo la selezione', sent.startsWith('Correggi questa funzione') && sent.includes('Codice selezionato in doppio.js') && sent.includes('return n * 3') && !sent.includes('console.log'), sent.slice(0, 160))
  const block = page.getByTestId('ai-answer').last()
  check('il blocco ha Copia, Inserisci e Applica', (await block.getByTestId('ai-copy').count()) === 1 && (await block.getByTestId('ai-insert').count()) === 1 && (await block.getByTestId('ai-apply').count()) === 1)
  await block.getByTestId('ai-apply').click()
  await page.getByTestId('ai-apply-confirm').waitFor({ timeout: 5000 })
  check('confronto prima/dopo senza avvisi (file invariato)', (await page.getByTestId('ai-diff-warning').count()) === 0)
  await run.shot('02-confronto')
  await page.getByTestId('ai-apply-confirm').click()
  const fixed = await until(() => {
    const text = readFileSync(join(root, 'doppio.js'), 'utf8')
    return text.includes('return n * 2') && !text.includes('n * 3') && text.includes('console.log(doppio(2))') ? text : null
  }, 8000)
  check('blocco applicato alla selezione e salvato, resto del file intatto', !!fixed, readFileSync(join(root, 'doppio.js'), 'utf8'))

  // 6. Comandi «/»
  const input = page.getByTestId('ai-input')
  await input.click()
  await input.fill('')
  await page.keyboard.type('/')
  const menu = page.getByTestId('ai-slash-menu')
  check('«/» apre la tendina dei comandi (5)', (await until(async () => (await menu.locator('[role="option"]').count()) === 5, 3000)) === true)
  await page.keyboard.type('co')
  check('la tendina filtra mentre si scrive (/co → 2)', (await menu.locator('[role="option"]').count()) === 2 && (await menu.innerText()).includes('/correggi'))
  await page.keyboard.press('Enter')
  check('Invio sceglie il comando', (await input.inputValue()) === '/correggi ' && (await menu.count()) === 0, await input.inputValue())
  const before = requests.length
  await page.keyboard.press('Enter')
  const slashAnswer = await until(async () => requests.length > before && (await lastAnswerDone(page)), 15000)
  check('/correggi usa l’azione rapida «Proponi una correzione»', !!slashAnswer && requests[requests.length - 1].includes('Correggi gli errori e migliora questo codice'), requests[requests.length - 1]?.slice(0, 80))
  check('/correggi: messaggio con il nome dell’azione', (await page.locator('.ai-msg.user .ai-bubble').last().innerText()).includes('Proponi una correzione'))

  // File cambiato dopo l'invio: «Applica» lo dice nel confronto.
  await page.locator('[data-editor-path="doppio.js"] .view-lines').click()
  await page.keyboard.press('Control+Home')
  await page.keyboard.type('// riga aggiunta dopo l’invio\n')
  await page.getByTestId('ai-answer').last().getByTestId('ai-apply').click()
  await page.getByTestId('ai-apply-confirm').waitFor({ timeout: 5000 })
  check('file cambiato dopo l’invio: il confronto lo segnala', !!(await until(async () => (await page.getByTestId('ai-diff-warning').count()) === 1, 3000)))
  await run.shot('03-file-cambiato')
  await page.locator('.dialog').getByText('Annulla', { exact: true }).click()

  // Chip «Problemi» per un file con errori.
  writeFileSync(join(root, 'rotto.js'), 'const x = ;\n')
  await until(async () => (await page.locator('[data-path="rotto.js"]').count()) > 0, 8000)
  await page.locator('[data-path="rotto.js"]').click()
  check('chip «Problemi» quando il file ne ha', !!(await until(async () => (await page.getByTestId('ai-chip-problems').count()) === 1, 10000)))
  await run.shot('04-problemi')

  // 7. Stato ricordato dopo il riavvio
  check('nessun errore JavaScript nella finestra', run.issues.length === 0, run.issues.join(' | '))
  await run.app.close()
  page = await run.launch()
  await page.waitForSelector('.toolbar', { timeout: 20000 })
  check('dopo il riavvio il pannello è ancora aperto', !!(await until(() => aside(page).isVisible(), 10000)))
  check('dopo il riavvio la larghezza scelta è ricordata (530 px)', near(await asideWidth(page), 530), String(await asideWidth(page)))
  await run.shot('05-riavvio')
  check('nessun errore JavaScript dopo il riavvio', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  fake.close()
  await run.finish()
}
