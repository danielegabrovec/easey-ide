// Stato della tela che vale solo nell'editor, mai scritto nell'HTML o nel CSS dell'utente:
// strumento di disegno attivo, righelli accesi, guide trascinate dai righelli, elementi nascosti (occhio)
// e bloccati (lucchetto) nei Livelli. Guide, nascosti e bloccati si ricordano per file (localStorage).
import { create } from 'zustand'
import type { DrawTool } from '@shared/canvas-kit/draw'
import type { ElementInfo, HtmlModel } from '@shared/designer/html-model'
import { elementForViewKey, migrateViewKeys, viewKey } from '@shared/designer/view-keys'
import { workbench } from '../../workbench/store'
import { useDesigner } from './designer-store'

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
  /** Occhio / lucchetto di un elemento (si confronta l'elemento, non il testo della chiave). */
  toggleHidden: (element: ElementInfo, model: HtmlModel) => void
  toggleLocked: (element: ElementInfo, model: HtmlModel) => void
  /** Il modello della pagina è cambiato: le chiavi `@percorso` degli elementi che ora hanno un id diventano `#id`. */
  migrate: (model: HtmlModel) => void
}

const RULERS_KEY = 'easey.designer.rulers'
const NO_GUIDES: UserGuides = { xs: [], ys: [] }
const NONE: string[] = []

export { viewKey }

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
  const toggle = (list: string[], element: ElementInfo, model: HtmlModel) => {
    const kept = list.filter((key) => elementForViewKey(model, key)?.id !== element.id)
    return kept.length !== list.length ? kept : [...list, viewKey(element)]
  }
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
    toggleHidden: (element, model) => {
      set({ hidden: toggle(get().hidden, element, model) })
      persist()
    },
    toggleLocked: (element, model) => {
      set({ locked: toggle(get().locked, element, model) })
      persist()
    },
    migrate: (model) => {
      const { hidden, locked } = get()
      const nextHidden = migrateViewKeys(hidden, model) as string[]
      const nextLocked = migrateViewKeys(locked, model) as string[]
      if (nextHidden === hidden && nextLocked === locked) return
      set({ hidden: nextHidden, locked: nextLocked })
      persist()
    }
  }
})

// Ogni pagina rianalizzata (dopo una modifica del designer o del codice): le chiavi seguono gli id nuovi.
useDesigner.subscribe((state, previous) => {
  if (state.html && state.html !== previous.html && state.path === useCanvasView.getState().file) useCanvasView.getState().migrate(state.html)
})
