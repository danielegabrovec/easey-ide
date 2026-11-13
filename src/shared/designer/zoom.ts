// Zoom e spostamento della vista del canvas del designer (calcoli puri, testati).
// La pagina è disegnata in un iframe largo quanto il punto di interruzione (1200/820/390 px) e scalata;
// la scala vale «adatta» (null: la pagina entra in larghezza, mai oltre il 100 %) oppure un valore fisso.
// In verticale la vista si sposta scorrendo la pagina dentro l'iframe; in orizzontale spostando il
// riquadro (`stageX`) quando è più largo dello spazio disponibile.

export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 4
/** Gradini di Ctrl+= / Ctrl+- e dei pulsanti + / −. */
export const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2, 3, 4]
/** Valori proposti nel menu dello zoom. */
export const ZOOM_CHOICES = [0.25, 0.5, 0.75, 1, 1.5, 2, 3]
/** Margine (px dello schermo) attorno alla pagina nel canvas. */
export const STAGE_PAD = 12

export const clampZoom = (value: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 1000) / 1000))

/** Scala «adatta»: la pagina entra in larghezza, senza mai superare il 100 %. */
export function fitScale(hostWidth: number, pageWidth: number): number {
  const available = hostWidth - 2 * STAGE_PAD
  if (available <= 0 || pageWidth <= 0) return 1
  return clampZoom(Math.min(1, available / pageWidth))
}

/** Gradino successivo (direzione 1) o precedente (-1) rispetto alla scala attuale. */
export function stepZoom(current: number, direction: 1 | -1): number {
  const epsilon = 0.005
  if (direction > 0) return ZOOM_STEPS.find((s) => s > current + epsilon) ?? ZOOM_MAX
  return [...ZOOM_STEPS].reverse().find((s) => s < current - epsilon) ?? ZOOM_MIN
}

/** Ctrl+rotellina (e il pizzico sul touchpad): zoom continuo e proporzionale allo spostamento. */
export function wheelZoom(current: number, deltaY: number): number {
  const delta = Math.max(-200, Math.min(200, deltaY))
  return clampZoom(current * Math.exp(-delta * 0.0025))
}

/** «34 %». */
export const zoomPercent = (scale: number): string => `${Math.round(scale * 100)} %`

/**
 * Posizione orizzontale del riquadro della pagina (px dello schermo dal bordo sinistro del canvas):
 * centrato se c'è spazio, altrimenti `pan` limitato in modo che la pagina non esca mai del tutto.
 */
export function stageX(hostWidth: number, visualWidth: number, pan: number): number {
  if (visualWidth + 2 * STAGE_PAD <= hostWidth) return Math.round((hostWidth - visualWidth) / 2)
  return Math.round(Math.min(STAGE_PAD, Math.max(hostWidth - STAGE_PAD - visualWidth, pan)))
}

export interface ZoomAround {
  /** Nuova posizione orizzontale desiderata del riquadro (da passare come `pan`). */
  pan: number
  /** Nuovo scorrimento verticale della pagina (px della pagina). */
  scrollTop: number
}

/**
 * Zoom attorno a un punto (il puntatore o il centro della vista): il punto della pagina che sta sotto
 * resta sotto anche dopo il cambio di scala. `x`/`y` sono relativi al canvas, `stageLeft`/`stageTop` è
 * dove sta ora il riquadro, `scrollTop` lo scorrimento attuale della pagina.
 */
export function zoomAround(options: { from: number; to: number; x: number; y: number; stageLeft: number; stageTop: number; scrollTop: number }): ZoomAround {
  const { from, to, x, y, stageLeft, stageTop, scrollTop } = options
  const pageX = (x - stageLeft) / from
  const pageY = scrollTop + (y - stageTop) / from
  return { pan: x - pageX * to, scrollTop: Math.max(0, pageY - (y - stageTop) / to) }
}
