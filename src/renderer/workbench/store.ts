// Stato condiviso del workbench. Ogni modulo può leggerlo; lo scrive solo chi ne è proprietario
// (commento accanto a ogni campo). Selettori sempre primitivi o con useShallow.
import { create } from 'zustand'
import { DEFAULT_SETTINGS, type Settings } from '@shared/contracts/settings'
import type { EditorRange } from '@shared/contracts/editor'
import type { FileEntry, ProjectInfo } from '@shared/contracts/workspace'

export interface CursorInfo {
  line: number
  column: number
}

/** Voce della barra di stato aggiunta da un modulo (es. stato dell'AI). */
export interface StatusItem {
  id: string
  text: string
  title?: string
  command?: string
  tone?: 'normal' | 'busy' | 'warning'
}

interface WorkbenchState {
  /** workspace (explorer) */
  project: ProjectInfo | null
  tree: FileEntry[]
  /** workbench */
  settings: Settings
  paletteOpen: boolean
  paletteMode: 'commands' | 'files'
  /** editor */
  activeFile: string | null
  cursor: CursorInfo | null
  /** Selezione non vuota nel file attivo (null se non c'è). */
  selection: EditorRange | null
  dirty: string[]
  problems: { errors: number; warnings: number }
  /** moduli */
  statusItems: StatusItem[]

  setProject: (project: ProjectInfo | null) => void
  setTree: (tree: FileEntry[]) => void
  setSettings: (settings: Settings) => void
  setPaletteOpen: (open: boolean, mode?: 'commands' | 'files') => void
  setActiveFile: (path: string | null) => void
  setCursor: (cursor: CursorInfo | null) => void
  setSelection: (selection: EditorRange | null) => void
  setDirty: (path: string, dirty: boolean) => void
  clearDirty: () => void
  setProblems: (problems: { errors: number; warnings: number }) => void
  setStatusItem: (item: StatusItem) => void
  removeStatusItem: (id: string) => void
}

export const useWorkbench = create<WorkbenchState>((set) => ({
  project: null,
  tree: [],
  settings: DEFAULT_SETTINGS,
  paletteOpen: false,
  paletteMode: 'commands',
  activeFile: null,
  cursor: null,
  selection: null,
  dirty: [],
  problems: { errors: 0, warnings: 0 },
  statusItems: [],

  setProject: (project) => set({ project }),
  setTree: (tree) => set({ tree }),
  setSettings: (settings) => set({ settings }),
  setPaletteOpen: (paletteOpen, mode) => set((state) => ({ paletteOpen, paletteMode: mode ?? (paletteOpen ? state.paletteMode : 'commands') })),
  setActiveFile: (activeFile) => set({ activeFile }),
  setCursor: (cursor) => set({ cursor }),
  setSelection: (selection) =>
    set((state) => {
      const prev = state.selection
      const same = prev === selection || (!!prev && !!selection && prev.startLine === selection.startLine && prev.startColumn === selection.startColumn && prev.endLine === selection.endLine && prev.endColumn === selection.endColumn)
      return same ? state : { selection }
    }),
  setDirty: (path, dirty) =>
    set((state) => {
      const has = state.dirty.includes(path)
      if (dirty === has) return state
      return { dirty: dirty ? [...state.dirty, path] : state.dirty.filter((p) => p !== path) }
    }),
  clearDirty: () => set({ dirty: [] }),
  setProblems: (problems) => set({ problems }),
  setStatusItem: (item) => set((state) => ({ statusItems: [...state.statusItems.filter((i) => i.id !== item.id), item] })),
  removeStatusItem: (id) => set((state) => ({ statusItems: state.statusItems.filter((i) => i.id !== id) }))
}))

export const workbench = () => useWorkbench.getState()
