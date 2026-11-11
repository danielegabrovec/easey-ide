// Raccolta della Scrittura rapida: ogni salvataggio è un file vero `<titolo>.<js|ts|sql>` in una
// cartella dei Documenti (Documenti/Easey IDE/Scrittura rapida), apribile anche fuori dall'IDE.
// Il nome del file è l'identificativo; rinominare = cambiare titolo.
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { QUICK_EXTENSIONS, quickLanguageOf, type QuickSaveRequest, type QuickSnippet, type QuickSnippetInfo } from '@shared/contracts/quick'

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i
const MAX_TITLE = 80

/** Titolo → nome di file valido su Windows (niente caratteri vietati, punti o spazi in coda, nomi riservati). */
export function sanitizeTitle(title: string): string {
  let cleaned = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, MAX_TITLE)
    .trim()
  if (!cleaned || /^[.-]+$/.test(cleaned)) cleaned = 'senza titolo'
  if (RESERVED.test(cleaned)) cleaned = `_${cleaned}`
  return cleaned
}

/** Rifiuta identificativi che escono dalla cartella o che non sono file della raccolta. */
export function checkId(id: string): string {
  if (!id || /[\\/]/.test(id) || id.includes('..') || !quickLanguageOf(id)) throw new Error(`Salvataggio non valido: ${id}`)
  return id
}

export class QuickStore {
  constructor(
    private readonly dir: string,
    /** Cestino di sistema (nell'app: shell.trashItem); di base cancella. */
    private readonly trash: (path: string) => Promise<void> = (path) => rm(path, { force: true })
  ) {}

  folder(): string {
    return this.dir
  }

  async list(): Promise<QuickSnippetInfo[]> {
    if (!existsSync(this.dir)) return []
    const entries = await readdir(this.dir, { withFileTypes: true })
    const infos: QuickSnippetInfo[] = []
    for (const entry of entries) {
      const language = entry.isFile() ? quickLanguageOf(entry.name) : null
      if (!language) continue
      const info = await stat(join(this.dir, entry.name))
      infos.push({ id: entry.name, title: entry.name.replace(/\.[^.]+$/, ''), language, updatedAt: info.mtimeMs, size: info.size })
    }
    return infos.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async read(id: string): Promise<QuickSnippet> {
    const path = join(this.dir, checkId(id))
    const [content, info] = await Promise.all([readFile(path, 'utf8'), stat(path)])
    return { id, title: id.replace(/\.[^.]+$/, ''), language: quickLanguageOf(id)!, updatedAt: info.mtimeMs, size: info.size, content }
  }

  /** Salva (nuovo o sovrascrive). Con titolo o linguaggio cambiati il file viene rinominato. */
  async save(request: QuickSaveRequest): Promise<QuickSnippetInfo> {
    await mkdir(this.dir, { recursive: true })
    const extension = QUICK_EXTENSIONS[request.language]
    const base = sanitizeTitle(request.title)
    const previous = request.id ? checkId(request.id) : null
    let id = `${base}.${extension}`
    if (id.toLowerCase() !== previous?.toLowerCase()) id = this.freeName(base, extension, previous)
    const target = join(this.dir, id)
    if (previous && previous !== id && existsSync(join(this.dir, previous))) {
      // Rinomina prima (così il file resta uno solo), poi scrive il contenuto aggiornato.
      await rename(join(this.dir, previous), target)
    }
    await writeFile(target, request.content, 'utf8')
    const info = await stat(target)
    return { id, title: id.replace(/\.[^.]+$/, ''), language: request.language, updatedAt: info.mtimeMs, size: info.size }
  }

  async remove(id: string): Promise<void> {
    const path = join(this.dir, checkId(id))
    if (existsSync(path)) await this.trash(path)
  }

  private freeName(base: string, extension: string, except: string | null): string {
    let candidate = `${base}.${extension}`
    for (let n = 2; existsSync(join(this.dir, candidate)) && candidate.toLowerCase() !== except?.toLowerCase(); n++) candidate = `${base} (${n}).${extension}`
    return candidate
  }
}
