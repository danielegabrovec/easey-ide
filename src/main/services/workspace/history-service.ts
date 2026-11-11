// Cronologia locale dei file: a ogni salvataggio si conserva una copia nei dati dell'app
// (mai nella cartella del progetto). Salvataggi ravvicinati (autosalvataggio) aggiornano
// l'ultima versione invece di crearne una nuova.
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { HistoryEntry } from '@shared/contracts/workspace'

const MERGE_WINDOW_MS = 60_000
const KEEP = 50

const hash = (value: string) => createHash('sha1').update(value).digest('hex').slice(0, 16)

export class HistoryService {
  constructor(private readonly baseDir: string) {}

  private dirFor(root: string, path: string): string {
    return join(this.baseDir, hash(root.toLowerCase()), hash(path))
  }

  async record(root: string, path: string, content: string, now = Date.now()): Promise<void> {
    const dir = this.dirFor(root, path)
    await mkdir(dir, { recursive: true })
    const entries = await this.entries(dir)
    const last = entries[0]
    if (last) {
      const previous = await readFile(join(dir, `${last.id}.txt`), 'utf8')
      if (previous === content) return
      if (now - last.at < MERGE_WINDOW_MS) await rm(join(dir, `${last.id}.txt`), { force: true })
    }
    await writeFile(join(dir, `${now}.txt`), content, 'utf8')
    for (const old of (await this.entries(dir)).slice(KEEP)) await rm(join(dir, `${old.id}.txt`), { force: true })
  }

  async list(root: string, path: string): Promise<HistoryEntry[]> {
    return this.entries(this.dirFor(root, path))
  }

  async read(root: string, path: string, id: string): Promise<string> {
    if (!/^\d+$/.test(id)) throw new Error('Versione non valida')
    return readFile(join(this.dirFor(root, path), `${id}.txt`), 'utf8')
  }

  private async entries(dir: string): Promise<HistoryEntry[]> {
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      return []
    }
    const result: HistoryEntry[] = []
    for (const name of names) {
      const match = /^(\d+)\.txt$/.exec(name)
      if (!match) continue
      const info = await stat(join(dir, name))
      result.push({ id: match[1]!, at: Number(match[1]), size: info.size })
    }
    return result.sort((a, b) => b.at - a.at)
  }
}
