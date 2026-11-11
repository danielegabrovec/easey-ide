// Collaudo end-to-end di F2 (SQL Lab) sull'app costruita.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRun, ensureBuilt, until } from './helpers.mjs'

ensureBuilt()
const run = createRun('sql')
const { check } = run

const sqlTerminalText = (page) => page.getByTestId('sql-terminal').locator('.xterm-rows').innerText()

async function terminalCommand(page, command, expect, timeout = 15000) {
  await page.getByTestId('sql-terminal').click()
  await page.keyboard.type(command)
  await page.keyboard.press('Enter')
  return until(async () => {
    const text = await sqlTerminalText(page)
    return typeof expect === 'string' ? text.includes(expect) && text : expect.test(text) && text
  }, timeout)
}

const ollamaUp = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) })
  .then((r) => r.ok)
  .catch(() => false)

try {
  const page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })
  const root = await run.newProject('empty', 'Laboratorio SQL')

  // 1. Database d'esempio
  await page.keyboard.press('Control+Shift+D')
  await page.getByTestId('db-new').click()
  await page.locator('[data-engine="sqlite"]').click()
  await page.getByTestId('db-name').fill('negozio')
  await page.getByTestId('db-sample').selectOption('negozio')
  await page.getByTestId('db-create').click()
  const tables = await until(async () => (await page.locator('[data-db-table]').count()) === 4, 15000)
  check('database d’esempio SQLite creato con 4 tabelle', !!tables && existsSync(join(root, 'database', 'negozio.db')))
  await run.shot('01-database')

  // 2. Designer: nuova tabella
  await page.getByTestId('db-new-table').click()
  await page.getByTestId('designer-name').fill('fornitori')
  await page.getByTestId('designer-row').nth(1).locator('input').first().fill('nome')
  const ddl = await page.getByTestId('designer-ddl').innerText()
  check('designer: anteprima DDL', ddl.includes('CREATE TABLE fornitori') && ddl.includes('id INTEGER PRIMARY KEY AUTOINCREMENT'), ddl)
  await run.shot('02-designer')
  await page.getByTestId('designer-create').click()
  check('designer: tabella creata e visibile nell’albero', !!(await until(async () => (await page.locator('[data-db-table="fornitori"]').count()) === 1, 10000)))

  // 3. Terminale SQL
  await page.getByTestId('db-terminal').click()
  await until(async () => (await sqlTerminalText(page)).includes('sqlite>'), 10000)
  check('terminale SQL: INSERT', !!(await terminalCommand(page, "INSERT INTO fornitori (nome) VALUES ('Carta Srl');", 'OK, 1 riga modificata')))
  check('terminale SQL: .tables', !!(await terminalCommand(page, '.tables', /clienti\s+fornitori/)))
  check('terminale SQL: SELECT su più righe', !!(await (async () => {
    await page.keyboard.type('SELECT nome')
    await page.keyboard.press('Enter')
    return terminalCommand(page, 'FROM fornitori;', /Carta Srl[\s\S]*\(1 riga\)/)
  })()))
  await run.shot('03-terminale-sql')

  // 4. Costruttore visuale: JOIN automatica dalla chiave esterna
  await page.getByTestId('db-builder').click()
  await page.getByTestId('qb-add-table').selectOption('clienti')
  await page.getByTestId('qb-add-table').selectOption('ordini')
  await page.locator('[data-qb-column="clienti.nome"] input').click()
  await page.getByRole('button', { name: 'COUNT(*)' }).click()
  const expectedSql = 'SELECT clienti.nome, COUNT(*) AS quanti\nFROM clienti\n  JOIN ordini ON clienti.id = ordini.cliente_id\nGROUP BY clienti.nome;'
  const builderSql = await until(async () => (await page.getByTestId('qb-sql').innerText()).trim() === expectedSql, 8000)
  check('costruttore: JOIN dalla chiave esterna e SQL atteso', !!builderSql, await page.getByTestId('qb-sql').innerText())
  await page.getByTestId('qb-run').click()
  const grid = await until(async () => {
    const text = await page.getByTestId('sql-grid').innerText()
    return text.includes('Anna Rossi') && /Anna Rossi\s+2/.test(text) ? text : null
  }, 10000)
  check('costruttore: esecuzione e risultati (Anna Rossi, 2 ordini)', !!grid)
  await run.shot('04-costruttore')

  // 4b. Diagramma ER: una scheda per tabella e le frecce delle chiavi esterne
  await run.palette('Diagramma ER del database')
  const er = await until(async () => (await page.locator('[data-er-table]').count()) === 5 && (await page.locator('.react-flow__edge').count()) === 3, 10000)
  check('diagramma ER: 5 tabelle e le relazioni', !!er)
  await run.shot('04b-er')

  // 5. File .sql con Ctrl+Invio
  await run.palette('Nuova query SQL')
  const editor = page.locator('[data-editor-path^="query/query-"] .view-lines')
  await editor.waitFor({ timeout: 10000 })
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Control+Enter')
  check('file .sql: Ctrl+Invio esegue l’istruzione', !!(await until(async () => (await page.getByTestId('sql-rowcount').innerText()).startsWith('5 righe'), 10000)))

  // 6. Piano di esecuzione
  await page.keyboard.press('Control+Alt+E')
  check('EXPLAIN: piano con scansione completa', !!(await until(async () => (await page.getByTestId('sql-plan').innerText()).includes('scansione completa'), 10000)))
  await run.shot('05-piano')

  // 7. Istantanea e ripristino
  await page.locator('.dv-tab', { hasText: 'Database' }).click()
  await page.getByTestId('db-snapshot').click()
  await until(async () => (await page.getByText('Istantanea salvata.').count()) > 0, 10000)
  await page.locator('.dv-tab', { hasText: 'Terminale SQL' }).click()
  await terminalCommand(page, 'DELETE FROM fornitori;', 'OK, 1 riga modificata')
  await page.locator('.dv-tab', { hasText: 'Database' }).click()
  await page.getByRole('button', { name: 'Ripristina' }).click()
  await page.locator('.dialog .history-list button').first().click()
  await page.locator('.dialog footer .btn.danger').click()
  await until(async () => (await page.getByText('Database ripristinato.').count()) > 0, 10000)
  await page.locator('.dv-tab', { hasText: 'Terminale SQL' }).click()
  check('sandbox: istantanea e ripristino riportano i dati', !!(await terminalCommand(page, 'SELECT COUNT(*) AS n FROM fornitori;', /│\s+1\s+│/)))

  // 8. PostgreSQL incorporato
  await page.locator('.dv-tab', { hasText: 'Database' }).click()
  await page.getByTestId('db-new').click()
  await page.locator('[data-engine="postgres"]').click()
  await page.getByTestId('db-name').fill('scuola')
  await page.getByTestId('db-sample').selectOption('scuola')
  await page.getByTestId('db-create').click()
  check('PostgreSQL: database creato (3 tabelle)', !!(await until(async () => (await page.locator('[data-db-table]').count()) === 3, 60000)))
  await page.locator('.dv-tab', { hasText: 'Terminale SQL' }).click()
  await until(async () => (await sqlTerminalText(page)).includes('scuola=>'), 10000)
  check('PostgreSQL: \\dt e query', !!(await terminalCommand(page, '\\dt', /materie\s+studenti\s+voti/)) && !!(await terminalCommand(page, 'SELECT COUNT(*) AS n FROM voti;', /│\s+8\s+│/)))
  await run.shot('06-postgres')

  // 9. Clic su un .db nell'albero → database, non editor
  await page.locator('.dv-tab', { hasText: 'Esplora' }).click()
  await page.locator('[data-path="database"]').click()
  await page.locator('[data-path="database/negozio.db"]').click()
  const switched = await until(async () => (await page.getByTestId('db-select').inputValue()) === 'sqlite:database/negozio.db', 8000)
  check('albero: un .db apre il database (non l’editor)', !!switched && (await page.locator('[data-editor-path="database/negozio.db"]').count()) === 0)

  // 10. SQL da linguaggio naturale (solo con Ollama)
  if (ollamaUp) {
    await page.getByTestId('sql-nl').fill('il numero di prodotti per ogni categoria')
    await page.getByTestId('sql-nl').press('Enter')
    const generated = await until(async () => {
      const text = await page.locator('[data-editor-path^="query/query-"]').last().innerText().catch(() => '')
      // La risposta del modello varia: basta che conti per categoria.
      return /COUNT\s*\(/i.test(text) && /categoria/i.test(text) ? text : null
    }, 180000, 1000)
    check('AI: SQL generato da una descrizione in italiano', !!generated)
    await run.shot('07-ai-sql')
  } else {
    console.log('—   AI: Ollama non disponibile, scenario saltato')
  }

  check('nessun errore JavaScript nella finestra', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
