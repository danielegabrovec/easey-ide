// Stato del designer: pagina aperta, modello analizzato, selezione, punto di interruzione, bersaglio degli stili.
import { create } from 'zustand'
import type { Breakpoint } from '@shared/designer/css-edit'
import { findByAttrId, findByPath, type ElementInfo, type HtmlModel } from '@shared/designer/html-model'

/** Come ritrovare l'elemento selezionato dopo una modifica: per id, altrimenti per percorso. */
export interface SelectionKey {
  attrId?: string
  path: number[]
}

export type StyleTarget = 'id' | 'class' | 'inline'

interface DesignerState {
  path: string | null
  html: HtmlModel | null
  css: Record<string, string>
  stylesheet: string | null
  selection: SelectionKey | null
  hoverId: number | null
  breakpoint: Breakpoint
  target: StyleTarget
  targetClass: string
  leftTab: 'palette' | 'layers'
  rightTab: 'style' | 'element' | 'site'
  /** Ricerca nella palette (resta mentre si passa ai Livelli e si torna). */
  paletteQuery: string
  /** Quante proprietà ha lo stile copiato (0 = niente da incollare). */
  styleClipboard: number
  /** Dopo il prossimo ridisegno del canvas, porta in vista l'elemento selezionato (es. appena inserito). */
  revealSelection: boolean
  /** Zoom scelto: null = «adatta» (la pagina entra in larghezza), altrimenti la scala (1 = 100 %). */
  zoom: number | null
  /** Scala effettiva del canvas (quella di «adatta» quando zoom è null), mostrata nella barra. */
  viewScale: number
  /** Scala che avrebbe «adatta» con lo spazio di adesso (per l’etichetta del menu dello zoom). */
  viewFit: number
  /** Cresce a ogni pagina ridisegnata nel canvas: chi legge gli stili calcolati (ispettore, ritocchi) si aggiorna. */
  canvasVersion: number
  canvasLoaded: () => void
  setZoom: (zoom: number | null) => void
  setViewScale: (scale: number, fit: number) => void
  setRevealSelection: (reveal: boolean) => void
  setPaletteQuery: (query: string) => void
  setStyleClipboard: (count: number) => void
  setPage: (path: string | null) => void
  setParsed: (html: HtmlModel, css: Record<string, string>, stylesheet: string | null) => void
  select: (key: SelectionKey | null) => void
  selectElement: (element: ElementInfo | null) => void
  setHover: (id: number | null) => void
  setBreakpoint: (breakpoint: Breakpoint) => void
  setTarget: (target: StyleTarget, targetClass?: string) => void
  setLeftTab: (tab: DesignerState['leftTab']) => void
  setRightTab: (tab: DesignerState['rightTab']) => void
}

export function keyOf(element: ElementInfo): SelectionKey {
  return element.attrs['id'] ? { attrId: element.attrs['id'], path: element.path } : { path: element.path }
}

export function resolveSelection(html: HtmlModel | null, key: SelectionKey | null): ElementInfo | null {
  if (!html || !key) return null
  return (key.attrId ? findByAttrId(html, key.attrId) : null) ?? findByPath(html, key.path)
}

export const useDesigner = create<DesignerState>((set) => ({
  path: null,
  html: null,
  css: {},
  stylesheet: null,
  selection: null,
  hoverId: null,
  breakpoint: 'desktop',
  target: 'id',
  targetClass: '',
  leftTab: 'palette',
  rightTab: 'style',
  paletteQuery: '',
  styleClipboard: 0,
  revealSelection: false,
  zoom: null,
  viewScale: 1,
  viewFit: 1,
  canvasVersion: 0,
  canvasLoaded: () => set((state) => ({ canvasVersion: state.canvasVersion + 1 })),
  setZoom: (zoom) => set({ zoom }),
  setViewScale: (viewScale, viewFit) => set({ viewScale, viewFit }),
  setRevealSelection: (revealSelection) => set({ revealSelection }),
  setPaletteQuery: (paletteQuery) => set({ paletteQuery }),
  setStyleClipboard: (styleClipboard) => set({ styleClipboard }),
  setPage: (path) => set({ path, html: null, selection: null, hoverId: null }),
  setParsed: (html, css, stylesheet) => set({ html, css, stylesheet }),
  select: (selection) => set({ selection }),
  selectElement: (element) => set({ selection: element ? keyOf(element) : null }),
  setHover: (hoverId) => set({ hoverId }),
  setBreakpoint: (breakpoint) => set({ breakpoint }),
  setTarget: (target, targetClass) => set((state) => ({ target, targetClass: targetClass ?? state.targetClass })),
  setLeftTab: (leftTab) => set({ leftTab }),
  setRightTab: (rightTab) => set({ rightTab })
}))

export function selectedElement(): ElementInfo | null {
  const { html, selection } = useDesigner.getState()
  return resolveSelection(html, selection)
}
