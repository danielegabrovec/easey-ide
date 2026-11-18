// Aggancio magnetico stile Figma: bordi e centri del contenitore, dei fratelli e delle guide dei righelli;
// più linee insieme quando si allineano tutte; «distanze uguali» fra i vicini sulla stessa riga/colonna;
// aggancio anche mentre si ridimensiona. Puro: il canvas passa i riquadri e disegna ciò che torna.
import { bottom, centerX, centerY, handleEdges, MIN_SIZE, overlap, right, type Handle, type Rect, type Size } from './geometry'

/** Soglia in px dello SCHERMO: dividere per la scala dello zoom prima di passarla. */
export const SNAP_DISTANCE = 6

export type Axis = 'x' | 'y'

/** Linea guida da disegnare: `axis: 'x'` è una linea verticale a x = `at`, lunga da `from` a `to` (in y). */
export interface Guide {
  axis: Axis
  at: number
  from: number
  to: number
}

/** Distanza uguale da mostrare: segmento lungo `axis` da `from` a `to`, all'altezza `at`, con il valore `gap`. */
export interface SpacingHint {
  axis: Axis
  from: number
  to: number
  at: number
  gap: number
}

export interface SnapContext {
  /** Dimensioni del contenitore (le sue linee: 0, centro, fine). */
  container: Size
  /** Gli altri riquadri nello stesso contenitore (non quelli che si stanno spostando). */
  siblings: readonly Rect[]
  /** Guide trascinate dai righelli, nelle stesse coordinate. */
  userGuides?: { xs: readonly number[]; ys: readonly number[] }
  /** Soglia già convertita in px della pagina (default 6). */
  threshold?: number
}

export interface SnapResult {
  box: Rect
  guides: Guide[]
  spacing: SpacingHint[]
}

interface Line {
  at: number
  /** Estensione del riquadro che l'ha generata sull'altro asse (per disegnare la guida a segmento). */
  from: number
  to: number
}

function linesOf(ctx: SnapContext, axis: Axis): Line[] {
  const { container, siblings } = ctx
  const out: Line[] = []
  if (axis === 'x') {
    for (const at of [0, container.width / 2, container.width]) out.push({ at, from: 0, to: container.height })
    for (const s of siblings) for (const at of [s.left, centerX(s), right(s)]) out.push({ at, from: s.top, to: bottom(s) })
    for (const at of ctx.userGuides?.xs ?? []) out.push({ at, from: 0, to: container.height })
  } else {
    for (const at of [0, container.height / 2, container.height]) out.push({ at, from: 0, to: container.width })
    for (const s of siblings) for (const at of [s.top, centerY(s), bottom(s)]) out.push({ at, from: s.left, to: right(s) })
    for (const at of ctx.userGuides?.ys ?? []) out.push({ at, from: 0, to: container.width })
  }
  return out
}

const edgesOf = (box: Rect, axis: Axis): number[] => (axis === 'x' ? [box.left, centerX(box), right(box)] : [box.top, centerY(box), bottom(box)])

/** Lo spostamento più piccolo (entro la soglia) che porta un bordo/centro del riquadro su una linea. */
function bestDelta(edges: number[], lines: Line[], threshold: number): number | null {
  let best: number | null = null
  for (const line of lines) {
    for (const edge of edges) {
      const delta = line.at - edge
      if (Math.abs(delta) <= threshold && (best === null || Math.abs(delta) < Math.abs(best))) best = delta
    }
  }
  return best
}

/** Tutte le linee che coincidono (±0,5 px) con un bordo/centro del riquadro già agganciato, unite per posizione. */
function guidesFor(box: Rect, lines: Line[], axis: Axis): Guide[] {
  const edges = edgesOf(box, axis)
  const span = axis === 'x' ? { from: box.top, to: bottom(box) } : { from: box.left, to: right(box) }
  const byAt = new Map<number, Guide>()
  for (const line of lines) {
    if (!edges.some((e) => Math.abs(e - line.at) <= 0.5)) continue
    const at = Math.round(line.at * 2) / 2
    const g = byAt.get(at) ?? { axis, at, from: span.from, to: span.to }
    g.from = Math.min(g.from, line.from)
    g.to = Math.max(g.to, line.to)
    byAt.set(at, g)
  }
  return [...byAt.values()].sort((a, b) => a.at - b.at)
}

/** Vicini sulla stessa riga (axis x) o colonna (axis y), ordinati lungo l'asse. */
function neighboursOnAxis(box: Rect, siblings: readonly Rect[], axis: Axis): Rect[] {
  const cross = (r: Rect) => (axis === 'x' ? overlap(r.top, bottom(r), box.top, bottom(box)) : overlap(r.left, right(r), box.left, right(box)))
  return siblings.filter((s) => cross(s) > 0).sort((a, b) => (axis === 'x' ? a.left - b.left : a.top - b.top))
}

const start = (r: Rect, axis: Axis) => (axis === 'x' ? r.left : r.top)
const end = (r: Rect, axis: Axis) => (axis === 'x' ? right(r) : bottom(r))
const size = (r: Rect, axis: Axis) => (axis === 'x' ? r.width : r.height)

