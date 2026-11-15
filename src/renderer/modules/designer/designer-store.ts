// Stato del designer: pagina aperta, modello analizzato, selezione, punto di interruzione, bersaglio degli stili.
import { create } from 'zustand'
import type { Breakpoint } from '@shared/designer/css-edit'
import type { LintIssue } from '@shared/design-kit/lint'
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
  /**
   * Selezione multipla (1.6): gli altri elementi scelti oltre a `selection` (rettangolo di selezione, Maiusc o Ctrl
   * + clic). Gli stili si applicano a tutti, Canc li toglie tutti, gli elementi liberi si spostano insieme.
   */
  others: SelectionKey[]
  hoverId: number | null
  breakpoint: Breakpoint
  target: StyleTarget
  targetClass: string
  leftTab: 'palette' | 'layers'
  rightTab: 'style' | 'element' | 'site' | 'quality'
  /** «Ritocchi consigliati» della pagina (null = non ancora controllata). */
  quality: LintIssue[] | null
  setQuality: (issues: LintIssue[] | null) => void
  /** «Sposta liberamente» (1.6): un elemento trascinato resta esattamente dove lo si lascia. Ricordato. */
  freeMove: boolean
  setFreeMove: (on: boolean) => void
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
  /** Cambia l'elemento principale (dopo una modifica): gli altri della selezione multipla restano. */
  select: (key: SelectionKey | null) => void
  /** Clic dell'utente su un elemento: solo lui (la selezione multipla si svuota). */
  selectElement: (element: ElementInfo | null) => void
  /** Selezione multipla: il primo è il principale (quello dell'ispettore). */
  setGroup: (elements: ElementInfo[]) => void
  /** Maiusc o Ctrl + clic: aggiunge o toglie un elemento dalla selezione. */
  toggleInGroup: (element: ElementInfo) => void
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

const FREE_MOVE_KEY = 'easey.designer.freeMove'
const NO_OTHERS: SelectionKey[] = []

function readFreeMove(): boolean {
  try {
    return localStorage.getItem(FREE_MOVE_KEY) === '1'
  } catch {
    return false
  }
}

export const useDesigner = create<DesignerState>((set) => ({
  path: null,
  html: null,
  css: {},
  stylesheet: null,
  selection: null,
  others: NO_OTHERS,
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
  quality: null,
  setQuality: (quality) => set({ quality }),
  freeMove: readFreeMove(),
  setFreeMove: (freeMove) => {
    set({ freeMove })
    try {
      localStorage.setItem(FREE_MOVE_KEY, freeMove ? '1' : '0')
    } catch {
      /* archiviazione non disponibile: vale per questa sessione */
    }
  },
  canvasLoaded: () => set((state) => ({ canvasVersion: state.canvasVersion + 1 })),
  setZoom: (zoom) => set({ zoom }),
  setViewScale: (viewScale, viewFit) => set({ viewScale, viewFit }),
  setRevealSelection: (revealSelection) => set({ revealSelection }),
  setPaletteQuery: (paletteQuery) => set({ paletteQuery }),
  setStyleClipboard: (styleClipboard) => set({ styleClipboard }),
  setPage: (path) => set({ path, html: null, selection: null, others: NO_OTHERS, hoverId: null }),
  setParsed: (html, css, stylesheet) => set({ html, css, stylesheet }),
  // Lo stesso elenco vuoto ogni volta: chi osserva `others` non si ridisegna a ogni clic.
  select: (selection) => set((state) => ({ selection, others: !state.others.length ? state.others : selection ? state.others.filter((key) => !sameKey(key, selection)) : NO_OTHERS })),
  selectElement: (element) => set((state) => ({ selection: element ? keyOf(element) : null, others: state.others.length ? NO_OTHERS : state.others })),
  setGroup: (elements) => set({ selection: elements[0] ? keyOf(elements[0]) : null, others: elements.slice(1).map(keyOf) }),
  toggleInGroup: (element) =>
    set((state) => {
      const key = keyOf(element)
      const all = [...(state.selection ? [state.selection] : []), ...state.others]
      const next = all.some((k) => sameKey(k, key)) ? all.filter((k) => !sameKey(k, key)) : [...all, key]
      return { selection: next[0] ?? null, others: next.slice(1) }
    }),
  setHover: (hoverId) => set({ hoverId }),
  setBreakpoint: (breakpoint) => set({ breakpoint }),
  setTarget: (target, targetClass) => set((state) => ({ target, targetClass: targetClass ?? state.targetClass })),
  setLeftTab: (leftTab) => set({ leftTab }),
  setRightTab: (rightTab) => set({ rightTab })
}))

const sameKey = (a: SelectionKey, b: SelectionKey) => (a.attrId && b.attrId ? a.attrId === b.attrId : a.path.join('/') === b.path.join('/'))

/** Tutti gli elementi scelti (il principale per primo), quelli che esistono ancora. */
export function selectedElements(): ElementInfo[] {
  const { html, selection, others } = useDesigner.getState()
  const list = [selection, ...others].map((key) => resolveSelection(html, key)).filter((e): e is ElementInfo => !!e)
  return list.filter((element, index) => list.findIndex((e) => e.id === element.id) === index)
}

export function selectedElement(): ElementInfo | null {
  const { html, selection } = useDesigner.getState()
  return resolveSelection(html, selection)
}
