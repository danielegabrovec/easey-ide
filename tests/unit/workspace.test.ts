import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/contracts/settings'
import { HistoryService } from '../../src/main/services/workspace/history-service'
import { createFromTemplate, listTemplates, sanitizeProjectName } from '../../src/main/services/workspace/templates'
import { inferConfig, parseConfig, WorkspaceService } from '../../src/main/services/workspace/workspace-service'
import { mergeSettings, pushRecent, SettingsService } from '../../src/main/services/settings/settings-service'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lab-unit-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('configurazione di esecuzione', () => {
  it('deduce web o terminale dai file presenti', () => {
    expect(inferConfig('a', new Set(['index.html', 'src/main.ts'])).run).toEqual({ mode: 'web', entry: 'index.html' })
    expect(inferConfig('a', new Set(['src/main.ts'])).run).toEqual({ mode: 'terminal', entry: 'src/main.ts' })
    expect(inferConfig('a', new Set(['pagine/home.html'])).run).toEqual({ mode: 'web', entry: 'pagine/home.html' })
  })
  it('legge easey.json tollerando valori mancanti o sbagliati', () => {
    const fallback = inferConfig('progetto', new Set(['index.html']))
    expect(parseConfig('{"run":{"mode":"terminal","entry":"app.ts"}}', fallback)).toEqual({ name: 'progetto', run: { mode: 'terminal', entry: 'app.ts' } })
    expect(parseConfig('non è json', fallback)).toEqual(fallback)
    expect(parseConfig('{"name":"X","run":{"mode":"boh"}}', fallback)).toEqual({ name: 'X', run: { mode: 'web', entry: 'index.html' } })
  })
})

describe('modelli di progetto', () => {
  it('ripulisce i nomi', () => {
    expect(sanitizeProjectName('  Il mio  sito?  ')).toBe('Il mio sito')
    expect(() => sanitizeProjectName(' ?* ')).toThrow()
  })
  it('ogni modello crea i suoi file e easey.json coerente', async () => {
    for (const template of listTemplates()) {
      const root = await createFromTemplate(template.id, `prova ${template.id}`, dir)
      const config = JSON.parse(readFileSync(join(root, 'easey.json'), 'utf8'))
      expect(config.run.mode).toBe(template.mode)
      expect(existsSync(join(root, config.run.entry))).toBe(true)
    }
  })
  it('non sovrascrive una cartella esistente', async () => {
    await createFromTemplate('empty', 'doppio', dir)
    await expect(createFromTemplate('empty', 'doppio', dir)).rejects.toThrow(/esiste già/i)
  })
})

describe('WorkspaceService', () => {
  async function openSample() {
    const root = await createFromTemplate('web-ts', 'demo', dir)
    const history = new HistoryService(join(dir, 'history'))
    const workspace = new WorkspaceService(history, () => undefined)
    const info = await workspace.open(root)
    return { root, workspace, history, info }
  }

  it('apre il progetto e legge la configurazione', async () => {
    const { info } = await openSample()
    expect(info.name).toBe('demo')
    expect(info.config.run).toEqual({ mode: 'web', entry: 'index.html' })
  })

  it('albero: cartelle prima, node_modules escluso', async () => {
    const { workspace } = await openSample()
    await workspace.createFolder('node_modules/pacchetto')
    const tree = await workspace.tree()
    expect(tree[0]).toMatchObject({ name: 'src', kind: 'dir' })
    expect(tree.map((e) => e.name)).not.toContain('node_modules')
    expect(tree.find((e) => e.name === 'src')?.children?.map((c) => c.path)).toEqual(['src/contatore.ts', 'src/main.ts'])
  })

  it('blocca i percorsi fuori dal progetto', async () => {
    const { workspace } = await openSample()
    expect(() => workspace.absolute('../fuori.txt')).toThrow()
    await expect(workspace.writeFile('..\\fuori.txt', 'x')).rejects.toThrow()
    await expect(workspace.delete('')).rejects.toThrow()
  })

  it('scrive, rinomina, elimina e tiene la cronologia', async () => {
    const { workspace, history, root } = await openSample()
    await workspace.writeFile('note/appunti.md', 'uno')
    expect(await workspace.readFile('note/appunti.md')).toBe('uno')
    await workspace.rename('note/appunti.md', 'note/idee.md')
    expect(existsSync(join(root, 'note', 'appunti.md'))).toBe(false)
    await expect(workspace.createFile('note/idee.md', '')).rejects.toThrow(/esiste già/i)
    await workspace.delete('note')
    expect(existsSync(join(root, 'note'))).toBe(false)
    expect((await history.list(root, 'note/appunti.md')).length).toBe(1)
  })

  it('aggiorna la configurazione quando si salva easey.json', async () => {
    const { workspace } = await openSample()
    await workspace.writeFile('easey.json', '{"name":"demo","run":{"mode":"terminal","entry":"src/main.ts"}}')
    expect(workspace.info()?.config.run.mode).toBe('terminal')
  })

  it('legge ancora il vecchio laboratorio.json (progetti della 0.8)', async () => {
    const { workspace, root } = await openSample()
    rmSync(join(root, 'easey.json'))
    writeFileSync(join(root, 'laboratorio.json'), '{"name":"vecchio","run":{"mode":"terminal","entry":"src/main.ts"}}')
    expect((await workspace.readConfig()).run.mode).toBe('terminal')
  })

  it('elenca i file di testo per IntelliSense', async () => {
    const { workspace } = await openSample()
    const files = await workspace.textFiles()
    expect(files.map((f) => f.path).sort()).toEqual(['easey.json', 'index.html', 'src/contatore.ts', 'src/main.ts', 'style.css', 'tsconfig.json'])
  })
})

describe('HistoryService', () => {
  it('unisce i salvataggi ravvicinati e ignora i duplicati', async () => {
    const history = new HistoryService(join(dir, 'h'))
    await history.record('C:/p', 'a.ts', 'v1', 1_000)
    await history.record('C:/p', 'a.ts', 'v1', 2_000)
    await history.record('C:/p', 'a.ts', 'v2', 3_000)
    let list = await history.list('C:/p', 'a.ts')
    expect(list).toHaveLength(1)
    expect(await history.read('C:/p', 'a.ts', list[0]!.id)).toBe('v2')
    await history.record('C:/p', 'a.ts', 'v3', 200_000)
    list = await history.list('C:/p', 'a.ts')
    expect(list.map((e) => e.at)).toEqual([200_000, 3_000])
    await expect(history.read('C:/p', 'a.ts', '../x')).rejects.toThrow()
  })
})

describe('impostazioni', () => {
  it('normalizza i valori', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, { fontSize: 99, theme: 'viola' as never })
    expect(merged.fontSize).toBe(32)
    expect(merged.theme).toBe('dark')
  })
  it('progetti recenti senza doppioni e al massimo 12', () => {
    let recent = pushRecent([], { root: 'C:/A', name: 'A', at: 1 })
    recent = pushRecent(recent, { root: 'c:/a', name: 'A', at: 2 })
    expect(recent).toHaveLength(1)
    for (let i = 0; i < 20; i++) recent = pushRecent(recent, { root: `C:/${i}`, name: String(i), at: i })
    expect(recent).toHaveLength(12)
    expect(recent[0]!.root).toBe('C:/19')
  })
  it('salva e rilegge da disco', async () => {
    const file = join(dir, 'settings.json')
    await new SettingsService(file).update({ fontSize: 18 })
    expect((await new SettingsService(file).get()).fontSize).toBe(18)
  })
})
