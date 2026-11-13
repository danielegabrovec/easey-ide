import { describe, expect, it } from 'vitest'
import { clampZoom, fitScale, STAGE_PAD, stageX, stepZoom, wheelZoom, ZOOM_MAX, ZOOM_MIN, zoomAround, zoomPercent } from '@shared/designer/zoom'

describe('zoom del canvas', () => {
  it('«adatta» fa entrare la pagina in larghezza senza superare il 100 %', () => {
    expect(fitScale(1200 + 2 * STAGE_PAD, 1200)).toBe(1)
    expect(fitScale(2000, 1200)).toBe(1)
    expect(fitScale(384, 1200)).toBe(0.3)
    expect(fitScale(0, 1200)).toBe(1)
  })

  it('i gradini salgono e scendono senza saltare il 100 %', () => {
    expect(stepZoom(0.3, 1)).toBe(0.33)
    expect(stepZoom(0.9, 1)).toBe(1)
    expect(stepZoom(1, 1)).toBe(1.25)
    expect(stepZoom(1, -1)).toBe(0.9)
    expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX)
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN)
  })

  it('la rotellina ingrandisce verso l’alto e resta nei limiti', () => {
    expect(wheelZoom(1, -100)).toBeGreaterThan(1)
    expect(wheelZoom(1, 100)).toBeLessThan(1)
    expect(wheelZoom(3.9, -5000)).toBe(ZOOM_MAX)
    expect(wheelZoom(0.11, 5000)).toBe(ZOOM_MIN)
    expect(clampZoom(0.123456)).toBe(0.123)
  })

  it('percentuale leggibile', () => {
    expect(zoomPercent(0.333)).toBe('33 %')
    expect(zoomPercent(2)).toBe('200 %')
  })

  it('pagina centrata se entra, altrimenti spostabile senza uscire del tutto', () => {
    expect(stageX(1000, 400, -300)).toBe(300)
    expect(stageX(1000, 2400, 12)).toBe(STAGE_PAD)
    expect(stageX(1000, 2400, 500)).toBe(STAGE_PAD)
    expect(stageX(1000, 2400, -5000)).toBe(1000 - STAGE_PAD - 2400)
    expect(stageX(1000, 2400, -700)).toBe(-700)
  })

  it('lo zoom tiene fermo il punto sotto il puntatore', () => {
    const from = 0.5
    const to = 2
    const pointer = { x: 400, y: 300 }
    const before = { stageLeft: 100, stageTop: STAGE_PAD, scrollTop: 200 }
    const pageX = (pointer.x - before.stageLeft) / from
    const pageY = before.scrollTop + (pointer.y - before.stageTop) / from
    const next = zoomAround({ from, to, ...pointer, ...before })
    expect(next.pan + pageX * to).toBeCloseTo(pointer.x)
    expect(STAGE_PAD + (pageY - next.scrollTop) * to).toBeCloseTo(pointer.y)
  })

  it('in cima alla pagina lo scorrimento non diventa negativo', () => {
    expect(zoomAround({ from: 2, to: 0.5, x: 10, y: 200, stageLeft: 12, stageTop: 12, scrollTop: 0 }).scrollTop).toBe(0)
  })
})
