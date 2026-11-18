// Allinea, distribuisci, stessa misura e ordine dei livelli: calcoli puri sui riquadri.
// Il designer applica il risultato (CSS left/top o layout del widget) in un'unica transazione annullabile.
import { bottom, centerX, centerY, right, unionRect, type Rect, type Size } from './geometry'

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type DistributeAxis = 'horizontal' | 'vertical'

export const ALIGN_MODES: readonly AlignMode[] = ['left', 'center', 'right', 'top', 'middle', 'bottom']

export const ALIGN_LABELS: Record<AlignMode, string> = {
  left: 'Allinea a sinistra',
  center: 'Allinea al centro (orizzontale)',
  right: 'Allinea a destra',
  top: 'Allinea in alto',
  middle: 'Allinea al centro (verticale)',
  bottom: 'Allinea in basso'
}

/**
 * Allinea i riquadri. Con più riquadri il riferimento è il loro ingombro comune; con uno solo (o se si
 * passa `container`) è il contenitore. Restituisce i riquadri nello stesso ordine, solo con left/top cambiati.
 */
export function alignRects<T extends Rect>(rects: readonly T[], mode: AlignMode, container?: Size): T[] {
  const ref: Rect | null = container || rects.length === 1 ? { left: 0, top: 0, width: container?.width ?? 0, height: container?.height ?? 0 } : unionRect(rects)
  if (!ref || (rects.length === 1 && !container)) return rects.map((r) => ({ ...r }))
  return rects.map((r) => {
    switch (mode) {
      case 'left':
        return { ...r, left: ref.left }
      case 'center':
        return { ...r, left: centerX(ref) - r.width / 2 }
      case 'right':
        return { ...r, left: right(ref) - r.width }
      case 'top':
        return { ...r, top: ref.top }
      case 'middle':
        return { ...r, top: centerY(ref) - r.height / 2 }
      case 'bottom':
        return { ...r, top: bottom(ref) - r.height }
    }
  })
}

/**
 * Distribuisce: il primo e l'ultimo (lungo l'asse) restano fermi, gli altri si spostano perché i vuoti
 * fra uno e l'altro siano uguali. Servono almeno tre riquadri; l'ordine restituito è quello d'ingresso.
 */
export function distributeRects<T extends Rect>(rects: readonly T[], axis: DistributeAxis): T[] {
  const out = rects.map((r) => ({ ...r }))
  if (rects.length < 3) return out
  const horizontal = axis === 'horizontal'
  const order = out.map((r, i) => ({ r, i })).sort((a, b) => (horizontal ? a.r.left - b.r.left : a.r.top - b.r.top))
  const first = order[0].r
  const last = order[order.length - 1].r
  const span = horizontal ? right(last) - first.left : bottom(last) - first.top
  const total = order.reduce((sum, o) => sum + (horizontal ? o.r.width : o.r.height), 0)
  const gap = (span - total) / (order.length - 1)
  let cursor = horizontal ? first.left : first.top
  for (const o of order) {
    if (horizontal) o.r.left = cursor
    else o.r.top = cursor
    cursor += (horizontal ? o.r.width : o.r.height) + gap
  }
  return out
}

/** Stessa larghezza o altezza: quella del primo riquadro (l'elemento principale della selezione). */
export function matchSize<T extends Rect>(rects: readonly T[], dimension: 'width' | 'height'): T[] {
  if (!rects.length) return []
  const value = rects[0][dimension]
  return rects.map((r) => ({ ...r, [dimension]: value }))
}

export type RestackOp = 'forward' | 'backward' | 'front' | 'back'

export const RESTACK_LABELS: Record<RestackOp, string> = {
  forward: 'Porta avanti',
  backward: 'Manda indietro',
  front: 'Porta in primo piano',
  back: 'Manda in fondo'
}

/**
 * Nuovo ordine dei livelli fra fratelli. `order` è dal fondo (primo) alla cima (ultimo); i selezionati si
 * spostano insieme mantenendo il loro ordine relativo. Il designer poi scrive z-index = posizione + 1.
 */
export function restack<T>(order: readonly T[], selected: ReadonlySet<T>, op: RestackOp): T[] {
  const picked = order.filter((item) => selected.has(item))
  const rest = order.filter((item) => !selected.has(item))
  if (!picked.length) return [...order]
  if (op === 'front') return [...rest, ...picked]
  if (op === 'back') return [...picked, ...rest]
  const out = [...order]
  if (op === 'forward') {
    for (let i = out.length - 2; i >= 0; i--) {
      if (selected.has(out[i]) && !selected.has(out[i + 1])) [out[i], out[i + 1]] = [out[i + 1], out[i]]
    }
  } else {
    for (let i = 1; i < out.length; i++) {
      if (selected.has(out[i]) && !selected.has(out[i - 1])) [out[i], out[i - 1]] = [out[i - 1], out[i]]
    }
  }
  return out
}

/** z-index da scrivere dopo `restack`: 1, 2, 3… (solo per chi cambia rispetto a `current`). */
export function zIndexes<T>(order: readonly T[], current: (item: T) => number | null): Map<T, number> {
  const changes = new Map<T, number>()
  order.forEach((item, index) => {
    if (current(item) !== index + 1) changes.set(item, index + 1)
  })
  return changes
}

/** Ordine dei fratelli dal fondo alla cima: z-index (auto = 0), a parità l'ordine nel documento. */
export function paintOrder<T>(items: readonly T[], zOf: (item: T) => number | null): T[] {
  return items.map((item, index) => ({ item, index, z: zOf(item) ?? 0 })).sort((a, b) => a.z - b.z || a.index - b.index).map((x) => x.item)
}
