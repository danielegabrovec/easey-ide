// Database del progetto aperto: elenco connessioni, apertura pigra dei motori, creazione con dati
// d'esempio, istantanee (modalità sandbox: provo, sbaglio, ripristino in un clic).
import { existsSync } from 'node:fs'
import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { CreateDatabaseRequest, DbConnectionInfo, DbDriver, DbEngine, DbSchema, DbSnapshot, QueryOutcome, QueryPlan } from '@shared/contracts/db'
import { basenameOf, extensionOf, normalizeRelative } from '@shared/paths'
import { SAMPLE_DATABASES } from '@shared/sql/samples'
import type { WorkspaceService } from '../workspace/workspace-service'
import { PgliteDriver } from './pglite-driver'
import { SqliteDriver } from './sqlite-driver'

export const SQLITE_EXTENSIONS = ['db', 'sqlite', 'sqlite3']
export const POSTGRES_DIR = '.laboratorio/postgres'
const SNAPSHOT_DIR = '.laboratorio/snapshots'
export const MEMORY_ID = 'sqlite::memory:'

export function connectionId(engine: DbEngine, path: string): string {
  return `${engine}:${path}`
}

export function parseConnectionId(id: string): { engine: DbEngine; path: string } {
  const separator = id.indexOf(':')
  const engine = id.slice(0, separator)
  if (engine !== 'sqlite' && engine !== 'postgres') throw new Error(`Connessione non valida: ${id}`)
  const path = id.slice(separator + 1)
  return { engine, path: path === ':memory:' ? path : normalizeRelative(path) }
}

export function sanitizeDbName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!cleaned) throw new Error('Nome del database non valido')
  return cleaned
}

export class DbService {
  private readonly drivers = new Map<string, Promise<DbDriver>>()

  constructor(private readonly workspace: WorkspaceService) {}

  async list(): Promise<DbConnectionInfo[]> {
    const connections: DbConnectionInfo[] = [{ id: MEMORY_ID, engine: 'sqlite', name: 'memoria (temporaneo)', path: ':memory:' }]
    if (!this.workspace.root()) return connections
    for (const path of await this.workspace.listFiles()) {
      if (SQLITE_EXTENSIONS.includes(extensionOf(path))) connections.push({ id: connectionId('sqlite', path), engine: 'sqlite', name: basenameOf(path).replace(/\.[^.]+$/, ''), path })
    }
    const pgRoot = this.workspace.absolute(POSTGRES_DIR)
    if (existsSync(pgRoot)) {
      for (const entry of await readdir(pgRoot, { withFileTypes: true })) {
        if (entry.isDirectory()) connections.push({ id: connectionId('postgres', `${POSTGRES_DIR}/${entry.name}`), engine: 'postgres', name: entry.name, path: `${POSTGRES_DIR}/${entry.name}` })
      }
    }
    return connections
  }

  private driver(id: string, allowCreate = false): Promise<DbDriver> {
    let pending = this.drivers.get(id)
    if (!pending) {
      const { engine, path } = parseConnectionId(id)
      const location = path === ':memory:' ? ':memory:' : this.workspace.absolute(path)
      if (path !== ':memory:' && !allowCreate && !existsSync(location)) throw new Error(`Database non trovato: ${path}`)
      pending = engine === 'sqlite' ? Promise.resolve(new SqliteDriver(location)) : PgliteDriver.open(location)
      pending.catch(() => this.drivers.delete(id))
      this.drivers.set(id, pending)
    }
    return pending
  }

  async execute(id: string, sql: string): Promise<QueryOutcome[]> {
    return (await this.driver(id)).execute(sql)
  }

  async schema(id: string): Promise<DbSchema> {
    return (await this.driver(id)).schema()
  }

  async explain(id: string, sql: string): Promise<QueryPlan> {
    return (await this.driver(id)).explain(sql)
  }

  async create(request: CreateDatabaseRequest): Promise<DbConnectionInfo> {
    const name = sanitizeDbName(request.name)
    const path = request.engine === 'sqlite' ? `database/${name}.db` : `${POSTGRES_DIR}/${name}`
    const absolute = this.workspace.absolute(path)
    if (existsSync(absolute)) throw new Error(`Esiste già un database "${name}".`)
    await mkdir(request.engine === 'sqlite' ? join(absolute, '..') : absolute, { recursive: true })
    const info: DbConnectionInfo = { id: connectionId(request.engine, path), engine: request.engine, name, path }
    const sample = request.sample ? SAMPLE_DATABASES.find((s) => s.id === request.sample) : null
    try {
      const outcomes = await (await this.driver(info.id, true)).execute(sample ? sample.sql[request.engine] : 'SELECT 1')
      const failure = outcomes.find((o) => o.kind === 'error')
      if (failure && failure.kind === 'error') throw new Error(`Dati d'esempio non caricati: ${failure.message}`)
    } catch (error) {
      await this.close(info.id)
      await rm(absolute, { recursive: true, force: true })
      throw error
    }
    return info
  }

  async delete(id: string): Promise<void> {
    const { path } = parseConnectionId(id)
    if (path === ':memory:') {
      await this.close(id)
      return
    }
    await this.close(id)
    await rm(this.workspace.absolute(path), { recursive: true, force: true })
    await rm(this.workspace.absolute(this.snapshotDir(id)), { recursive: true, force: true })
  }

  private snapshotDir(id: string): string {
    const { engine, path } = parseConnectionId(id)
    return `${SNAPSHOT_DIR}/${engine}-${path.replace(/[^A-Za-z0-9_-]+/g, '_')}`
  }

  async snapshots(id: string): Promise<DbSnapshot[]> {
    if (parseConnectionId(id).path === ':memory:') return []
    const dir = this.workspace.absolute(this.snapshotDir(id))
    if (!existsSync(dir)) return []
    return (await readdir(dir))
      .filter((name) => /^\d+$/.test(name))
      .map((name) => ({ id: name, at: Number(name) }))
      .sort((a, b) => b.at - a.at)
  }

  /** Copia il database (chiuso per sicurezza) in .laboratorio/snapshots. */
  async snapshot(id: string): Promise<DbSnapshot> {
    const { path } = parseConnectionId(id)
    if (path === ':memory:') throw new Error('Il database in memoria non si può salvare in un’istantanea.')
    await this.close(id)
    const at = Date.now()
    const target = this.workspace.absolute(`${this.snapshotDir(id)}/${at}`)
    await mkdir(target, { recursive: true })
    await cp(this.workspace.absolute(path), join(target, 'dati'), { recursive: true })
    const all = await this.snapshots(id)
    for (const old of all.slice(20)) await rm(this.workspace.absolute(`${this.snapshotDir(id)}/${old.id}`), { recursive: true, force: true })
    return { id: String(at), at }
  }

  async restore(id: string, snapshotId: string): Promise<void> {
    if (!/^\d+$/.test(snapshotId)) throw new Error('Istantanea non valida')
    const { path } = parseConnectionId(id)
    const source = this.workspace.absolute(`${this.snapshotDir(id)}/${snapshotId}/dati`)
    if (!existsSync(source)) throw new Error('Istantanea non trovata')
    await this.close(id)
    const target = this.workspace.absolute(path)
    await rm(target, { recursive: true, force: true })
    await cp(source, target, { recursive: true })
  }

  async close(id: string): Promise<void> {
    const pending = this.drivers.get(id)
    this.drivers.delete(id)
    if (pending) await (await pending.catch(() => null))?.close()
  }

  async closeAll(): Promise<void> {
    for (const id of [...this.drivers.keys()]) await this.close(id)
  }
}
