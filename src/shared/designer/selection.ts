// Selezione multipla del designer (1.6, richiesta del titolare): il rettangolo di selezione trascinato sullo sfondo
// prende gli elementi che ci stanno dentro per intero, senza i figli di un elemento già preso (si sposta e si colora
// il contenitore, non anche ciò che contiene). Puro: le misure le passa il canvas.
import type { HtmlModel } from './html-model'
import { NON_VISUAL_TAGS } from './drop'

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** Il rettangolo fra due punti (in qualunque verso si trascini). */
export function boxBetween(a: { x: number; y: number }, b: { x: number; y: number }): Box {
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}

const contains = (outer: Box, inner: Box) =>
  inner.width > 0 && inner.height > 0 && inner.left >= outer.left && inner.top >= outer.top && inner.left + inner.width <= outer.left + outer.width && inner.top + inner.height <= outer.top + outer.height

/**
 * Gli elementi presi dal rettangolo, in ordine di pagina: quelli tutti dentro, che si vedono (niente html, head, body,
 * script…), tenendo solo i più esterni.
 */
export function marqueeHits(model: HtmlModel, marquee: Box, rectOf: (id: number) => Box | null, skip: ReadonlySet<number> = new Set()): number[] {
  const inside = new Set<number>()
  for (const element of model.elements) {
    if (['html', 'head', 'body'].includes(element.tag) || NON_VISUAL_TAGS.has(element.tag) || skip.has(element.id)) continue
    const rect = rectOf(element.id)
    if (rect && contains(marquee, rect)) inside.add(element.id)
  }
  const hasPickedAncestor = (id: number) => {
    let parent = model.elements[id]?.parent ?? null
    while (parent !== null) {
      if (inside.has(parent)) return true
      parent = model.elements[parent]?.parent ?? null
    }
    return false
  }
  return [...inside].filter((id) => !hasPickedAncestor(id)).sort((a, b) => a - b)
}

/**
 * Gli elementi dati e tutti i loro discendenti: bloccati o nascosti nei Livelli non si scelgono sulla tela
 * (né con il clic né con il rettangolo di selezione), e con loro ciò che contengono.
 */
export function withDescendants(model: HtmlModel, ids: Iterable<number>): Set<number> {
  const out = new Set<number>()
  const stack = [...ids]
  while (stack.length) {
    const id = stack.pop()!
    if (out.has(id) || !model.elements[id]) continue
    out.add(id)
    stack.push(...model.elements[id]!.children)
  }
  return out
}

/** Elementi da togliere o spostare insieme: senza quelli già dentro un altro della selezione, dal fondo della pagina. */
export function outermostLastFirst(model: HtmlModel, ids: number[]): number[] {
  const set = new Set(ids)
  const nested = (id: number) => {
    let parent = model.elements[id]?.parent ?? null
    while (parent !== null) {
      if (set.has(parent)) return true
      parent = model.elements[parent]?.parent ?? null
    }
    return false
  }
  return [...set].filter((id) => !nested(id)).sort((a, b) => b - a)
}
