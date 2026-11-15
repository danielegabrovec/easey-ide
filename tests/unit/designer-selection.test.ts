import { describe, expect, it } from 'vitest'
import { parseHtml } from '@shared/designer/html-model'
import { boxBetween, marqueeHits, outermostLastFirst, type Box } from '@shared/designer/selection'

const page = parseHtml('<html><body><main><h1>Titolo</h1><p>Testo</p></main><h2>Fuori</h2><script src="a.js"></script></body></html>')
const id = (tag: string) => page.elements.findIndex((e) => e.tag === tag)

// Misure finte: main 0-400 × 0-200 con h1 e p dentro, h2 sotto.
const rects: Record<string, Box> = {
  main: { left: 0, top: 0, width: 400, height: 200 },
  h1: { left: 10, top: 10, width: 200, height: 40 },
  p: { left: 10, top: 60, width: 200, height: 20 },
  h2: { left: 10, top: 260, width: 150, height: 30 },
  body: { left: 0, top: 0, width: 800, height: 600 },
  script: { left: 0, top: 0, width: 0, height: 0 }
}
const rectOf = (n: number) => rects[page.elements[n]!.tag] ?? null

describe('rettangolo di selezione', () => {
  it('il rettangolo fra due punti, in qualunque verso', () => {
    expect(boxBetween({ x: 100, y: 50 }, { x: 20, y: 80 })).toEqual({ left: 20, top: 50, width: 80, height: 30 })
  })

  it('prende solo gli elementi tutti dentro', () => {
    expect(marqueeHits(page, { left: 0, top: 0, width: 220, height: 100 }, rectOf)).toEqual([id('h1'), id('p')])
    expect(marqueeHits(page, { left: 0, top: 0, width: 220, height: 55 }, rectOf)).toEqual([id('h1')])
  })

  it('un contenitore preso intero vale per i suoi figli; mai body né script', () => {
    expect(marqueeHits(page, { left: -5, top: -5, width: 500, height: 400 }, rectOf)).toEqual([id('main'), id('h2')])
  })

  it('Canc su più elementi: senza i figli degli altri scelti, dal fondo della pagina', () => {
    expect(outermostLastFirst(page, [id('h1'), id('main'), id('h2')])).toEqual([id('h2'), id('main')])
  })
})
