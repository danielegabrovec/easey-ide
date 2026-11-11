// Contratto del workspace: progetti su disco, file, modelli di progetto, cronologia locale.
// I percorsi scambiati fra renderer e main sono SEMPRE relativi alla radice del progetto, con "/".

export type RunMode = 'web' | 'terminal'

/** Contenuto di `easey.json` nella radice del progetto. */
export interface ProjectConfig {
  name: string
  run: { mode: RunMode; entry: string }
}

export interface ProjectInfo {
  /** Percorso assoluto della cartella del progetto. */
  root: string
  name: string
  config: ProjectConfig
}

export interface FileEntry {
  name: string
  /** Percorso relativo alla radice, separatore "/". */
  path: string
  kind: 'file' | 'dir'
  children?: FileEntry[]
}

export interface TextFile {
  path: string
  content: string
}

export interface ProjectTemplate {
  id: string
  title: string
  description: string
  mode: RunMode
}

export interface CreateProjectRequest {
  templateId: string
  name: string
  /** Cartella che conterrà la nuova cartella del progetto. */
  location: string
}

export interface HistoryEntry {
  id: string
  at: number
  size: number
}

export interface WorkspaceChange {
  paths: string[]
}

export const PROJECT_CONFIG_FILE = 'easey.json'
/** Nome usato fino alla 0.8 ("Laboratorio IDE"): si legge ancora se manca easey.json. */
export const LEGACY_PROJECT_CONFIG_FILE = 'laboratorio.json'
