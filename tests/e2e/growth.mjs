// Collaudo end-to-end di F7 (crescita): esecuzione passo-passo, Git, esportazione ZIP/HTML unico,
// fornitore AI compatibile OpenAI (server finto locale, come LM Studio).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { createRun, ensureBuilt, until } from './helpers.mjs'

ensureBuilt()
const run = createRun('crescita')
const { check } = run
const saveDir = join(run.work, 'esportati')
mkdirSync(saveDir)

// Server finto compatibile OpenAI (LM Studio): elenco modelli e chat in streaming SSE.
const fake = createServer(async (req, res) => {
  for await (const _ of req) void _
  if (req.url === '/v1/models') {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ data: [{ id: 'modello-finto-chat' }] }))
  } else if (req.url === '/v1/chat/completions') {
    res.setHeader('Content-Type', 'text/event-stream')
    for (const piece of ['Ciao ', 'dal server ', 'compatibile OpenAI!']) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`)
    res.end('data: [DONE]\n\n')
  } else {
    res.statusCode = 404
    res.end()
  }
})
await new Promise((resolve) => fake.listen(0, '127.0.0.1', resolve))
const fakeUrl = `http://127.0.0.1:${fake.address().port}/v1`

let gitAvailable = true
try {
  execFileSync('git', ['--version'])
} catch {
  gitAvailable = false
}

try {
  const page = await run.launch({ LAB_IDE_SAVE_DIR: saveDir })
  await page.waitForSelector('.welcome', { timeout: 20000 })
  const root = await run.newProject('console-js', 'Crescita')

  // 1. Esecuzione passo-passo
  writeFileSync(
    join(root, 'conta.js'),
    ['function somma(n) {', '  let totale = 0', '  for (let i = 1; i <= n; i++) {', '    totale += i', '  }', '  return totale', '}', 'const risultato = somma(3)', 'console.log("Risultato:", risultato)', ''].join('\n')
  )
  await page.waitForTimeout(700)
  await page.keyboard.press('Control+P')
  await page.locator('.palette input').fill('conta')
  await page.keyboard.press('Enter')
  await page.locator('[data-editor-path="conta.js"] .view-lines').click()
  await run.palette('Esegui passo passo')
  const panel = page.getByTestId('trace-panel')
  const counter = page.getByTestId('trace-counter')
  check('passo passo: 8 passi, si parte dalla riga 8', !!(await until(async () => (await counter.innerText().catch(() => '')) === 'Passo 1 di 8 · riga 8', 15000)), await counter.innerText().catch(() => ''))
  check('passo passo: riga evidenziata nell’editor', (await page.locator('[data-editor-path="conta.js"] .trace-line').count()) > 0)
  for (let i = 0; i < 5; i++) await page.getByTestId('trace-next').click()
  check('passo passo: dentro somma() al terzo giro del ciclo', (await counter.innerText()) === 'Passo 6 di 8 · riga 4')
  const frame = panel.locator('[data-frame="somma"]')
  check('pila: chiamata somma() con le sue variabili', (await frame.locator('[data-var="totale"] .trace-value').innerText()) === '3' && (await frame.locator('[data-var="i"] .trace-value').innerText()) === '3')
  check('variabile appena cambiata evidenziata', (await frame.locator('[data-var="totale"].changed').count()) === 1)
  await page.getByTestId('trace-prev').click()
  check('passo indietro', (await counter.innerText()) === 'Passo 5 di 8 · riga 4')
  await page.getByTestId('trace-last').click()
  check('ultimo passo: output e variabile globale', (await page.getByTestId('trace-output').innerText()).includes('Risultato: 6') && (await panel.locator('[data-frame="Globale"] [data-var="risultato"] .trace-value').innerText()) === '6')
  await run.shot('01-passo-passo')

  // 2. Git
  if (gitAvailable) {
    await run.palette('Mostra Git')
    const git = page.getByTestId('git-panel')
    await git.getByTestId('git-init').click()
    check('git: repository inizializzato sul ramo main', !!(await until(async () => (await git.getByTestId('git-branch').innerText().catch(() => '')) === 'main', 10000)))
    check('git: file nuovi elencati', !!(await until(async () => (await git.locator('[data-git-file="conta.js"]').count()) === 1, 8000)))
    await git.getByTestId('git-message').fill('Primo commit da Easey')
    await git.getByTestId('git-commit').click()
    check('git: commit nella cronologia', !!(await until(async () => (await git.getByTestId('git-log').innerText().catch(() => '')).includes('Primo commit da Easey'), 10000)))
    writeFileSync(join(root, 'conta.js'), readFileSync(join(root, 'conta.js'), 'utf8').replace('somma(3)', 'somma(10)'))
    check('git: modifica rilevata (M)', !!(await until(async () => (await git.locator('[data-git-file="conta.js"]').innerText().catch(() => '')).startsWith('M'), 10000)))
    check('barra di stato: ramo e modifiche', !!(await until(async () => (await page.locator('[data-status-item="git"]').innerText().catch(() => '')) === '⎇ main · 1', 8000)))
    await git.locator('[data-git-file="conta.js"]').click()
    check('git: differenze affiancate', !!(await until(async () => (await page.locator('[data-testid="git-diff"] .monaco-diff-editor').count()) > 0 && (await page.locator('[data-testid="git-diff"] .editor.modified .view-lines').innerText().catch(() => '')).replace(/ /g, ' ').includes('somma(10)'), 10000)))
    await run.shot('02-git')
  } else {
    check('git non installato: verifica saltata', true)
  }

  // 3. Esportazione
  writeFileSync(join(root, 'index.html'), '<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body><h1>Esportata</h1><script type="module" src="app.ts"></script></body></html>')
  writeFileSync(join(root, 'style.css'), 'h1 { color: teal }')
  writeFileSync(join(root, 'app.ts'), 'const titolo: string = "ok"\ndocument.title = titolo\n')
  await page.waitForTimeout(500)
  await run.palette('Esporta il progetto come ZIP')
  const zipPath = join(saveDir, 'Crescita.zip')
  check('ZIP esportato e valido', !!(await until(() => existsSync(zipPath) && readFileSync(zipPath).subarray(0, 2).toString() === 'PK', 10000)))
  if (process.platform === 'win32') {
    const listing = execFileSync(join(process.env.SystemRoot ?? 'C:\Windows', 'System32', 'tar.exe'), ['-tf', zipPath]).toString()
    check('ZIP: contiene i file del progetto (letto da tar di Windows)', listing.includes('Crescita/conta.js') && listing.includes('Crescita/app.ts') && !listing.includes('.git/'), listing.split('\n').slice(0, 6).join(', '))
  }
  await run.palette('Esporta come pagina HTML unica')
  const htmlPath = join(saveDir, 'Crescita.html')
  const single = await until(() => (existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8') : null), 10000)
  check('HTML unico: CSS e TypeScript incorporati', !!single && single.includes('h1 { color: teal }') && single.includes('document.title = titolo') && !single.includes('src="app.ts"'))

  // 4. Fornitore AI compatibile OpenAI
  await run.palette('Impostazioni')
  await page.getByTestId('ai-provider').selectOption('openai')
  await page.getByTestId('ai-endpoint').fill(fakeUrl)
  await page.getByTestId('ai-test').click()
  await page.waitForTimeout(1500)
  await run.shot('03a-impostazioni-ai')
  check('AI: server compatibile OpenAI collegato', !!(await until(async () => (await page.locator('body').innerText().catch(() => '')).includes('Collegato (OpenAI API): 1 modelli'), 10000)))
  await page.keyboard.press('Escape')
  await run.palette('Apri l’assistente AI')
  await page.getByTestId('ai-input').fill('Ciao!')
  await page.getByTestId('ai-send').click()
  check('AI: risposta in streaming dal server compatibile', !!(await until(async () => (await page.getByTestId('ai-answer').last().innerText().catch(() => '')).includes('Ciao dal server compatibile OpenAI!'), 10000)))
  await run.shot('03-ai-openai')

  check('nessun errore JavaScript nella finestra', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  fake.close()
  await run.finish()
}
