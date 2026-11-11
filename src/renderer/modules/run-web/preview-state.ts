// Stato dell'anteprima web: quale pagina, quando ricaricarla, quale dispositivo simulare.
import { create } from 'zustand'
import { ide } from '../../ipc'
import { notifyError } from '../../workbench/notifications'
import { useConsole } from './console-store'

export interface Viewport {
  id: string
  label: string
  width?: number
  height?: number
}

export const VIEWPORTS: Viewport[] = [
  { id: 'fit', label: 'Adatta' },
  { id: 'phone', label: 'Telefono', width: 375, height: 740 },
  { id: 'tablet', label: 'Tablet', width: 768, height: 1024 },
  { id: 'laptop', label: 'Portatile', width: 1280, height: 800 }
]

interface PreviewState {
  entry: string | null
  url: string | null
  viewport: string
  clearOnRun: boolean
  filter: 'all' | 'error' | 'warn' | 'log'
  setViewport: (viewport: string) => void
  setClearOnRun: (value: boolean) => void
  setFilter: (filter: PreviewState['filter']) => void
  load: (entry: string) => Promise<void>
  reset: () => void
}

export const usePreview = create<PreviewState>((set, get) => ({
  entry: null,
  url: null,
  viewport: 'fit',
  clearOnRun: true,
  filter: 'all',
  setViewport: (viewport) => set({ viewport }),
  setClearOnRun: (clearOnRun) => set({ clearOnRun }),
  setFilter: (filter) => set({ filter }),
  load: async (entry) => {
    try {
      const url = await ide.invoke('preview:url', entry)
      if (get().clearOnRun) useConsole.getState().clear()
      set({ entry, url })
    } catch (error) {
      notifyError(error)
    }
  },
  reset: () => set({ entry: null, url: null })
}))

let frame: HTMLIFrameElement | null = null

export function registerFrame(element: HTMLIFrameElement | null): void {
  frame = element
}

export function currentFrameWindow(): Window | null {
  return frame?.contentWindow ?? null
}

/** Valuta un'espressione nella pagina dell'anteprima (riga di comando della console). */
export function evaluateInPreview(code: string): boolean {
  const target = currentFrameWindow()
  if (!target) return false
  target.postMessage({ __ideEval: code }, '*')
  return true
}
