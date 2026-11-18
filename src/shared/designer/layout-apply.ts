// «Da libero a layout» (1.7) nel designer HTML: traduce il piano neutro del canvas kit (`inferLayout`)
// in regole CSS (flex o griglia sul contenitore, posizioni tolte dai figli) e nel nuovo ordine dei figli
// nell'HTML (le righe affiancate dentro un nuovo <div>). Puro: il designer fa tutto in un'unica transazione.
import type { LayoutPlan, Padding } from '../canvas-kit/layout-infer'
import type { TextEdit } from './html-edit'
import { indentationAt, indentUnit, type HtmlModel } from './html-model'
import { NON_VISUAL_TAGS } from './drop'

export type Rule = [selector: string, declarations: Record<string, string | null>]

/** Classe dei contenitori di riga creati da «Da libero a layout». */
export const ROW_CLASS = 'lab-riga'

const px = (n: number) => `${Math.round(n)}px`
const paddingValue = (p: Padding) => (p.top === p.bottom && p.left === p.right ? (p.top === p.left ? px(p.top) : `${px(p.top)} ${px(p.left)}`) : `${px(p.top)} ${px(p.right)} ${px(p.bottom)} ${px(p.left)}`)
const ALIGN: Record<string, string> = { start: 'flex-start', center: 'center', stretch: 'stretch' }

/** Le proprietà di posizione libera che un figlio perde entrando nel layout. */
const UNFREE: Record<string, null> = { position: null, left: null, top: null, 'z-index': null, margin: null }

/**
 * Regole da scrivere. `selectorOf` dà il selettore (#id) di ciascun figlio; `rowSelector(i)` quello della
 * i-esima riga nuova. `freeCanvas`: il contenitore è una tavola (ha un'altezza fissa da liberare);
 * `positioned`: il contenitore è a sua volta libero (la sua posizione assoluta non si tocca).
 */
export function layoutRules<Id>(plan: LayoutPlan<Id>, container: string, selectorOf: (id: Id) => string, rowSelector: (index: number) => string, options: { freeCanvas: boolean; positioned?: boolean }): Rule[] {
  const rules: Rule[] = []
  // Chi resta libero (badge sopra un'immagine) ha ancora bisogno del contenitore come riferimento.
  const base: Record<string, string | null> = { 'min-height': null, padding: paddingValue(plan.padding), 'box-sizing': 'border-box' }
  if (!options.positioned) base['position'] = plan.floating.length ? 'relative' : null
  if (options.freeCanvas) base['height'] = 'auto'
  if (plan.kind === 'grid') {
    rules.push([container, { ...base, display: 'grid', 'grid-template-columns': plan.columns.join(' '), 'column-gap': px(plan.columnGap), 'row-gap': px(plan.rowGap), 'flex-direction': null, gap: null }])
    for (const id of plan.order) rules.push([selectorOf(id), { ...UNFREE, width: null }])
    return rules
  }
  rules.push([
    container,
    {
      ...base,
      display: 'flex',
      'flex-direction': plan.direction,
      gap: px(plan.gap),
      'justify-content': plan.justify === 'space-between' ? 'space-between' : null,
      'align-items': ALIGN[plan.align] ?? null,
      'grid-template-columns': null
    }
  ])
  let row = 0
  for (const child of plan.children) {
    if (child.kind === 'item') {
      rules.push([selectorOf(child.id), child.fill ? { ...UNFREE, width: null, 'align-self': 'stretch' } : { ...UNFREE }])
      continue
    }
    rules.push([rowSelector(row++), { display: 'flex', gap: px(child.gap), 'align-items': ALIGN[child.align] ?? 'flex-start' }])
    for (const id of child.items) rules.push([selectorOf(id), { ...UNFREE, 'flex-shrink': '0' }])
  }
  return rules
}

/** Quante righe nuove crea il piano (servono altrettanti id). */
export const newRowCount = <Id>(plan: LayoutPlan<Id>): number => (plan.kind === 'stack' ? plan.children.filter((c) => c.kind === 'row').length : 0)

/**
 * Il nuovo contenuto del contenitore: i figli nell'ordine del piano (le righe dentro `<div class="lab-riga">`),
 * poi quelli che restano liberi e quelli che non si vedono (script, stili) nell'ordine di prima.
 * Il testo sparso fra i figli (solo spazi, di solito) non si conserva.
 */
export function layoutHtmlEdit(model: HtmlModel, container: number, plan: LayoutPlan<number>, rowIds: readonly string[]): TextEdit | null {
  const element = model.elements[container]
  if (!element || element.endTagStart === null) return null
  const source = model.source
  const unit = indentUnit(source)
  const outer = indentationAt(source, element.start)
  const inner = outer + unit
  const textOf = (id: number) => source.slice(model.elements[id]!.start, model.elements[id]!.end)
  // Ogni figlio riceve il rientro del suo nuovo livello (le righe interne del figlio si spostano con lui).
  const reindent = (id: number, indent: string) => {
    const own = indentationAt(source, model.elements[id]!.start)
    return textOf(id)
      .split('\n')
      .map((line, i) => (i === 0 ? indent + line : line.startsWith(own) ? indent + line.slice(own.length) : line))
      .join('\n')
  }
  const placed = new Set<number>()
  const parts: string[] = []
  if (plan.kind === 'grid') {
    for (const id of plan.order) {
      parts.push(reindent(id, inner))
      placed.add(id)
    }
  } else {
    let row = 0
    for (const child of plan.children) {
      if (child.kind === 'item') {
        parts.push(reindent(child.id, inner))
        placed.add(child.id)
        continue
      }
      const rowId = rowIds[row++] ?? `riga-${row}`
      const items = child.items.map((id) => {
        placed.add(id)
        return reindent(id, inner + unit)
      })
      parts.push(`${inner}<div id="${rowId}" class="${ROW_CLASS}">\n${items.join('\n')}\n${inner}</div>`)
    }
  }
  for (const id of element.children) if (!placed.has(id)) parts.push(reindent(id, inner))
  const text = `\n${parts.join('\n')}\n${outer}`
  return { start: element.startTagEnd, end: element.endTagStart, text }
}

/** I figli di un contenitore che «Da libero a layout» sistema: visibili e liberi. */
export function layoutCandidates(model: HtmlModel, container: number, isFree: (id: number) => boolean): number[] {
  return (model.elements[container]?.children ?? []).filter((id) => !NON_VISUAL_TAGS.has(model.elements[id]!.tag) && isFree(id))
}
