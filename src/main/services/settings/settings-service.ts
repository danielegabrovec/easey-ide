// Impostazioni utente e progetti recenti, in un JSON nei dati dell'app.
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { DEFAULT_ENDPOINTS } from '@shared/contracts/ai'
import { DEFAULT_SETTINGS, type RecentProject, type Settings } from '@shared/contracts/settings'

const MAX_RECENT = 12

export function mergeSettings(base: Settings, patch: Partial<Settings>): Settings {
  const next: Settings = { ...base, ...patch, ai: { ...DEFAULT_SETTINGS.ai, ...base.ai, ...patch.ai } }
  next.ai.temperature = Math.min(1.5, Math.max(0, Number(next.ai.temperature) || 0))
  if (next.ai.provider !== 'openai') next.ai.provider = 'ollama'
  if (!/^https?:\/\//i.test(next.ai.endpoint)) next.ai.endpoint = DEFAULT_ENDPOINTS[next.ai.provider]
  if (typeof next.ai.apiKey !== 'string') next.ai.apiKey = ''
  next.fontSize = Math.min(32, Math.max(10, Math.round(Number(next.fontSize) || DEFAULT_SETTINGS.fontSize)))
  if (next.theme !== 'dark' && next.theme !== 'light') next.theme = DEFAULT_SETTINGS.theme
  if (next.language !== 'it' && next.language !== 'en') next.language = DEFAULT_SETTINGS.language
  next.recent = Array.isArray(next.recent) ? next.recent.slice(0, MAX_RECENT) : []
  return next
}

export function pushRecent(recent: RecentProject[], entry: RecentProject): RecentProject[] {
  const key = entry.root.toLowerCase()
  return [entry, ...recent.filter((r) => r.root.toLowerCase() !== key)].slice(0, MAX_RECENT)
}

export class SettingsService {
  private cache: Settings | null = null

  constructor(private readonly file: string) {}

  async get(): Promise<Settings> {
    if (this.cache) return this.cache
    let stored: Partial<Settings> = {}
    if (existsSync(this.file)) {
      try {
        stored = JSON.parse(await readFile(this.file, 'utf8')) as Partial<Settings>
      } catch {
        stored = {}
      }
    }
    this.cache = mergeSettings(DEFAULT_SETTINGS, stored)
    return this.cache
  }

  async update(patch: Partial<Settings>): Promise<Settings> {
    const next = mergeSettings(await this.get(), patch)
    this.cache = next
    await mkdir(dirname(this.file), { recursive: true })
    await writeFile(this.file, JSON.stringify(next, null, 2), 'utf8')
    return next
  }

  async addRecent(root: string, name: string): Promise<void> {
    const current = await this.get()
    await this.update({ recent: pushRecent(current.recent, { root, name, at: Date.now() }) })
  }
}
