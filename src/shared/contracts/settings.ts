import { DEFAULT_AI_SETTINGS, type AiSettings } from './ai'

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
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  language: 'it',
  fontSize: 14,
  autoSave: true,
  autoRun: true,
  defaultShell: 'powershell',
  recent: [],
  ai: DEFAULT_AI_SETTINGS
}

export interface AppInfo {
  name: string
  version: string
  electron: string
  node: string
  platform: string
  isPackaged: boolean
}
