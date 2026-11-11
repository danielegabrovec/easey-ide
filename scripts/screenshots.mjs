// Screenshot per il README: avvia l'app costruita (out/) con dati isolati, prepara le scene e le
// fotografa in docs/screenshots/. Serve `npm run build`; per la scena dell'AI serve Ollama avviato.
// Uso: node scripts/screenshots.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRun, ensureBuilt, repo, until } from '../tests/e2e/helpers.mjs'

ensureBuilt()
const out = join(repo, 'docs', 'screenshots')
mkdirSync(out, { recursive: true })
const run = createRun('screenshot')
const page = await run.launch()
await page.setViewportSize({ width: 1600, height: 960 })
const shot = async (name) => {
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(out, `${name}.png`) })
  console.log('📸', name)
}
const quickOpen = async (name) => {
  await page.keyboard.press('Control+P')
  await page.locator('.palette input').fill(name)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
}
const scene = async (name, body) => {
  try {
    await body()
  } catch (error) {
    console.log(`⚠️  ${name}: ${error.message.split('\n')[0]}`)
  }
}

try {
  await page.waitForSelector('.welcome', { timeout: 20000 })
  await scene('benvenuto', () => shot('01-benvenuto'))

  // Editor + anteprima dal vivo con la console.
  await scene('editor', async () => {
    await run.newProject('web-ts', 'Contatore')
    await page.keyboard.press('F5')
    const frame = page.frameLocator('[data-testid="preview-frame"]')
    await until(async () => (await frame.locator('button').count()) > 0, 15000)
    for (let i = 0; i < 3; i++) await frame.locator('button').first().click()
    await shot('02-editor-anteprima')
  })

  // Passo passo.
  await scene('passo-passo', async () => {
    const root = join(run.projects, 'Contatore')
    writeFileSync(
      join(root, 'src', 'somma.ts'),
      ['function somma(numeri: number[]): number {', '  let totale = 0', '  for (const n of numeri) {', '    totale += n', '  }', '  return totale', '}', '', 'const voti = [7, 8, 6]', 'const risultato = somma(voti)', 'console.log(`Somma: ${risultato}`)', ''].join('\n')
    )
    await page.waitForTimeout(800)
    await quickOpen('somma.ts')
    await run.palette('Esegui passo passo')
    await until(async () => (await page.getByTestId('trace-counter').innerText().catch(() => '')).startsWith('Passo 1'), 15000)
    for (let i = 0; i < 5; i++) await page.getByTestId('trace-next').click()
    await shot('03-passo-passo')
  })

  // Designer stile Canva/Wix.
  await scene('designer', async () => {
    await run.newProject('web-designer', 'Palestra')
    await page.getByTestId('open-designer').click()
    await page.frameLocator('[data-testid="designer-frame"]').locator('body').waitFor({ timeout: 15000 })
    await page.waitForTimeout(1500)
    await shot('04-designer')
  })

  // SQL Lab: database d'esempio, query con JOIN e risultati, diagramma ER.
  await scene('sql', async () => {
    const root = await run.newProject('empty', 'Negozio')
    await page.keyboard.press('Control+Shift+D')
    await page.getByTestId('db-new').click()
    await page.locator('[data-engine="sqlite"]').click()
    await page.getByTestId('db-name').fill('negozio')
    await page.getByTestId('db-sample').selectOption('negozio')
    await page.getByTestId('db-create').click()
    await until(async () => (await page.locator('[data-db-table]').count()) === 4, 15000)
    writeFileSync(join(root, 'clienti.sql'), '-- Quanti ordini ha fatto ogni cliente\nSELECT clienti.nome, COUNT(*) AS ordini\nFROM clienti\n  JOIN ordini ON ordini.cliente_id = clienti.id\nGROUP BY clienti.nome\nORDER BY ordini DESC;\n')
    await page.waitForTimeout(800)
    await quickOpen('clienti.sql')
    await page.locator('[data-editor-path="clienti.sql"] .view-lines').click()
    await page.keyboard.press('Control+Enter')
    await page.waitForTimeout(1500)
    await shot('05-sql-lab')
    await run.palette('Diagramma ER del database')
    await page.waitForTimeout(2000)
    await shot('06-diagramma-er')
  })

  // Programmazione a blocchi.
  await scene('blocchi', async () => {
    await run.newProject('web-js', 'Blocchi')
    await run.palette('Nuovo programma a blocchi')
    await page.locator('.dialog input').press('Enter')
    await page.waitForTimeout(2500)
    await shot('07-blocchi')
  })

  // Diagramma di flusso che diventa codice.
  await scene('diagrammi', async () => {
    await run.palette('Nuovo diagramma')
    await page.locator('[data-diagram-type="flowchart"]').click()
    await page.getByTestId('diagram-name').fill('somma')
    await page.getByTestId('diagram-create').click()
    await page.locator('[data-testid="diagram-editor"]').last().waitFor({ timeout: 10000 })
    await page.waitForTimeout(1500)
    await shot('08-diagrammi')
  })

  // Lezioni con verifica automatica.
  await scene('lezioni', async () => {
    await run.palette('Apri lezioni ed esercizi')
    const panel = page.getByTestId('learn-panel')
    await panel.locator('[data-course="primi-passi"]').click()
    await panel.locator('[data-exercise="media-allenamenti"]').click()
    await panel.getByTestId('learn-start').click()
    await page.waitForTimeout(1500)
    await panel.getByTestId('learn-check').click()
    await until(async () => (await panel.getByTestId('learn-result').count()) > 0, 15000)
    await panel.getByTestId('learn-hint').click()
    await shot('09-lezioni')
  })

  // Git integrato.
  await scene('git', async () => {
    await run.palette('Mostra Git')
    const git = page.getByTestId('git-panel')
    await git.getByTestId('git-init').click()
    await until(async () => (await git.getByTestId('git-branch').count()) > 0, 10000)
    await git.getByTestId('git-message').fill('Prima versione')
    await git.getByTestId('git-commit').click()
    await until(async () => (await git.getByTestId('git-log').innerText().catch(() => '')).includes('Prima versione'), 10000)
    const root = join(run.work, 'userData', 'Corsi', 'primi-passi', 'media-allenamenti')
    writeFileSync(join(root, 'allenamenti.js'), "// Minuti di allenamento di un cliente: somma e media.\n\nfunction totaleMinuti(minuti) {\n  let totale = 0\n  for (const m of minuti) totale += m\n  return totale\n}\n\nfunction mediaMinuti(minuti) {\n  // scrivi qui\n}\n\nconsole.log('Media della settimana:', mediaMinuti([30, 45, 60, 45]))\n")
    await until(async () => (await git.locator('[data-git-file="allenamenti.js"]').count()) > 0, 10000)
    await git.locator('[data-git-file="allenamenti.js"]').click()
    await page.waitForTimeout(2000)
    await shot('10-git')
  })

  // Assistente AI locale (serve Ollama): spiegazione di una funzione.
  await scene('ai', async () => {
    await quickOpen('allenamenti.js')
    await page.locator('[data-editor-path="allenamenti.js"] .view-lines').click()
    await run.palette('Spiega questo codice')
    const answered = await until(async () => (await page.getByTestId('ai-answer').last().getAttribute('data-pending').catch(() => 'true')) === 'false', 180000, 1000)
    if (!answered) throw new Error('nessuna risposta dall’AI (Ollama avviato?)')
    await shot('11-assistente-ai')
  })

  // Informazioni e note legali.
  await scene('informazioni', async () => {
    await run.palette('Informazioni')
    await page.getByTestId('about-author').waitFor()
    await shot('12-informazioni')
  })
} finally {
  await run.finish()
}
