// Funzioni comuni dei collaudi end-to-end (avvio dell'app, attese, progetti, letture di pannelli).
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repo = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const electronExe = join(repo, 'node_modules', 'electron', 'dist', 'electron.exe')
// LAB_IDE_EXE=<percorso dell'exe pacchettizzato> collauda l'app installata invece di out/.
const packagedExe = process.env.LAB_IDE_EXE ? resolve(process.env.LAB_IDE_EXE) : null
const shotsDir = process.env.LAB_IDE_SHOTS ? resolve(process.env.LAB_IDE_SHOTS) : null

export function ensureBuilt() {
  if (!packagedExe && !existsSync(join(repo, 'out', 'main', 'index.js'))) {
    console.error('Manca out/: esegui prima `npm run build`.')
    process.exit(2)
  }
  if (shotsDir) mkdirSync(shotsDir, { recursive: true })
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms))

export async function until(fn, timeout = 10000, step = 150) {
  const start = Date.now()
  let last
  while (Date.now() - start < timeout) {
    try {
      last = await fn()
      if (last) return last
    } catch {
      /* riprova */
    }
    await wait(step)
  }
  return last
}

/** Contesto di un collaudo: cartella temporanea, controlli, avvio dell'app. */
export function createRun(name) {
  const work = mkdtempSync(join(tmpdir(), `lab-ide-${name}-`))
  const projects = join(work, 'progetti')
  mkdirSync(projects)
  const failures = []
  const issues = []
  const run = {
    work,
    projects,
    app: null,
    page: null,
    issues,
    check(label, ok, detail = '') {
      console.log(`${ok ? 'OK ' : 'KO '} ${label}${detail ? ` — ${detail}` : ''}`)
      if (!ok) failures.push(label)
    },
    async launch(extraEnv = {}) {
      run.app = await electron.launch({
        executablePath: packagedExe ?? electronExe,
        args: packagedExe ? [] : ['.'],
        cwd: repo,
        env: { ...process.env, LAB_IDE_USER_DATA: join(work, 'userData'), ...extraEnv }
      })
      run.page = await run.app.firstWindow()
      // Gli errori voluti dentro l'anteprima (errore di compilazione) non contano.
      run.page.on('pageerror', (e) => {
        if (!e.message.includes('[errore di compilazione]')) issues.push('pageerror: ' + e.message)
      })
      run.page.on('console', (m) => {
        if (m.type() === 'error' && !/Autofill|DevTools|Electron Security Warning/.test(m.text())) {
          issues.push('console: ' + m.text())
          if (process.env.LAB_IDE_DEBUG) console.log('   !! ' + m.text().slice(0, 120))
        }
      })
      await run.page.setViewportSize({ width: 1500, height: 920 })
      return run.page
    },
    async shot(label) {
      if (shotsDir && run.page) await run.page.screenshot({ path: join(shotsDir, `${name}-${label}.png`) })
    },
    async newProject(template, projectName) {
      const page = run.page
      await page.keyboard.press('Control+Shift+N')
      await page.locator(`[data-template="${template}"]`).click()
      await page.getByTestId('project-name').fill(projectName)
      await page.getByTestId('project-location').fill(projects)
      await page.getByTestId('create-project').click()
      await page.locator('.dialog').waitFor({ state: 'detached', timeout: 10000 })
      return join(projects, projectName)
    },
    /** Esegue un comando dalla palette scrivendone il titolo. */
    async palette(title) {
      const page = run.page
      await page.keyboard.press('Control+Shift+P')
      await page.locator('.palette input').fill(title)
      await page.keyboard.press('Enter')
    },
    async finish() {
      await run.app?.close().catch(() => undefined)
      try {
        rmSync(work, { recursive: true, force: true })
      } catch {
        /* processi ancora in chiusura */
      }
      console.log(failures.length ? `\n${failures.length} controlli falliti` : '\nTutti i controlli superati')
      process.exit(failures.length ? 1 : 0)
    },
    fail(error) {
      failures.push('eccezione: ' + error.message)
      console.error(error)
    }
  }
  return run
}

export const consoleText = (page) => page.getByTestId('console-list').innerText()

/** Testo delle righe visibili del terminale attivo. */
export async function terminalText(page) {
  const hosts = page.locator('.terminal-host')
  const count = await hosts.count()
  for (let i = 0; i < count; i++) {
    if (await hosts.nth(i).isVisible()) return hosts.nth(i).locator('.xterm-rows').innerText()
  }
  return ''
}

export const problemCount = async (page) => Number((await page.getByTestId('status-problems').innerText()).trim().split(/\s+/)[0])
