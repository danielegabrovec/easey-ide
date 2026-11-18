// Stato della tela che vale solo nell'editor (1.7), mai scritto nell'HTML o nel CSS dell'utente:
// strumento di disegno attivo, righelli accesi, guide trascinate dai righelli, elementi nascosti (occhio)
// e bloccati (lucchetto) nei Livelli. Guide, nascosti e bloccati si ricordano per file (localStorage).
import { create } from 'zustand'
import type { DrawTool } from '@shared/canvas-kit/draw'
import type { ElementInfo } from '@shared/designer/html-model'
import { workbench } from '../../workbench/store'

export interface UserGuides {
  /** Guide verticali (x) e orizzontali (y), in px della pagina dall'angolo in alto a sinistra del documento. */
  xs: number[]
  ys: number[]
}

interface ViewState {
  tool: DrawTool
  rulers: boolean
  /** File a cui si riferiscono guide, nascosti e bloccati. */
  file: string | null
  guides: UserGuides
  hidden: string[]
  locked: string[]
  setTool: (tool: DrawTool) => void
  setRulers: (on: boolean) => void
  /** Carica lo stato del file aperto nel designer (null = nessuno). */
  load: (file: string | null) => void
  setGuides: (guides: UserGuides) => void
  toggleHidden: (key: string) => void
  toggleLocked: (key: string) => void
}

const RULERS_KEY = 'easey.designer.rulers'
const NO_GUIDES: UserGuides = { xs: [], ys: [] }
const NONE: string[] = []

/** Chiave stabile di un elemento per lo stato dell'editor: l'id se c'è, altrimenti il percorso. */
export const viewKey = (element: Pick<ElementInfo, 'attrs' | 'path'>): string => (element.attrs['id'] ? `#${element.attrs['id']}` : `@${element.path.join('.')}`)

function storageKey(file: string): string {
  return `easey.designer.view:${workbench().project?.root ?? ''}|${file}`
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* archiviazione non disponibile: vale per questa sessione */
  }
}

interface Saved {
  guides?: UserGuides
  hidden?: string[]
  locked?: string[]
}

const numbers = (list: unknown): number[] => (Array.isArray(list) ? list.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)) : [])
const strings = (list: unknown): string[] => (Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : [])

export const useCanvasView = create<ViewState>((set, get) => {
  const persist = () => {
    const { file, guides, hidden, locked } = get()
    if (file) write(storageKey(file), { guides, hidden, locked } satisfies Saved)
  }
  const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key])
  return {
    tool: 'select',
    rulers: read(RULERS_KEY, true),
    file: null,
    guides: NO_GUIDES,
    hidden: NONE,
    locked: NONE,
    setTool: (tool) => set({ tool }),
    setRulers: (rulers) => {
      set({ rulers })
      write(RULERS_KEY, rulers)
    },
    load: (file) => {
      if (!file) {
        set({ file: null, guides: NO_GUIDES, hidden: NONE, locked: NONE, tool: 'select' })
        return
      }
      const saved = read<Saved>(storageKey(file), {})
      set({
        file,
        tool: 'select',
        guides: { xs: numbers(saved.guides?.xs), ys: numbers(saved.guides?.ys) },
        hidden: strings(saved.hidden),
        locked: strings(saved.locked)
      })
    },
    setGuides: (guides) => {
      set({ guides })
      persist()
    },
    toggleHidden: (key) => {
      set({ hidden: toggle(get().hidden, key) })
      persist()
    },
    toggleLocked: (key) => {
      set({ locked: toggle(get().locked, key) })
      persist()
    }
  }
})
