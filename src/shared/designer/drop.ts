// Dove finisce un elemento rilasciato nel canvas del designer (logica pura, senza DOM).
// Regole, come negli editor visuali (Webflow, Framer):
// - sopra lo spazio libero o il padding di un contenitore si inserisce DENTRO, accanto al figlio più vicino;
// - prima/dopo il contenitore solo in una fascia sottile vicino al suo bordo esterno (o tenendo Alt);
// - sopra un elemento che non contiene altro, prima/dopo secondo la metà, sull'asse del genitore
//   (la X nelle righe flex e nelle griglie, la Y altrove);
// - il fondo del body resta sopra gli <script> finali.
import type { InsertPosition } from './html-edit'
import { FREE_CANVAS_CLASS, hasClass, type ElementInfo, type HtmlModel } from './html-model'

export type Axis = 'vertical' | 'horizontal'

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export interface DropTarget {
  id: number
  where: InsertPosition
}

/** Tag che possono ricevere altri elementi trascinati dentro. */
export const CONTAINER_TAGS = new Set(['body', 'main', 'section', 'div', 'article', 'header', 'footer', 'nav', 'form', 'ul', 'ol', 'aside', 'figure', 'blockquote', 'details', 'fieldset'])

/** Figli che non si vedono: non contano come vicini e restano in fondo (gli script finali). */
export const NON_VISUAL_TAGS = new Set(['script', 'style', 'link', 'meta', 'template', 'noscript', 'title', 'base'])

export function canContain(element: ElementInfo | undefined): boolean {
  return !!element && CONTAINER_TAGS.has(element.tag) && element.endTagStart !== null
}

/** Asse lungo cui si dispongono i figli di un elemento, dai valori calcolati di display e simili. */
export function flowAxis(style: { display: string; flexDirection?: string; gridTemplateColumns?: string; gridAutoFlow?: string }): Axis {
  const display = style.display ?? ''
  if (display.includes('flex')) return (style.flexDirection ?? 'row').startsWith('row') ? 'horizontal' : 'vertical'
  if (display.includes('grid')) {
    if ((style.gridAutoFlow ?? '').startsWith('column')) return 'horizontal'
    return gridColumns(style.gridTemplateColumns ?? '') > 1 ? 'horizontal' : 'vertical'
  }
  return 'vertical'
}

/** Numero di colonne di un valore calcolato di grid-template-columns ("300px 300px" → 2). */
export function gridColumns(value: string): number {
  // I nomi di linea ([a]) non sono colonne; le funzioni (minmax(…), repeat(…)) contano come una sola.
  const text = value.replace(/\[[^\]]*\]/g, ' ').trim()
  if (!text || text === 'none') return 1
  let depth = 0
  let count = 0
  let inToken = false
  for (const char of text) {
    if (char === '(') depth++
    else if (char === ')') depth--
    if (/\s/.test(char) && depth === 0) {
      inToken = false
      continue
    }
    if (!inToken) {
      inToken = true
      count++
    }
  }
  return Math.max(1, count)
}

/** Figli visibili di un contenitore (niente script, stili e l'elemento trascinato). */
export function visualChildren(model: HtmlModel, id: number, exclude?: number): number[] {
  return (model.elements[id]?.children ?? []).filter((c) => c !== exclude && !NON_VISUAL_TAGS.has(model.elements[c]!.tag))
}

/** In coda a un contenitore: dopo l'ultimo figlio visibile, quindi sempre prima degli script finali. */
export function appendTarget(model: HtmlModel, container: number, exclude?: number): DropTarget {
  const children = visualChildren(model, container, exclude)
  if (children.length) return { id: children[children.length - 1]!, where: 'after' }
  const all = model.elements[container]?.children ?? []
  const firstHidden = all.find((c) => c !== exclude && NON_VISUAL_TAGS.has(model.elements[c]!.tag) && model.elements[c]!.tag === 'script')
  if (firstHidden !== undefined && model.elements[container]!.tag === 'body') return { id: firstHidden, where: 'before' }
  return { id: container, where: 'inside-end' }
}

