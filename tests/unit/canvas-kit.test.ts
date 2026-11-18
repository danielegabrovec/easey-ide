import { describe, expect, it } from 'vitest'
import { alignRects, distributeRects, matchSize, paintOrder, restack, zIndexes } from '@shared/canvas-kit/align'
import { drawnRect, toolForKey } from '@shared/canvas-kit/draw'
import { clampRect, resizeRect, unionRect } from '@shared/canvas-kit/geometry'
import { describePlan, inferLayout, snapToSpace } from '@shared/canvas-kit/layout-infer'
import { measureBetween, nearestDistances } from '@shared/canvas-kit/measure'
import { moveGuide, rulerStep, rulerTicks } from '@shared/canvas-kit/rulers'
import { snapMove, snapResize, spacingHints } from '@shared/canvas-kit/snap'

const R = (left: number, top: number, width: number, height: number) => ({ left, top, width, height })
const container = { width: 1000, height: 600 }

describe('geometria', () => {
  it('unione e limite ai bordi', () => {
    expect(unionRect([R(10, 10, 10, 10), R(50, 0, 10, 40)])).toEqual(R(10, 0, 50, 40))
    expect(unionRect([])).toBeNull()
    expect(clampRect(R(-5, 590, 20, 20), container)).toEqual(R(0, 580, 20, 20))
  })

  it('ridimensiona dalle maniglie, con proporzioni e dal centro', () => {
    expect(resizeRect(R(100, 100, 100, 50), 'se', { x: 20, y: 10 })).toEqual(R(100, 100, 120, 60))
    expect(resizeRect(R(100, 100, 100, 50), 'nw', { x: 20, y: 10 })).toEqual(R(120, 110, 80, 40))
    expect(resizeRect(R(100, 100, 100, 50), 'e', { x: 100, y: 30 }, { keepRatio: true })).toEqual(R(100, 100, 200, 100))
    expect(resizeRect(R(100, 100, 100, 50), 'e', { x: 10, y: 0 }, { fromCenter: true })).toEqual(R(90, 100, 120, 50))
    expect(resizeRect(R(100, 100, 100, 50), 'w', { x: 200, y: 0 }).width).toBe(8)
  })
})

describe('aggancio', () => {
  const siblings = [R(100, 100, 100, 50), R(400, 300, 80, 80)]

  it('aggancia il bordo sinistro al bordo di un fratello e mostra la guida lunga quanto entrambi', () => {
    const r = snapMove(R(103, 250, 50, 30), { container, siblings })
    expect(r.box.left).toBe(100)
    const g = r.guides.find((x) => x.axis === 'x' && x.at === 100)!
    expect(g.from).toBe(100)
    expect(g.to).toBe(280)
  })

  it('più linee insieme: bordo e centro allineati a due fratelli diversi', () => {
    const r = snapMove(R(398, 98, 80, 50), { container, siblings })
    expect(r.box).toEqual(R(400, 100, 80, 50))
    expect(r.guides.filter((g) => g.axis === 'x').map((g) => g.at)).toEqual([400, 440, 480])
    expect(r.guides.some((g) => g.axis === 'y' && g.at === 100)).toBe(true)
  })

  it('Alt spegne, la soglia è rispettata, guide dei righelli', () => {
    expect(snapMove(R(103, 250, 50, 30), { container, siblings }, true).box.left).toBe(103)
    expect(snapMove(R(260, 250, 50, 30), { container, siblings }).box.left).toBe(260)
    expect(snapMove(R(302, 250, 50, 30), { container, siblings: [], userGuides: { xs: [300], ys: [] } }).box.left).toBe(300)
  })

  it('distanze uguali: centra fra due vicini e ripete un vuoto esistente', () => {
    const row = [R(0, 0, 100, 50), R(300, 0, 100, 50)]
    const between = snapMove(R(147, 0, 100, 50), { container: { width: 2000, height: 600 }, siblings: row })
    expect(between.box.left).toBe(150)
    expect(between.spacing.map((s) => s.gap)).toEqual([50, 50])
    const repeat = snapMove(R(597, 0, 100, 50), { container: { width: 2000, height: 600 }, siblings: [R(0, 0, 100, 50), R(300, 0, 100, 50)], threshold: 6 })
    expect(repeat.box.left).toBe(600)
    expect(spacingHints(repeat.box, [R(0, 0, 100, 50), R(300, 0, 100, 50)], 'x').map((s) => s.gap)).toEqual([200, 200])
  })

  it('in ridimensionamento si attacca solo il bordo mosso', () => {
    const r = snapResize(R(10, 10, 87, 40), 'e', { container, siblings })
    expect(r.box).toEqual(R(10, 10, 90, 40))
    expect(r.guides).toEqual([expect.objectContaining({ axis: 'x', at: 100 })])
    const left = snapResize(R(203, 400, 50, 40), 'w', { container, siblings })
    expect(left.box).toEqual(R(200, 400, 53, 40))
  })
})

