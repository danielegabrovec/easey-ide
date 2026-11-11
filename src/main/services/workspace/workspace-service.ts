// Il progetto aperto: file su disco, albero, osservatore delle modifiche, configurazione.
// Ogni percorso in ingresso è relativo alla radice e viene validato (niente uscite con "..").
import { watch, type FSWatcher } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, join, relative as relativePath, resolve, sep } from 'node:path'
import {
  LEGACY_PROJECT_CONFIG_FILE,
  PROJECT_CONFIG_FILE,
  type FileEntry,
  type ProjectConfig,
  type ProjectInfo,
  type TextFile,
  type WorkspaceChange
} from '@shared/contracts/workspace'
import { IGNORED_DIRS, isTextFile, normalizeRelative } from '@shared/paths'
import type { HistoryService } from './history-service'

const MAX_TEXT_FILE = 1024 * 1024
const MAX_TEXT_FILES = 2000

export function inferConfig(name: string, files: Set<string>): ProjectConfig {
  if (files.has('index.html')) return { name, run: { mode: 'web', entry: 'index.html' } }
  for (const entry of ['src/main.ts', 'main.ts', 'src/index.ts', 'index.ts', 'src/main.js', 'main.js', 'src/index.js', 'index.js']) {
    if (files.has(entry)) return { name, run: { mode: 'terminal', entry } }
  }
  const html = [...files].find((file) => file.endsWith('.html'))
  if (html) return { name, run: { mode: 'web', entry: html } }
  return { name, run: { mode: 'web', entry: 'index.html' } }
}

export function parseConfig(raw: string, fallback: ProjectConfig): ProjectConfig {
  try {
    const data = JSON.parse(raw) as Partial<ProjectConfig>
    const mode = data.run?.mode === 'terminal' ? 'terminal' : data.run?.mode === 'web' ? 'web' : fallback.run.mode
    const entry = typeof data.run?.entry === 'string' && data.run.entry ? normalizeRelative(data.run.entry) : fallback.run.entry
    return { name: typeof data.name === 'string' && data.name ? data.name : fallback.name, run: { mode, entry } }
  } catch {
    return fallback
  }
}

