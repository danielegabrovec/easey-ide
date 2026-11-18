// Canvas kit: geometria pura delle tavole dei designer, una sola fonte per Easey IDE e IDE Next.
// Niente DOM, React, Electron o Node: le misure le passa chi disegna. Coordinate in px della pagina,
// relative al contenitore (0,0 = angolo in alto a sinistra del contenitore).

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export const right = (r: Rect): number => r.left + r.width
export const bottom = (r: Rect): number => r.top + r.height
export const centerX = (r: Rect): number => r.left + r.width / 2
export const centerY = (r: Rect): number => r.top + r.height / 2

/** Il riquadro che contiene tutti quelli dati (null se la lista è vuota). */
export function unionRect(rects: readonly Rect[]): Rect | null {
  if (!rects.length) return null
  const l = Math.min(...rects.map((r) => r.left))
  const t = Math.min(...rects.map((r) => r.top))
  const r = Math.max(...rects.map(right))
  const b = Math.max(...rects.map(bottom))
  return { left: l, top: t, width: r - l, height: b - t }
}

/** Parte comune fra due intervalli [a0,a1] e [b0,b1] (0 se non si toccano). */
export function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
}

/** I due riquadri si sovrappongono in verticale (stanno sulla stessa «riga»)? */
export const sameRow = (a: Rect, b: Rect): boolean => overlap(a.top, bottom(a), b.top, bottom(b)) > 0
/** I due riquadri si sovrappongono in orizzontale (stanno nella stessa «colonna»)? */
export const sameColumn = (a: Rect, b: Rect): boolean => overlap(a.left, right(a), b.left, right(b)) > 0

export function containsPoint(rect: Rect, p: Point, margin = 0): boolean {
  return p.x >= rect.left - margin && p.x <= right(rect) + margin && p.y >= rect.top - margin && p.y <= bottom(rect) + margin
}

export function containsRect(outer: Rect, inner: Rect, margin = 0): boolean {
  return inner.left >= outer.left - margin && inner.top >= outer.top - margin && right(inner) <= right(outer) + margin && bottom(inner) <= bottom(outer) + margin
}

/** Il rettangolo fra due punti, in qualunque verso si trascini. */
export function rectBetween(a: Point, b: Point): Rect {
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}

/** Arrotonda al pixel (le misure scritte nel CSS o nel modello sono intere). */
export function roundRect(r: Rect): Rect {
  return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
}

/** Tiene il riquadro dentro il contenitore (se è più grande, resta allineato in alto a sinistra). */
export function clampRect<T extends Rect>(box: T, bounds: Size): T {
  const left = Math.min(Math.max(0, box.left), Math.max(0, bounds.width - box.width))
  const top = Math.min(Math.max(0, box.top), Math.max(0, bounds.height - box.height))
  return { ...box, left, top }
}

/** Le otto maniglie di ridimensionamento. */
export const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
export type Handle = (typeof HANDLES)[number]

/** Dove si disegna una maniglia attorno al riquadro. */
export function handlePoint(box: Rect, handle: Handle): Point {
  const x = handle.includes('w') ? box.left : handle.includes('e') ? right(box) : centerX(box)
  const y = handle.includes('n') ? box.top : handle.includes('s') ? bottom(box) : centerY(box)
  return { x, y }
}

export const MIN_SIZE = 8

/**
 * Ridimensionamento da una maniglia (minimo 8 px). `keepRatio` (Maiusc) tiene le proporzioni,
 * `fromCenter` (Alt) allarga in modo simmetrico attorno al centro.
 */
export function resizeRect(origin: Rect, handle: Handle, delta: Point, options: { keepRatio?: boolean; fromCenter?: boolean } = {}): Rect {
  const k = options.fromCenter ? 2 : 1
  let width = origin.width
  let height = origin.height
  if (handle.includes('e')) width = origin.width + delta.x * k
  if (handle.includes('w')) width = origin.width - delta.x * k
  if (handle.includes('s')) height = origin.height + delta.y * k
  if (handle.includes('n')) height = origin.height - delta.y * k
  width = Math.max(MIN_SIZE, width)
  height = Math.max(MIN_SIZE, height)
  if (options.keepRatio && origin.width > 0 && origin.height > 0) {
    const ratio = origin.width / origin.height
    const horizontal = handle === 'e' || handle === 'w'
    const vertical = handle === 'n' || handle === 's'
    if (vertical) width = Math.max(MIN_SIZE, height * ratio)
    else if (horizontal) height = Math.max(MIN_SIZE, width / ratio)
    else if (width / origin.width >= height / origin.height) height = Math.max(MIN_SIZE, width / ratio)
    else width = Math.max(MIN_SIZE, height * ratio)
  }
  let left = origin.left
  let top = origin.top
  if (options.fromCenter) {
    left = centerX(origin) - width / 2
    top = centerY(origin) - height / 2
  } else {
    // Il bordo opposto alla maniglia resta fermo (anche con le proporzioni: si allarga verso destra/basso).
    if (handle.includes('w')) left = right(origin) - width
    if (handle.includes('n')) top = bottom(origin) - height
  }
  return { left, top, width, height }
}

/** Gli assi che una maniglia muove: serve all'aggancio durante il ridimensionamento. */
export function handleEdges(handle: Handle): { x: 'left' | 'right' | null; y: 'top' | 'bottom' | null } {
  return {
    x: handle.includes('w') ? 'left' : handle.includes('e') ? 'right' : null,
    y: handle.includes('n') ? 'top' : handle.includes('s') ? 'bottom' : null
  }
}