/** Candidati «distanze uguali»: posizioni d'inizio che ripetono un gap già presente o centrano fra due vicini. */
function spacingCandidates(box: Rect, siblings: readonly Rect[], axis: Axis): { pos: number; gap: number }[] {
  const row = neighboursOnAxis(box, siblings, axis)
  const gaps: number[] = []
  for (let i = 1; i < row.length; i++) {
    const g = start(row[i], axis) - end(row[i - 1], axis)
    if (g > 0) gaps.push(g)
  }
  const s = size(box, axis)
  const before = row.filter((r) => end(r, axis) <= start(box, axis) + s / 2).pop()
  const after = row.find((r) => start(r, axis) >= end(box, axis) - s / 2)
  const out: { pos: number; gap: number }[] = []
  if (before && after) {
    const free = start(after, axis) - end(before, axis) - s
    if (free > 0) out.push({ pos: end(before, axis) + free / 2, gap: free / 2 })
  }
  for (const g of gaps) {
    if (before) out.push({ pos: end(before, axis) + g, gap: g })
    if (after) out.push({ pos: start(after, axis) - g - s, gap: g })
  }
  return out
}

/** Segmenti da disegnare quando il riquadro ha distanze uguali ai vicini (incluse le coppie già alla stessa distanza). */
export function spacingHints(box: Rect, siblings: readonly Rect[], axis: Axis): SpacingHint[] {
  const row = [...neighboursOnAxis(box, siblings, axis), box].sort((a, b) => start(a, axis) - start(b, axis))
  const segments: SpacingHint[] = []
  for (let i = 1; i < row.length; i++) {
    const a = row[i - 1]
    const b = row[i]
    const gap = start(b, axis) - end(a, axis)
    if (gap <= 0) continue
    const crossFrom = axis === 'x' ? Math.max(a.top, b.top) : Math.max(a.left, b.left)
    const crossTo = axis === 'x' ? Math.min(bottom(a), bottom(b)) : Math.min(right(a), right(b))
    segments.push({ axis, from: end(a, axis), to: start(b, axis), at: (crossFrom + crossTo) / 2, gap })
  }
  const touching = segments.filter((s) => Math.abs(s.from - end(box, axis)) < 0.5 || Math.abs(s.to - start(box, axis)) < 0.5)
  if (!touching.length) return []
  const gapsNearBox = touching.map((s) => s.gap)
  return segments.filter((s) => gapsNearBox.some((g) => Math.abs(g - s.gap) <= 0.5) && segments.filter((o) => Math.abs(o.gap - s.gap) <= 0.5).length >= 2)
}

/**
 * Spostamento con aggancio: allineamento (priorità) e distanze uguali, su ciascun asse in modo indipendente.
 * `disabled` (Alt tenuto) restituisce il riquadro com'è.
 */
export function snapMove(box: Rect, ctx: SnapContext, disabled = false): SnapResult {
  if (disabled) return { box, guides: [], spacing: [] }
  const threshold = ctx.threshold ?? SNAP_DISTANCE
  const result = { ...box }
  for (const axis of ['x', 'y'] as const) {
    const lines = linesOf(ctx, axis)
    const align = bestDelta(edgesOf(box, axis), lines, threshold)
    let delta = align
    if (delta === null) {
      for (const c of spacingCandidates(box, ctx.siblings, axis)) {
        const d = c.pos - start(box, axis)
        if (Math.abs(d) <= threshold && (delta === null || Math.abs(d) < Math.abs(delta))) delta = d
      }
    }
    if (delta !== null) {
      if (axis === 'x') result.left = box.left + delta
      else result.top = box.top + delta
    }
  }
  const guides = [...guidesFor(result, linesOf(ctx, 'x'), 'x'), ...guidesFor(result, linesOf(ctx, 'y'), 'y')]
  const spacing = [...spacingHints(result, ctx.siblings, 'x'), ...spacingHints(result, ctx.siblings, 'y')]
  return { box: result, guides, spacing }
}

/**
 * Ridimensionamento con aggancio: solo i bordi che la maniglia muove si attaccano alle linee
 * (il bordo opposto resta fermo). Va chiamata sul riquadro già calcolato da `resizeRect`.
 */
export function snapResize(box: Rect, handle: Handle, ctx: SnapContext, disabled = false): SnapResult {
  if (disabled) return { box, guides: [], spacing: [] }
  const threshold = ctx.threshold ?? SNAP_DISTANCE
  const edges = handleEdges(handle)
  const result = { ...box }
  if (edges.x) {
    const lines = linesOf(ctx, 'x')
    const edge = edges.x === 'left' ? box.left : right(box)
    const d = bestDelta([edge], lines, threshold)
    if (d !== null) {
      if (edges.x === 'left' && box.width - d >= MIN_SIZE) {
        result.left = box.left + d
        result.width = box.width - d
      } else if (edges.x === 'right' && box.width + d >= MIN_SIZE) result.width = box.width + d
    }
  }
  if (edges.y) {
    const lines = linesOf(ctx, 'y')
    const edge = edges.y === 'top' ? box.top : bottom(box)
    const d = bestDelta([edge], lines, threshold)
    if (d !== null) {
      if (edges.y === 'top' && box.height - d >= MIN_SIZE) {
        result.top = box.top + d
        result.height = box.height - d
      } else if (edges.y === 'bottom' && box.height + d >= MIN_SIZE) result.height = box.height + d
    }
  }
  // Mostra solo le guide dei bordi mossi.
  const only = (g: Guide) => {
    if (g.axis === 'x') return !!edges.x && Math.abs(g.at - (edges.x === 'left' ? result.left : right(result))) <= 0.5
    return !!edges.y && Math.abs(g.at - (edges.y === 'top' ? result.top : bottom(result))) <= 0.5
  }
  const guides = [...guidesFor(result, linesOf(ctx, 'x'), 'x'), ...guidesFor(result, linesOf(ctx, 'y'), 'y')].filter(only)
  return { box: result, guides, spacing: [] }
}
