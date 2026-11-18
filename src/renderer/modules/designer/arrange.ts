// Allinea, distribuisci, stessa misura, livelli e «Da libero a layout»: misure prese nel canvas,
// calcoli del canvas kit, scrittura in un unico passo annullabile (actions.ts). Elementi in fila nella
// selezione: si propone «Mettili liberi e allinea» (misura poi stacca, nessun salto).
import { alignRects, distributeRects, matchSize, paintOrder, restack, zIndexes, type AlignMode, type DistributeAxis, type RestackOp } from '@shared/canvas-kit/align'
import type { Rect } from '@shared/canvas-kit/geometry'
import { inferLayout } from '@shared/canvas-kit/layout-infer'
import { isFreeElement, type ElementInfo } from '@shared/designer/html-model'
import { layoutCandidates } from '@shared/designer/layout-apply'
import { t } from '../../i18n'
import { choose } from '../../ui/dialogs'
import { notify } from '../../workbench/notifications'
import { applyFreeLayout, placeFreeBoxes, setElementRules, type FreePlacement } from './actions'
import { selectedElements, useDesigner } from './designer-store'
import { canvasFrame } from './frame-access'

interface Measured {
  element: ElementInfo
  node: HTMLElement
  free: boolean
  /** Rispetto al contenitore (px della pagina). */
  local: Rect
  /** Nella finestra del canvas (stesso spazio per tutti, anche con contenitori diversi). */
  view: Rect
  containerHeight: number
}

function nodeOf(id: number): HTMLElement | null {
  return (canvasFrame()?.contentDocument?.querySelector(`[data-lab-id="${id}"]`) as HTMLElement | null) ?? null
}

function measure(element: ElementInfo): Measured | null {
  const page = useDesigner.getState().html
  const node = nodeOf(element.id)
  const parent = node?.parentElement
  if (!page || !node || !parent) return null
  const r = node.getBoundingClientRect()
  const p = parent.getBoundingClientRect()
  const free = isFreeElement(page, element.id)
  const view = { left: r.left, top: r.top, width: r.width, height: r.height }
  const local = free ? { left: node.offsetLeft, top: node.offsetTop, width: node.offsetWidth, height: node.offsetHeight } : { left: r.left - p.left - parent.clientLeft, top: r.top - p.top - parent.clientTop, width: r.width, height: r.height }
  return { element, node, free, local, view, containerHeight: parent.offsetHeight }
}

function measureSelection(): Measured[] {
  return selectedElements()
    .filter((e) => !['html', 'head', 'body'].includes(e.tag))
    .map(measure)
    .filter((m): m is Measured => !!m)
}

/** Ci sono elementi in fila? Chiede se renderli liberi (false = annullato). */
async function confirmMakeFree(items: Measured[]): Promise<boolean> {
  if (items.every((m) => m.free)) return true
  const answer = await choose<'free'>({
    title: t('designer.arrangeFlowTitle'),
    message: t('designer.arrangeFlowMessage', { n: items.filter((m) => !m.free).length }),
    choices: [{ value: 'free', label: t('designer.arrangeMakeFree'), testId: 'arrange-make-free' }]
  })
  return answer === 'free'
}

/** Riporta nel contenitore di ciascuno i riquadri calcolati nello spazio della finestra. */
function placements(items: Measured[], moved: Rect[], withSize = false): FreePlacement[] {
  return items.map((m, i) => {
    const target = moved[i]!
    const place: FreePlacement = { id: m.element.id, left: m.local.left + (target.left - m.view.left), top: m.local.top + (target.top - m.view.top) }
    if (withSize || !m.free) place.width = target.width
    if (withSize) place.height = target.height
    if (!m.free) place.makeFree = { containerHeight: m.containerHeight }
    return place
  })
}

