// «Da libero a layout»: dai riquadri messi a mano libera in un contenitore ricava un layout che si adatta
// (flex in riga o colonna, griglia regolare), con vuoti e margini presi dalla scala degli spazi.
// Idea presa dal risolutore di «Frontend Next» (righe per sovrapposizione verticale, griglia se le colonne
// sono allineate), riscritta pura e su un solo livello: il designer la richiama per i contenitori annidati.

import { bottom, centerY, right, type Rect, type Size } from './geometry'

/** Scala degli spazi (la stessa del design kit: 0, 4, 8 … 128 px). */
export const LAYOUT_SPACE_STEPS = [0, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128] as const

export interface Padding {
  top: number
  right: number
  bottom: number
  left: number
}

export type Justify = 'start' | 'space-between'
export type AlignItems = 'start' | 'center' | 'stretch'

/** Un elemento nella pila; `fill` = occupa tutta la larghezza (in colonna). */
export interface PlanItem<Id> {
  kind: 'item'
  id: Id
  fill: boolean
}

/** Una riga da avvolgere in un nuovo contenitore (dentro una colonna). */
export interface PlanRow<Id> {
  kind: 'row'
  gap: number
  align: AlignItems
  items: Id[]
}

export type LayoutPlan<Id> =
  | {
      kind: 'stack'
      direction: 'row' | 'column'
      gap: number
      padding: Padding
      justify: Justify
      align: AlignItems
      children: Array<PlanItem<Id> | PlanRow<Id>>
      /** Elementi sopra altri (badge, etichette): restano liberi. */
      floating: Id[]
    }
  | {
      kind: 'grid'
      /** Tracce delle colonne: «1fr» se le larghezze sono simili, altrimenti px e l'ultima 1fr. */
      columns: string[]
      columnGap: number
      rowGap: number
      padding: Padding
      /** Ordine per righe (riga 1 da sinistra, riga 2…). */
      order: Id[]
      floating: Id[]
    }

export interface InferInput<Id> {
  container: Size
  items: ReadonlyArray<{ id: Id; rect: Rect }>
}

/** Gradino della scala più vicino (se è a ≤ 4 px), altrimenti il valore arrotondato. */
export function snapToSpace(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0
  let best: number = LAYOUT_SPACE_STEPS[0]
  for (const step of LAYOUT_SPACE_STEPS) if (Math.abs(raw - step) < Math.abs(raw - best)) best = step
  return Math.abs(raw - best) <= 4 ? best : Math.round(raw)
}

export function median(values: readonly number[]): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

interface Box<Id> {
  id: Id
  r: Rect
}

const area = (r: Rect) => r.width * r.height

function intersection(a: Rect, b: Rect): number {
  const w = Math.max(0, Math.min(right(a), right(b)) - Math.max(a.left, b.left))
  const h = Math.max(0, Math.min(bottom(a), bottom(b)) - Math.max(a.top, b.top))
  return w * h
}

/** Righe: un riquadro entra in una riga se si sovrappone in verticale per oltre il 35 % o ha il centro a ≤ 10 px. */
export function clusterRows<Id>(boxes: ReadonlyArray<Box<Id>>): Box<Id>[][] {
  const sorted = [...boxes].sort((a, b) => (Math.abs(a.r.top - b.r.top) <= 4 ? a.r.left - b.r.left : a.r.top - b.r.top))
  const bands: Array<{ top: number; bottom: number; cySum: number; items: Box<Id>[] }> = []
  for (const box of sorted) {
    const band = bands.find((b) => {
      const v = Math.min(b.bottom, bottom(box.r)) - Math.max(b.top, box.r.top)
      const minH = Math.max(1, Math.min(b.bottom - b.top, box.r.height))
      return v / minH > 0.35 || Math.abs(centerY(box.r) - b.cySum / b.items.length) <= 10
    })
    if (band) {
      band.items.push(box)
      band.top = Math.min(band.top, box.r.top)
      band.bottom = Math.max(band.bottom, bottom(box.r))
      band.cySum += centerY(box.r)
    } else bands.push({ top: box.r.top, bottom: bottom(box.r), cySum: centerY(box.r), items: [box] })
  }
  for (const b of bands) b.items.sort((x, y) => x.r.left - y.r.left)
  return bands.sort((a, b) => a.top - b.top).map((b) => b.items)
}

const gapsInRow = <Id>(row: Box<Id>[]) => row.slice(1).map((b, i) => Math.max(0, b.r.left - right(row[i].r)))

function gapsBetweenRows<Id>(rows: Box<Id>[][]): number[] {
  return rows.slice(1).map((row, i) => Math.max(0, Math.min(...row.map((b) => b.r.top)) - Math.max(...rows[i].map((b) => bottom(b.r)))))
}