/** Il contenitore che riceverà l'elemento. */
export function targetParent(model: HtmlModel, target: DropTarget): number | null {
  return target.where === 'before' || target.where === 'after' ? (model.elements[target.id]?.parent ?? null) : target.id
}

export interface DropQuery {
  model: HtmlModel
  /** Elemento sotto il puntatore (già escluso l'elemento trascinato e i suoi discendenti). */
  hit: number
  x: number
  y: number
  rectOf: (id: number) => Box | null
  /** Asse dei figli di un elemento. */
  axisOf: (id: number) => Axis
  /** Spessore (px del documento) della fascia vicino al bordo esterno che vale «prima/dopo il contenitore». */
  edge: number
  /** Alt: prima/dopo l'elemento colpito anche se è un contenitore. */
  outside?: boolean
  exclude?: number
}

/**
 * Distanza dal puntatore: prima conta la riga (Y), poi la X. Così nel padding in fondo a una colonna
 * vince l'ultimo figlio anche se è stretto e centrato, e in una griglia a più righe vince la riga giusta.
 */
function distance(x: number, y: number, box: Box): [number, number] {
  const dx = Math.max(box.left - x, 0, x - (box.left + box.width))
  const dy = Math.max(box.top - y, 0, y - (box.top + box.height))
  return [dy, dx]
}

const closer = (a: [number, number], b: [number, number]) => a[0] < b[0] - 0.5 || (Math.abs(a[0] - b[0]) <= 0.5 && a[1] < b[1])

/** Stesso «tipo» (tag e classi): due schede di una griglia, due voci di un elenco. */
function sameKind(a: ElementInfo, b: ElementInfo): boolean {
  return a.tag === b.tag && (a.attrs['class'] ?? '').trim() === (b.attrs['class'] ?? '').trim()
}

/**
 * Trascinando una scheda sopra una scheda sorella dello stesso tipo si vuole riordinare, non annidare:
 * restituisce quella sorella (o null) risalendo dall'elemento colpito.
 */
function similarSibling(model: HtmlModel, hit: number, dragged: number | undefined): number | null {
  if (dragged === undefined) return null
  const moving = model.elements[dragged]
  if (!moving) return null
  let current: number | null = hit
  while (current !== null) {
    const element: ElementInfo = model.elements[current]!
    if (element.parent === moving.parent && current !== dragged) return sameKind(element, moving) ? current : null
    current = element.parent
  }
  return null
}

function beforeOrAfter(id: number, box: Box, axis: Axis, x: number, y: number): DropTarget {
  const first = axis === 'horizontal' ? x < box.left + box.width / 2 : y < box.top + box.height / 2
  return { id, where: first ? 'before' : 'after' }
}

/** Dentro un contenitore: davanti o dopo il figlio visibile più vicino al puntatore, o in coda. */
export function insideTarget(query: DropQuery, container: number): DropTarget {
  const { model, x, y, rectOf, axisOf, exclude } = query
  let best: { id: number; box: Box; d: [number, number] } | null = null
  for (const child of visualChildren(model, container, exclude)) {
    const box = rectOf(child)
    if (!box || (box.width === 0 && box.height === 0)) continue
    const d = distance(x, y, box)
    if (!best || closer(d, best.d)) best = { id: child, box, d }
  }
  if (!best) return appendTarget(model, container, exclude)
  return beforeOrAfter(best.id, best.box, axisOf(container), x, y)
}