/** Allinea la selezione (con un elemento solo: al suo contenitore). */
export async function alignSelection(mode: AlignMode): Promise<void> {
  const items = measureSelection()
  if (!items.length || !(await confirmMakeFree(items))) return
  if (items.length === 1) {
    const m = items[0]!
    const parent = m.node.parentElement!
    const [moved] = alignRects([m.local], mode, { width: parent.clientWidth, height: parent.clientHeight })
    await placeFreeBoxes([{ id: m.element.id, left: moved!.left, top: moved!.top, ...(m.free ? {} : { width: m.local.width, makeFree: { containerHeight: m.containerHeight } }) }])
    return
  }
  await placeFreeBoxes(placements(items, alignRects(items.map((m) => m.view), mode)))
}

export async function distributeSelection(axis: DistributeAxis): Promise<void> {
  const items = measureSelection()
  if (items.length < 3) {
    notify(t('designer.distributeNeedThree'), 'info')
    return
  }
  if (!(await confirmMakeFree(items))) return
  await placeFreeBoxes(placements(items, distributeRects(items.map((m) => m.view), axis)))
}

/** Stessa larghezza o altezza del principale (non serve renderli liberi). */
export async function matchSelectionSize(dimension: 'width' | 'height'): Promise<void> {
  const items = measureSelection()
  if (items.length < 2) return
  const sized = matchSize(items.map((m) => m.view), dimension)
  await setElementRules(items.slice(1).map((m, i) => ({ id: m.element.id, declarations: { [dimension]: `${Math.round(sized[i + 1]![dimension])}px` } })))
}

const zOf = (node: HTMLElement): number | null => {
  const value = node.ownerDocument.defaultView?.getComputedStyle(node).zIndex
  return value && value !== 'auto' ? Number(value) : null
}

/** Livelli fra i fratelli liberi: avanti, indietro, in cima, in fondo (z-index 1, 2, 3…). */
export async function restackSelection(op: RestackOp): Promise<void> {
  const page = useDesigner.getState().html
  if (!page) return
  const chosen = selectedElements().filter((e) => isFreeElement(page, e.id))
  if (!chosen.length) {
    notify(t('designer.restackOnlyFree'), 'info')
    return
  }
  const entries: { id: number; declarations: Record<string, string | null> }[] = []
  const parents = [...new Set(chosen.map((e) => e.parent).filter((p): p is number => p !== null))]
  for (const parentId of parents) {
    const siblings = page.elements[parentId]!.children.filter((c) => isFreeElement(page, c) && nodeOf(c))
    const order = paintOrder(siblings, (id) => zOf(nodeOf(id)!))
    const next = restack(order, new Set(chosen.map((e) => e.id)), op)
    for (const [id, z] of zIndexes(next, (id) => zOf(nodeOf(id)!))) entries.push({ id, declarations: { 'z-index': String(z) } })
  }
  await setElementRules(entries)
}

/** Il contenitore si può sistemare con «Da libero a layout»? (Ha figli liberi e non è il body.) */
export function canInferLayout(element: ElementInfo | null): boolean {
  const page = useDesigner.getState().html
  if (!page || !element || ['body', 'html', 'head'].includes(element.tag)) return false
  return layoutCandidates(page, element.id, (id) => isFreeElement(page, id)).length > 0
}

/** «Da libero a layout» sul contenitore: misura i figli liberi, propone il layout e lo scrive. */
export async function freeToLayout(element: ElementInfo): Promise<void> {
  const page = useDesigner.getState().html
  const node = nodeOf(element.id)
  if (!page || !node) return
  const ids = layoutCandidates(page, element.id, (id) => isFreeElement(page, id))
  const items = ids
    .map((id) => ({ id, node: nodeOf(id) }))
    .filter((m): m is { id: number; node: HTMLElement } => !!m.node && m.node.offsetWidth + m.node.offsetHeight > 0)
    .map(({ id, node: child }) => ({ id, rect: { left: child.offsetLeft, top: child.offsetTop, width: child.offsetWidth, height: child.offsetHeight } }))
  const plan = inferLayout({ container: { width: node.clientWidth, height: node.clientHeight }, items })
  if (!plan) {
    notify(t('designer.layoutNothing'), 'info')
    return
  }
  await applyFreeLayout(element.id, plan)
}