function gridOf<Id>(rows: Box<Id>[][]): { columns: string[]; columnGap: number; rowGap: number } | null {
  if (rows.length < 2) return null
  const cols = rows[0].length
  if (cols < 2) return null
  for (let i = 0; i < rows.length; i++) {
    const n = rows[i].length
    if (i < rows.length - 1 ? n !== cols : n < 1 || n > cols) return null
  }
  let aligned = 0
  let checks = 0
  const widths: number[] = []
  for (let c = 0; c < cols; c++) {
    const xs: number[] = []
    const ws: number[] = []
    for (const row of rows) {
      if (c < row.length) {
        xs.push(row[c].r.left)
        ws.push(row[c].r.width)
      }
    }
    widths.push(median(ws))
    for (let i = 1; i < xs.length; i++) {
      checks++
      if (Math.abs(xs[i] - xs[0]) <= 18) aligned++
    }
  }
  if (!checks || aligned / checks < 0.8) return null
  const maxW = Math.max(...widths)
  const minW = Math.min(...widths)
  const uniform = maxW > 0 && (maxW - minW) / maxW <= 0.2
  const columns = widths.map((w, i) => (uniform || i === widths.length - 1 ? '1fr' : `${Math.round(w)}px`))
  return { columns, columnGap: snapToSpace(median(rows.flatMap(gapsInRow))), rowGap: snapToSpace(median(gapsBetweenRows(rows))) }
}

function paddingOf<Id>(boxes: ReadonlyArray<Box<Id>>, container: Size): Padding {
  const minX = Math.min(...boxes.map((b) => b.r.left))
  const minY = Math.min(...boxes.map((b) => b.r.top))
  const maxR = Math.max(...boxes.map((b) => right(b.r)))
  const maxB = Math.max(...boxes.map((b) => bottom(b.r)))
  const side = snapToSpace(median([Math.max(0, minX), Math.max(0, container.width - maxR)]))
  return { top: snapToSpace(Math.max(0, minY)), right: side, bottom: snapToSpace(Math.max(0, container.height - maxB)), left: side }
}

/**
 * Il layout proposto per i figli liberi di un contenitore, o null se non c'è niente da sistemare.
 * Gli elementi coperti per oltre il 45 % da un altro (il più piccolo dei due) restano liberi (`floating`).
 */
export function inferLayout<Id>(input: InferInput<Id>): LayoutPlan<Id> | null {
  const boxes: Box<Id>[] = input.items.map((i) => ({ id: i.id, r: i.rect }))
  if (!boxes.length) return null
  const floating = new Set<Id>()
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const smaller = area(boxes[i].r) <= area(boxes[j].r) ? boxes[i] : boxes[j]
      if (area(smaller.r) > 0 && intersection(boxes[i].r, boxes[j].r) / area(smaller.r) > 0.45) floating.add(smaller.id)
    }
  }
  const flow = boxes.filter((b) => !floating.has(b.id))
  if (!flow.length) return null
  const padding = paddingOf(flow, input.container)
  const inner = input.container.width - padding.left - padding.right
  const fills = (b: Box<Id>) => b.r.width >= inner * 0.78
  const rows = clusterRows(flow)

  const grid = gridOf(rows)
  if (grid) return { kind: 'grid', ...grid, padding, order: rows.flat().map((b) => b.id), floating: [...floating] }

  if (rows.length === 1 && rows[0].length > 1) {
    const row = rows[0]
    const gaps = gapsInRow(row)
    const cy0 = centerY(row[0].r)
    const align: AlignItems = row.every((b) => Math.abs(centerY(b.r) - cy0) <= 8) ? 'center' : 'start'
    const W = input.container.width
    const spread = row.length === 2 && row[0].r.left <= W * 0.12 && W - right(row[1].r) <= W * 0.12 && gaps[0] > W * 0.22
    return {
      kind: 'stack',
      direction: 'row',
      gap: spread ? 16 : snapToSpace(median(gaps)),
      padding,
      justify: spread ? 'space-between' : 'start',
      align,
      children: row.map((b) => ({ kind: 'item' as const, id: b.id, fill: false })),
      floating: [...floating]
    }
  }

  const children: Array<PlanItem<Id> | PlanRow<Id>> = rows.map((row) => {
    if (row.length === 1) return { kind: 'item' as const, id: row[0].id, fill: fills(row[0]) }
    const cy0 = centerY(row[0].r)
    return {
      kind: 'row' as const,
      gap: snapToSpace(median(gapsInRow(row))) || 12,
      align: row.every((b) => Math.abs(centerY(b.r) - cy0) <= 8) ? ('center' as const) : ('start' as const),
      items: row.map((b) => b.id)
    }
  })
  return {
    kind: 'stack',
    direction: 'column',
    gap: snapToSpace(median(gapsBetweenRows(rows))) || 16,
    padding,
    justify: 'start',
    align: flow.every(fills) ? 'stretch' : 'start',
    children,
    floating: [...floating]
  }
}

/** Frase per la notifica: «Colonna con 2 righe», «Griglia 3 colonne», «Riga di 4». */
export function describePlan<Id>(plan: LayoutPlan<Id>): string {
  if (plan.kind === 'grid') return `Griglia a ${plan.columns.length} colonne`
  if (plan.direction === 'row') return `Riga di ${plan.children.length} elementi`
  const rows = plan.children.filter((c) => c.kind === 'row').length
  return rows ? `Colonna con ${rows} ${rows === 1 ? 'riga' : 'righe'} affiancate` : `Colonna di ${plan.children.length} elementi`
}
