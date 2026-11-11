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