export class WorkspaceService {
  private current: ProjectInfo | null = null
  private watcher: FSWatcher | null = null
  private pending = new Set<string>()
  private flushTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly history: HistoryService,
    private readonly emitChange: (change: WorkspaceChange) => void
  ) {}

  root(): string | null {
    return this.current?.root ?? null
  }

  info(): ProjectInfo | null {
    return this.current
  }

  absolute(relative: string): string {
    const root = this.requireRoot()
    const target = resolve(root, normalizeRelative(relative))
    if (target !== root && !target.startsWith(root + sep)) throw new Error(`Percorso fuori dal progetto: ${relative}`)
    return target
  }

  async open(root: string): Promise<ProjectInfo> {
    const absoluteRoot = resolve(root)
    const info = await stat(absoluteRoot)
    if (!info.isDirectory()) throw new Error(`Non è una cartella: ${absoluteRoot}`)
    this.close()
    this.current = { root: absoluteRoot, name: basename(absoluteRoot), config: { name: basename(absoluteRoot), run: { mode: 'web', entry: 'index.html' } } }
    this.current = { ...this.current, config: await this.readConfig() }
    this.current.name = this.current.config.name
    this.startWatching()
    return this.current
  }

  close(): void {
    this.watcher?.close()
    this.watcher = null
    this.current = null
  }

  async readConfig(): Promise<ProjectConfig> {
    const root = this.requireRoot()
    const files = new Set(await this.listFiles())
    const fallback = inferConfig(basename(root), files)
    let configPath = join(root, PROJECT_CONFIG_FILE)
    if (!existsSync(configPath)) configPath = join(root, LEGACY_PROJECT_CONFIG_FILE)
    if (!existsSync(configPath)) return fallback
    return parseConfig(await readFile(configPath, 'utf8'), fallback)
  }

  async tree(): Promise<FileEntry[]> {
    const root = this.requireRoot()
    const walk = async (dir: string, prefix: string): Promise<FileEntry[]> => {
      const entries = await readdir(dir, { withFileTypes: true })
      const result: FileEntry[] = []
      for (const entry of entries) {
        if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue
        const path = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.isDirectory()) result.push({ name: entry.name, path, kind: 'dir', children: await walk(join(dir, entry.name), path) })
        else if (entry.isFile()) result.push({ name: entry.name, path, kind: 'file' })
      }
      return result.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }) : a.kind === 'dir' ? -1 : 1))
    }
    return walk(root, '')
  }

  async listFiles(): Promise<string[]> {
    const root = this.requireRoot()
    const out: string[] = []
    const walk = async (dir: string, prefix: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (out.length >= MAX_TEXT_FILES) return
        if (entry.isDirectory()) {
          if (!IGNORED_DIRS.has(entry.name)) await walk(join(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name)
        } else if (entry.isFile()) {
          out.push(prefix ? `${prefix}/${entry.name}` : entry.name)
        }
      }
    }
    await walk(root, '')
    return out
  }

  async textFiles(): Promise<TextFile[]> {
    const files: TextFile[] = []
    for (const path of await this.listFiles()) {
      if (!isTextFile(path)) continue
      const absolute = this.absolute(path)
      const info = await stat(absolute)
      if (info.size > MAX_TEXT_FILE) continue
      files.push({ path, content: await readFile(absolute, 'utf8') })
    }
    return files
  }

  async readFile(path: string): Promise<string> {
    return readFile(this.absolute(path), 'utf8')
  }

  async writeFile(path: string, content: string): Promise<void> {
    const absolute = this.absolute(path)
    await mkdir(resolve(absolute, '..'), { recursive: true })
    await writeFile(absolute, content, 'utf8')
    await this.history.record(this.requireRoot(), normalizeRelative(path), content)
    if ((normalizeRelative(path) === PROJECT_CONFIG_FILE || normalizeRelative(path) === LEGACY_PROJECT_CONFIG_FILE) && this.current) {
      this.current = { ...this.current, config: await this.readConfig() }
    }
  }

  async createFile(path: string, content: string): Promise<void> {
    const absolute = this.absolute(path)
    if (existsSync(absolute)) throw new Error(`Esiste già: ${path}`)
    await mkdir(resolve(absolute, '..'), { recursive: true })
    await writeFile(absolute, content, 'utf8')
  }

  async createFolder(path: string): Promise<void> {
    const absolute = this.absolute(path)
    if (existsSync(absolute)) throw new Error(`Esiste già: ${path}`)
    await mkdir(absolute, { recursive: true })
  }

  async rename(from: string, to: string): Promise<void> {
    const target = this.absolute(to)
    if (existsSync(target)) throw new Error(`Esiste già: ${to}`)
    await mkdir(resolve(target, '..'), { recursive: true })
    await rename(this.absolute(from), target)
  }

  async delete(path: string): Promise<void> {
    const absolute = this.absolute(path)
    if (absolute === this.requireRoot()) throw new Error('Non si può eliminare la radice del progetto')
    await rm(absolute, { recursive: true, force: true })
  }

  /** Copia un file esterno nella cartella del progetto (nome reso univoco). Restituisce il percorso relativo. */
  async importFile(source: string, folder: string): Promise<string> {
    const dir = normalizeRelative(folder)
    await mkdir(this.absolute(dir || '.'), { recursive: true })
    const name = basename(source).replace(/[^\w.-]+/g, '-')
    const dot = name.lastIndexOf('.')
    const stem = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ''
    let candidate = dir ? `${dir}/${name}` : name
    for (let n = 2; existsSync(this.absolute(candidate)); n++) candidate = dir ? `${dir}/${stem}-${n}${ext}` : `${stem}-${n}${ext}`
    await copyFile(source, this.absolute(candidate))
    return candidate
  }

  private requireRoot(): string {
    if (!this.current) throw new Error('Nessun progetto aperto')
    return this.current.root
  }

  private startWatching(): void {
    const root = this.requireRoot()
    try {
      this.watcher = watch(root, { recursive: true }, (_event, filename) => {
        if (!filename) return
        const rel = relativePath(root, join(root, filename.toString())).split(sep).join('/')
        if (rel.split('/').some((part) => IGNORED_DIRS.has(part))) return
        this.pending.add(rel)
        if (this.flushTimer) clearTimeout(this.flushTimer)
        this.flushTimer = setTimeout(() => this.flush(), 120)
      })
      this.watcher.on('error', () => undefined)
    } catch {
      this.watcher = null
    }
  }

  private flush(): void {
    const paths = [...this.pending]
    this.pending.clear()
    if (paths.length > 0) this.emitChange({ paths })
  }
}
