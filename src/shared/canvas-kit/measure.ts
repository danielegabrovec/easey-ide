// Misure stile Figma: mentre si sposta un elemento, le distanze in px verso il vicino più prossimo
// in ogni direzione (o verso il bordo del contenitore); con Alt sopra un altro elemento, le distanze
// fra i due. Pure: il canvas disegna i segmenti e le etichette.
import { bottom, centerX, centerY, overlap, right, type Rect, type Size } from './geometry'

/** Segmento di misura: lungo `axis` da `from` a `to`, all'altezza/ascissa `at`; `value` = lunghezza in px. */
export interface Measure {
  axis: 'x' | 'y'
  from: number
  to: number
  at: number
  value: number
}

const seg = (axis: 'x' | 'y', from: number, to: number, at: number): Measure => ({ axis, from, to, at, value: Math.round(to - from) })

/**
 * Distanze dal riquadro al vicino più prossimo a sinistra, destra, sopra e sotto (solo i vicini che
 * «si vedono», cioè si sovrappongono sull'altro asse); se non c'è vicino, al bordo del contenitore.
 */
export function nearestDistances(box: Rect, siblings: readonly Rect[], container: Size): Measure[] {
  const out: Measure[] = []
  const rowMates = siblings.filter((s) => overlap(s.top, bottom(s), box.top, bottom(box)) > 0)
  const colMates = siblings.filter((s) => overlap(s.left, right(s), box.left, right(box)) > 0)
  const cy = centerY(box)
  const cx = centerX(box)

  const leftN = rowMates.filter((s) => right(s) <= box.left).sort((a, b) => right(b) - right(a))[0]
  const leftEdge = leftN ? right(leftN) : 0
  if (box.left - leftEdge > 0) out.push(seg('x', leftEdge, box.left, cy))

  const rightN = rowMates.filter((s) => s.left >= right(box)).sort((a, b) => a.left - b.left)[0]
  const rightEdge = rightN ? rightN.left : container.width
  if (rightEdge - right(box) > 0) out.push(seg('x', right(box), rightEdge, cy))

  const upN = colMates.filter((s) => bottom(s) <= box.top).sort((a, b) => bottom(b) - bottom(a))[0]
  const upEdge = upN ? bottom(upN) : 0
  if (box.top - upEdge > 0) out.push(seg('y', upEdge, box.top, cx))

  const downN = colMates.filter((s) => s.top >= bottom(box)).sort((a, b) => a.top - b.top)[0]
  const downEdge = downN ? downN.top : container.height
  if (downEdge - bottom(box) > 0) out.push(seg('y', bottom(box), downEdge, cx))

  return out
}

/**
 * Distanze fra il riquadro scelto `a` e quello sotto il puntatore `b` (Alt in hover).
 * Se uno contiene l'altro: le quattro distanze interne; altrimenti i vuoti orizzontale e verticale.
 */
export function measureBetween(a: Rect, b: Rect): Measure[] {
  const inside = (o: Rect, i: Rect) => i.left >= o.left && i.top >= o.top && right(i) <= right(o) && bottom(i) <= bottom(o)
  if (inside(b, a) || inside(a, b)) {
    const [outer, inner] = inside(b, a) ? [b, a] : [a, b]
    const out: Measure[] = []
    if (inner.left > outer.left) out.push(seg('x', outer.left, inner.left, centerY(inner)))
    if (right(outer) > right(inner)) out.push(seg('x', right(inner), right(outer), centerY(inner)))
    if (inner.top > outer.top) out.push(seg('y', outer.top, inner.top, centerX(inner)))
    if (bottom(outer) > bottom(inner)) out.push(seg('y', bottom(inner), bottom(outer), centerX(inner)))
    return out
  }
  const out: Measure[] = []
  const vOverlapFrom = Math.max(a.top, b.top)
  const vOverlapTo = Math.min(bottom(a), bottom(b))
  const atY = vOverlapTo > vOverlapFrom ? (vOverlapFrom + vOverlapTo) / 2 : centerY(a)
  if (right(a) <= b.left) out.push(seg('x', right(a), b.left, atY))
  else if (right(b) <= a.left) out.push(seg('x', right(b), a.left, atY))
  const hOverlapFrom = Math.max(a.left, b.left)
  const hOverlapTo = Math.min(right(a), right(b))
  const atX = hOverlapTo > hOverlapFrom ? (hOverlapFrom + hOverlapTo) / 2 : centerX(a)
  if (bottom(a) <= b.top) out.push(seg('y', bottom(a), b.top, atX))
  else if (bottom(b) <= a.top) out.push(seg('y', bottom(b), a.top, atX))
  return out
}

/** Testo dell'etichetta: «24» (px interi, senza unità come in Figma). */
export const measureLabel = (m: Measure): string => String(m.value)