describe('misure', () => {
  it('distanze verso i vicini e verso i bordi', () => {
    const m = nearestDistances(R(300, 100, 100, 50), [R(100, 120, 50, 10)], { width: 1000, height: 300 })
    expect(m.map((x) => [x.axis, x.value])).toEqual([['x', 150], ['x', 600], ['y', 100], ['y', 150]])
  })

  it('fra due elementi staccati o uno dentro l’altro', () => {
    expect(measureBetween(R(0, 0, 100, 100), R(150, 20, 50, 50)).map((m) => m.value)).toEqual([50])
    expect(measureBetween(R(10, 20, 30, 30), R(0, 0, 100, 100)).map((m) => m.value)).toEqual([10, 60, 20, 50])
  })
})

describe('allinea, distribuisci, livelli', () => {
  const rs = [R(10, 10, 50, 20), R(100, 40, 30, 30), R(300, 5, 20, 60)]
  it('allinea all’ingombro comune o al contenitore', () => {
    expect(alignRects(rs, 'left').map((r) => r.left)).toEqual([10, 10, 10])
    expect(alignRects(rs, 'right').map((r) => r.left)).toEqual([270, 290, 300])
    expect(alignRects(rs, 'middle').map((r) => r.top)).toEqual([27.5, 22.5, 7.5])
    expect(alignRects([R(10, 10, 50, 20)], 'center', { width: 200, height: 100 })[0].left).toBe(75)
    expect(alignRects([R(10, 10, 50, 20)], 'center')[0].left).toBe(10)
  })

  it('distribuisce con vuoti uguali tenendo fermi gli estremi', () => {
    const d = distributeRects([R(0, 0, 10, 10), R(200, 0, 10, 10), R(50, 0, 10, 10)], 'horizontal')
    expect(d.map((r) => r.left)).toEqual([0, 200, 100])
    expect(matchSize(rs, 'width').map((r) => r.width)).toEqual([50, 50, 50])
  })

  it('ordine dei livelli', () => {
    const order = ['a', 'b', 'c', 'd']
    expect(restack(order, new Set(['b']), 'forward')).toEqual(['a', 'c', 'b', 'd'])
    expect(restack(order, new Set(['c', 'd']), 'forward')).toEqual(order)
    expect(restack(order, new Set(['c']), 'backward')).toEqual(['a', 'c', 'b', 'd'])
    expect(restack(order, new Set(['a', 'c']), 'front')).toEqual(['b', 'd', 'a', 'c'])
    expect(restack(order, new Set(['d']), 'back')).toEqual(['d', 'a', 'b', 'c'])
    expect(paintOrder(['x', 'y', 'z'], (i) => ({ x: 5, y: null, z: 0 } as Record<string, number | null>)[i] ?? null)).toEqual(['y', 'z', 'x'])
    expect([...zIndexes(['a', 'b'], (i) => (i === 'a' ? 1 : null))]).toEqual([['b', 2]])
  })
})

