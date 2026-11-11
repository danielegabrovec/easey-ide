import { DEFAULT_AI_SETTINGS, type AiSettings } from './ai'
import { DEFAULT_QUICK_SETTINGS, type QuickSettings } from './quick'

export type ThemeName = 'dark' | 'light'
export type Language = 'it' | 'en'

export interface RecentProject {
  root: string
  name: string
  at: number
}

export interface Settings {
  theme: ThemeName
  language: Language
  fontSize: number
  autoSave: boolean
  /** Ricarica l'anteprima web a ogni salvataggio. */
  autoRun: boolean
  defaultShell: string
  recent: RecentProject[]
  ai: AiSettings
  /** Scrittura rapida: livello di aiuto, esecuzione automatica, motore SQL, tempo massimo. */
  quick: QuickSettings
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  language: 'it',
  fontSize: 14,
  autoSave: true,
  autoRun: true,
  defaultShell: 'powershell',
  recent: [],
  ai: DEFAULT_AI_SETTINGS,
  quick: DEFAULT_QUICK_SETTINGS
}

export interface AppInfo {
  name: string
  version: string
  electron: string
  node: string
  platform: string
  isPackaged: boolean
}
