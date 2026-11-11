// Processo principale: finestra, servizi nativi, IPC. Nessuna logica di interfaccia qui.
import { app, BrowserWindow, dialog, shell, type IpcMainInvokeEvent } from 'electron'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { broadcast, registerHandlers } from './ipc/router'
import { buildMenu } from './menu'
import { AiService } from './services/ai/ai-service'
import { OllamaProvider } from './services/ai/ollama-provider'
import { OpenAiCompatibleProvider } from './services/ai/openai-provider'
import { DbService } from './services/db/db-service'
import { LearnService } from './services/learn/learn-service'
import { traceFile } from './services/trace/tracer'
import { GitService } from './services/git/git-service'
import { exportSingleHtml, exportZip } from './services/export/export-service'
import { SAMPLE_DATABASES } from '@shared/sql/samples'
import { DEFAULT_SETTINGS } from '@shared/contracts/settings'
import { cpSync, existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { PreviewService, registerPreviewScheme } from './services/preview/preview-service'
import { SettingsService } from './services/settings/settings-service'
import { TerminalService } from './services/terminal/terminal-service'
import { HistoryService } from './services/workspace/history-service'
import { createFromTemplate, listTemplates } from './services/workspace/templates'
import { WorkspaceService } from './services/workspace/workspace-service'
import { QuickRunner } from './services/quick/quick-runner'
import { QuickSql } from './services/quick/quick-sql'
import { QuickStore } from './services/quick/snippet-store'

const APP_NAME = 'Easey IDE'
// Il main è un modulo ESM: __dirname non esiste.
const here = dirname(fileURLToPath(import.meta.url))
app.setName(APP_NAME)
if (process.platform === 'win32') app.setAppUserModelId('it.gabrovec.easey-ide')
// Nei test e2e i dati utente vivono in una cartella isolata.
const testUserData = process.env['LAB_IDE_USER_DATA']
if (testUserData) app.setPath('userData', resolve(testUserData))
else migrateFromLaboratorio()

/** Fino alla 0.8 l'app si chiamava "Laboratorio IDE": impostazioni, cronologia, corsi e progressi si copiano una volta. */
function migrateFromLaboratorio(): void {
  const target = app.getPath('userData')
  const legacy = join(app.getPath('appData'), 'Laboratorio IDE')
  if (!existsSync(legacy) || existsSync(join(target, 'settings.json'))) return
  for (const name of ['settings.json', 'learn-progress.json', 'history', 'courses']) {
    try {
      if (existsSync(join(legacy, name))) cpSync(join(legacy, name), join(target, name), { recursive: true, force: false })
    } catch (error) {
      console.warn(`Migrazione di ${name} non riuscita:`, (error as Error).message)
    }
  }
}

if (!app.requestSingleInstanceLock()) app.quit()

registerPreviewScheme()

let mainWindow: BrowserWindow | null = null

const settings = new SettingsService(join(app.getPath('userData'), 'settings.json'))
const history = new HistoryService(join(app.getPath('userData'), 'history'))
const workspace = new WorkspaceService(history, (change) => broadcast('workspace:changed', change))
const preview = new PreviewService(workspace)
const git = new GitService()
const databases = new DbService(workspace)
const terminals = new TerminalService(
  workspace,
  join(app.getPath('temp'), 'easey-ide'),
  (payload) => broadcast('terminal:data', payload),
  (payload) => broadcast('terminal:exit', payload),
  async () => (await settings.get()).defaultShell
)

// L'indirizzo di Ollama si legge dalle impostazioni a ogni chiamata (cambia senza riavvio).
let aiConfig = DEFAULT_SETTINGS.ai
void settings.get().then((s) => (aiConfig = s.ai))
// Corsi: inclusi nell'app (resources/courses), importati (dati utente), cartelle di lavoro degli esercizi.
const learn = new LearnService(
  join(app.getAppPath(), 'resources', 'courses'),
  join(app.getPath('userData'), 'courses'),
  join(app.getPath('userData'), 'learn-progress.json'),
  testUserData ? join(resolve(testUserData), 'Corsi') : join(app.getPath('documents'), APP_NAME, 'Corsi')
)

// Scrittura rapida: salvataggi nei Documenti (nei collaudi accanto ai dati utente isolati), worker per JS/TS,
// database SQL in memoria. Il worker è un file a sé; nell'app installata sta in app.asar.unpacked.
const quickStore = new QuickStore(
  testUserData ? join(resolve(testUserData), 'Scrittura rapida') : join(app.getPath('documents'), APP_NAME, 'Scrittura rapida'),
  async (path) => {
    try {
      await shell.trashItem(path)
    } catch {
      await rm(path, { force: true })
    }
  }
)
const unpacked = (file: string) => join(here, file).replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')
const quickRunner = new QuickRunner(
  () => ({ js: unpacked('quick-worker.mjs'), python: unpacked('quick-python-worker.mjs') }),
  (events) => broadcast('quick:events', events)
)
const quickSql = new QuickSql()

/** Dialogo Salva con nome e scrittura (nei collaudi LAB_IDE_SAVE_DIR salva senza dialogo). */
async function saveAs(defaultName: string, data: string | Buffer, defaultDir?: string): Promise<string | null> {
  const testDir = process.env['LAB_IDE_SAVE_DIR']
  let target: string | null = testDir ? join(testDir, basename(defaultName)) : null
  if (!target) {
    const options = { defaultPath: join(defaultDir ?? workspace.root() ?? app.getPath('documents'), defaultName) }
    const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    target = result.filePath
  }
  await writeFile(target, data, typeof data === 'string' ? 'utf8' : undefined)
  return target
}

/** Cartella del progetto aperto (errore chiaro se non ce n'è uno). */
function projectRoot(): string {
  const root = workspace.root()
  if (!root) throw new Error('Nessun progetto aperto')
  return root
}

/** Dialogo di scelta cartella (nei collaudi: LAB_IDE_PICK_DIR). */
async function pickFolder(): Promise<string | null> {
  const testDir = process.env['LAB_IDE_PICK_DIR']
  if (testDir) return testDir
  const options = { properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'> }
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

// Il fornitore (Ollama o compatibile OpenAI) e l'indirizzo si leggono a ogni richiesta.
const ollama = new OllamaProvider(() => aiConfig.endpoint)
const openAi = new OpenAiCompatibleProvider(
  () => aiConfig.endpoint,
  () => aiConfig.apiKey
)
const ai = new AiService(() => (aiConfig.provider === 'openai' ? openAi : ollama), (chunk) => broadcast('ai:chunk', chunk))

function rendererFile(): string {
  return join(here, '../renderer/index.html')
}

function devUrl(): URL | null {
  if (app.isPackaged || !process.env['ELECTRON_RENDERER_URL']) return null
  try {
    return new URL(process.env['ELECTRON_RENDERER_URL'])
  } catch {
    return null
  }
}

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  if (!mainWindow || event.sender !== mainWindow.webContents) return false
  if (event.senderFrame && event.senderFrame !== event.sender.mainFrame) return false
  try {
    const url = new URL(event.sender.getURL())
    const dev = devUrl()
    if (dev) return url.origin === dev.origin
    return url.protocol === 'file:' && resolve(fileURLToPath(url)) === resolve(rendererFile())
  } catch {
    return false
  }
}

async function openProject(root: string) {
  await databases.closeAll()
  const info = await workspace.open(root)
  await settings.addRecent(info.root, info.name)
  return info
}

registerHandlers(
  {
    'app:info': () => ({
      name: APP_NAME,
      version: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      platform: process.platform,
      isPackaged: app.isPackaged
    }),
    'app:setTitle': (title) => mainWindow?.setTitle(title),
    'app:legal': (doc) => {
      const file = doc === 'licenza' ? 'LICENSE' : doc === 'note' ? 'NOTE-LEGALI.md' : 'THIRD_PARTY_NOTICES.md'
      return readFile(join(app.getAppPath(), 'resources', 'legal', file), 'utf8')
    },
    'app:openExternal': (url) => {
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    },

    'app:saveFile': (defaultName, content, encoding) => saveAs(defaultName, encoding === 'base64' ? Buffer.from(content, 'base64') : content),

    'settings:get': () => settings.get(),
    'settings:update': async (patch) => {
      const next = await settings.update(patch)
      aiConfig = next.ai
      return next
    },

    'workspace:templates': () => listTemplates(),
    'workspace:defaultLocation': () => join(app.getPath('documents'), APP_NAME),
    'workspace:pickFolder': () => pickFolder(),
    'workspace:create': async ({ templateId, name, location }) => openProject(await createFromTemplate(templateId, name, location)),
    'workspace:open': (root) => openProject(root),
    'workspace:close': async () => {
      await databases.closeAll()
      terminals.killAll()
      workspace.close()
    },
    'workspace:current': () => workspace.info(),
    'workspace:tree': () => workspace.tree(),
    'workspace:textFiles': () => workspace.textFiles(),
    'workspace:readFile': (path) => workspace.readFile(path),
    'workspace:writeFile': (path, content) => workspace.writeFile(path, content),
    'workspace:createFile': (path, content) => workspace.createFile(path, content),
    'workspace:createFolder': (path) => workspace.createFolder(path),
    'workspace:rename': (from, to) => workspace.rename(from, to),
    'workspace:delete': (path) => workspace.delete(path),
    'workspace:reveal': (path) => shell.showItemInFolder(workspace.absolute(path)),
    'workspace:importAsset': async (folder) => {
      const options = { properties: ['openFile'] as Array<'openFile'>, filters: [{ name: 'Immagini', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'] }] }
      const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options)
      const source = result.canceled ? null : result.filePaths[0]
      return source ? workspace.importFile(source, folder) : null
    },
    'workspace:historyList': (path) => {
      const root = workspace.root()
      return root ? history.list(root, path) : []
    },
    'workspace:historyRead': (path, id) => {
      const root = workspace.root()
      if (!root) throw new Error('Nessun progetto aperto')
      return history.read(root, path, id)
    },

    'preview:url': (entry) => preview.urlFor(entry),
    'preview:mapLocation': (url, line, column) => preview.mapLocation(url, line, column),

    'terminal:capabilities': () => terminals.capabilities(),
    'terminal:create': (request) => terminals.create(request),
    'terminal:write': (id, data) => terminals.write(id, data),
    'terminal:resize': (id, cols, rows) => terminals.resize(id, cols, rows),
    'terminal:kill': (id) => terminals.kill(id),

    'ai:status': () => ai.status(),
    'ai:complete': (request) => ai.complete(request),
    'ai:chat': (request) => ai.chat(request),
    'ai:cancel': (requestId) => ai.cancel(requestId),

    'db:list': () => databases.list(),
    'db:samples': () => SAMPLE_DATABASES.map(({ id, title, description }) => ({ id, title, description })),
    'db:create': (request) => databases.create(request),
    'db:delete': (id) => databases.delete(id),
    'db:execute': (id, sql) => databases.execute(id, sql),
    'db:schema': (id) => databases.schema(id),
    'db:explain': (id, sql) => databases.explain(id, sql),
    'db:snapshots': (id) => databases.snapshots(id),
    'db:snapshot': (id) => databases.snapshot(id),
    'db:restore': (id, snapshotId) => databases.restore(id, snapshotId),

    'learn:list': () => learn.list(),
    'learn:course': (courseId) => learn.course(courseId),
    'learn:progress': (courseId) => learn.progress(courseId),
    'learn:start': (courseId, exerciseId, reset) => learn.start(courseId, exerciseId, reset),
    'learn:files': (courseId, exerciseId) => learn.files(courseId, exerciseId),
    'learn:check': (courseId, exerciseId) => learn.check(courseId, exerciseId),
    'learn:record': (courseId, exerciseId, event) => learn.record(courseId, exerciseId, event),
    'learn:import': async (kind) => {
      const folder = await pickFolder()
      if (!folder) return null
      return kind === 'manuale' ? learn.importManual(folder) : learn.importPack(folder)
    },
    'learn:remove': (courseId) => learn.remove(courseId),

    'trace:run': (path) => {
      workspace.absolute(path) // rifiuta i percorsi fuori dal progetto
      return traceFile(projectRoot(), path)
    },

    'git:status': () => git.status(projectRoot()),
    'git:init': () => git.init(projectRoot()),
    'git:original': (path) => {
      workspace.absolute(path)
      return git.original(projectRoot(), path)
    },
    'git:commit': (message) => git.commit(projectRoot(), message),
    'git:log': () => git.log(projectRoot()),
    'git:discard': (path) => {
      workspace.absolute(path)
      return git.discard(projectRoot(), path)
    },

    'project:export': async (kind) => {
      const root = projectRoot()
      const info = workspace.info()!
      const name = info.name.replace(/[<>:"/\\|?*]+/g, '-')
      const outside = dirname(root)
      if (kind === 'zip') return saveAs(`${name}.zip`, await exportZip(root, name), outside)
      const entry = /\.html?$/i.test(info.config.run.entry) ? info.config.run.entry : 'index.html'
      return saveAs(`${name}.html`, await exportSingleHtml(root, entry), outside)
    },

    'quick:list': () => quickStore.list(),
    'quick:read': (id) => quickStore.read(id),
    'quick:save': (request) => quickStore.save(request),
    'quick:delete': (id) => quickStore.remove(id),
    'quick:revealFolder': async () => {
      await mkdir(quickStore.folder(), { recursive: true })
      await shell.openPath(quickStore.folder())
    },
    'quick:run': (request) => {
      void quickRunner.run(request)
    },
    'quick:stop': (runId) => quickRunner.stop(runId),
    'quick:prepare': (language) => quickRunner.prepare(language),
    'quick:page': (html) => preview.setQuickPage(html),
    'quick:sql': (engine, sql) => quickSql.execute(engine, sql),
    'quick:sqlSchema': (engine) => quickSql.schema(engine),
    'quick:sqlReset': (engine, sample) => quickSql.reset(engine, sample)
  },
  isTrustedSender
)

async function createWindow(): Promise<void> {
  const current = await settings.get()
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: APP_NAME,
    icon: join(app.getAppPath(), 'resources', 'icon.png'),
    backgroundColor: current.theme === 'light' ? '#f5f6f8' : '#16181d',
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false
    }
  })

  // Rete di sicurezza: se ready-to-show non arriva (renderer in errore) la finestra si mostra comunque.
  const fallback = setTimeout(() => mainWindow?.show(), 5000)
  mainWindow.once('ready-to-show', () => {
    clearTimeout(fallback)
    mainWindow?.show()
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Link e popup: mai dentro l'app. I link web vanno al browser di sistema.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const dev = devUrl()
    if (dev && url.startsWith(dev.origin)) return
    event.preventDefault()
  })
  // Anche le pagine dell'anteprima non possono aprire finestre dell'app.
  mainWindow.webContents.on('did-create-window', (child) => child.close())

  buildMenu(() => mainWindow)

  const dev = devUrl()
  if (dev) await mainWindow.loadURL(dev.toString())
  else await mainWindow.loadFile(rendererFile())
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.whenReady().then(async () => {
  preview.register()
  await createWindow()
})

app.on('window-all-closed', () => {
  terminals.killAll()
  quickRunner.dispose()
  void databases.closeAll()
  void quickSql.closeAll()
  app.quit()
})