describe('righelli e disegno', () => {
  it('passo tondo che segue lo zoom', () => {
    expect(rulerStep(1)).toBe(100)
    expect(rulerStep(2)).toBe(50)
    expect(rulerStep(0.25)).toBe(500)
    const ticks = rulerTicks(-50, 400, 1)
    expect(ticks.filter((t) => t.major).map((t) => t.label)).toEqual(['0', '100', '200', '300'])
    expect(ticks.find((t) => t.label === '0')!.pos).toBe(50)
  })

  it('guide trascinate', () => {
    expect(moveGuide([], 0, 99.6)).toEqual([100])
    expect(moveGuide([100, 200], 0, null)).toEqual([200])
    expect(moveGuide([100], 0, 150)).toEqual([150])
  })

  it('rettangolo disegnato e clic semplice', () => {
    expect(drawnRect({ x: 100, y: 100 }, { x: 40, y: 160 }, 'rect')).toEqual(R(40, 100, 60, 60))
    expect(drawnRect({ x: 100, y: 100 }, { x: 101, y: 102 }, 'button')).toEqual(R(100, 100, 140, 44))
    expect(drawnRect({ x: 0, y: 0 }, { x: 50, y: 20 }, 'ellipse', { square: true })).toEqual(R(0, 0, 50, 50))
    expect(drawnRect({ x: 100, y: 100 }, { x: 120, y: 110 }, 'rect', { fromCenter: true })).toEqual(R(80, 90, 40, 20))
    expect(toolForKey('r')).toBe('rect')
    expect(toolForKey('q')).toBeNull()
  })
})

describe('da libero a layout', () => {
  it('scala degli spazi', () => {
    expect(snapToSpace(15)).toBe(16)
    expect(snapToSpace(40)).toBe(40)
    expect(snapToSpace(-3)).toBe(0)
  })

  it('una riga di bottoni centrati', () => {
    const plan = inferLayout({ container: { width: 600, height: 100 }, items: [{ id: 'b', rect: R(150, 30, 100, 40) }, { id: 'a', rect: R(24, 32, 100, 36) }] })!
    expect(plan.kind).toBe('stack')
    if (plan.kind !== 'stack') return
    expect(plan.direction).toBe('row')
    expect(plan.children.map((c) => c.kind === 'item' && c.id)).toEqual(['a', 'b'])
    expect(plan.gap).toBe(24)
    expect(plan.align).toBe('center')
    expect(describePlan(plan)).toBe('Riga di 2 elementi')
  })

  it('titolo, riga di due card, testo: colonna con una riga avvolta', () => {
    const plan = inferLayout({
      container: { width: 800, height: 500 },
      items: [
        { id: 'h', rect: R(32, 32, 736, 48) },
        { id: 'c1', rect: R(32, 112, 360, 200) },
        { id: 'c2', rect: R(408, 112, 360, 200) },
        { id: 'p', rect: R(32, 344, 736, 60) }
      ]
    })!
    expect(plan.kind).toBe('stack')
    if (plan.kind !== 'stack') return
    expect(plan.direction).toBe('column')
    expect(plan.gap).toBe(32)
    expect(plan.padding.left).toBe(32)
    expect(plan.children).toEqual([
      { kind: 'item', id: 'h', fill: true },
      { kind: 'row', gap: 16, align: 'center', items: ['c1', 'c2'] },
      { kind: 'item', id: 'p', fill: true }
    ])
  })

  it('griglia regolare 3×2 e badge sovrapposto lasciato libero', () => {
    const items = [] as { id: string; rect: ReturnType<typeof R> }[]
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) items.push({ id: `${r}${c}`, rect: R(16 + c * 216, 16 + r * 116, 200, 100) })
    items.push({ id: 'badge', rect: R(180, 10, 30, 30) })
    const plan = inferLayout({ container: { width: 680, height: 260 }, items })!
    expect(plan.kind).toBe('grid')
    if (plan.kind !== 'grid') return
    expect(plan.columns).toEqual(['1fr', '1fr', '1fr'])
    expect(plan.columnGap).toBe(16)
    expect(plan.rowGap).toBe(16)
    expect(plan.order).toEqual(['00', '01', '02', '10', '11', '12'])
    expect(plan.floating).toEqual(['badge'])
  })
})