export function decideDrop(query: DropQuery): DropTarget | null {
  const { model, x, y, rectOf, axisOf } = query
  if (!model.elements[query.hit]) return null
  // Una sorella dello stesso tipo (scheda su scheda) si tratta come un elemento semplice: si riordina.
  const sibling = similarSibling(model, query.hit, query.exclude)
  const hit = sibling ?? query.hit
  const element = model.elements[hit]!
  const parent = element.parent
  const isBody = element.tag === 'body'
  if (isBody) return insideTarget(query, hit)
  const box = rectOf(hit)
  if (!box) return null
  const parentAxis: Axis = parent !== null ? axisOf(parent) : 'vertical'
  if (canContain(element) && !query.outside && sibling === null) {
    const size = parentAxis === 'horizontal' ? box.width : box.height
    const band = Math.min(query.edge, size * 0.25)
    const offset = parentAxis === 'horizontal' ? x - box.left : y - box.top
    if (parent !== null && offset < band) return { id: hit, where: 'before' }
    if (parent !== null && size - offset < band) return { id: hit, where: 'after' }
    return insideTarget(query, hit)
  }
  return beforeOrAfter(hit, box, parentAxis, x, y)
}

// ---------------------------------------------------------------- tavole libere

/** Il genitore (dopo lo spostamento) è una tavola libera? */
export function landsInFreeCanvas(model: HtmlModel, target: DropTarget): boolean {
  const parent = targetParent(model, target)
  return parent !== null && hasClass(model.elements[parent]!, FREE_CANVAS_CLASS)
}

export const FREE_PROPS = ['position', 'left', 'top', 'width', 'height', 'z-index'] as const

/**
 * Dichiarazioni da scrivere quando un elemento entra in una tavola (diventa libero) o ne esce
 * (torna nel flusso): null = nessun cambiamento.
 */
export function freeStyleChange(wasFree: boolean, nowFree: boolean, box?: { left: number; top: number; width?: number }): Record<string, string | null> | null {
  if (wasFree === nowFree) return null
  if (nowFree) {
    const out: Record<string, string | null> = { position: 'absolute', left: `${Math.round(box?.left ?? 24)}px`, top: `${Math.round(box?.top ?? 24)}px` }
    if (box?.width) out['width'] = `${Math.round(box.width)}px`
    return out
  }
  return Object.fromEntries(FREE_PROPS.map((p) => [p, null]))
}

/** Quanto di un elemento più grande della tavola deve restare comunque visibile (px). */
const MIN_VISIBLE = 40

function clampAxis(position: number, size: number, available: number): number {
  // Ci sta: tutto dentro. Più grande della tavola: può sbordare, ma ne resta sempre un pezzo visibile.
  if (size <= available) return Math.max(0, Math.min(position, available - size))
  return Math.max(-(size - MIN_VISIBLE), Math.min(position, available - MIN_VISIBLE))
}

/** Limita una posizione libera dentro la tavola (che taglia ciò che sborda). */
export function clampBox(left: number, top: number, width: number, height: number, canvasWidth: number, canvasHeight: number): { left: number; top: number } {
  return { left: clampAxis(left, width, canvasWidth), top: clampAxis(top, height, canvasHeight) }
}

// ---------------------------------------------------------------- etichette

export function elementLabel(element: ElementInfo): string {
  const id = element.attrs['id'] ? `#${element.attrs['id']}` : ''
  const cls = !id && element.attrs['class'] ? `.${element.attrs['class'].trim().split(/\s+/)[0]}` : ''
  return `${element.tag}${id}${cls}`
}

/** Punto in cui sale un elemento inserito con un clic senza selezione: il contenitore principale. */
export function defaultInsertTarget(model: HtmlModel, visibleContainer?: number | null): DropTarget | { freeIn: number } | null {
  if (model.body === null) return null
  if (visibleContainer !== undefined && visibleContainer !== null && model.elements[visibleContainer] && visibleContainer !== model.body) {
    const element = model.elements[visibleContainer]!
    if (hasClass(element, FREE_CANVAS_CLASS)) return { freeIn: visibleContainer }
    if (canContain(element)) return appendTarget(model, visibleContainer)
  }
  const main = model.elements.find((e) => e.tag === 'main' && canContain(e))
  if (main) return appendTarget(model, main.id)
  return appendTarget(model, model.body)
}
