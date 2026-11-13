// Pannello AI laterale (standard «Pannello AI laterale» nel vault Cerebro): limiti di larghezza,
// trascinamento e tastiera della maniglia, stato ricordato. Solo logica pura, collaudata in tests/unit.
// L'interfaccia sta in src/renderer/workbench/SidePanel.tsx.

/** Larghezza minima del pannello, in pixel. */
export const SIDE_MIN_WIDTH = 300
/** Larghezza massima: questa frazione della finestra (anche la larghezza «espansa»). */
export const SIDE_MAX_RATIO = 0.7
/** Larghezza alla prima apertura. */
export const SIDE_DEFAULT_WIDTH = 400
/** Passo delle frecce sulla maniglia (con Maiusc il triplo). */
export const SIDE_KEY_STEP = 20

export interface SidePanelState {
  open: boolean
  /** Larghezza scelta dall'utente (quella a cui si torna riducendo). */
  width: number
  /** true: il pannello occupa il massimo (70 % della finestra). */
  expanded: boolean
}

export const DEFAULT_SIDE_STATE: SidePanelState = { open: false, width: SIDE_DEFAULT_WIDTH, expanded: false }

/** Larghezza massima per una finestra larga `windowWidth` (mai sotto il minimo). */
export function maxSideWidth(windowWidth: number): number {
  return Math.max(SIDE_MIN_WIDTH, Math.floor(windowWidth * SIDE_MAX_RATIO))
}

/** Riporta una larghezza nei limiti: min 300 px, max 70 % della finestra. */
export function clampSideWidth(width: number, windowWidth: number): number {
  const value = Number.isFinite(width) ? Math.round(width) : SIDE_DEFAULT_WIDTH
  return Math.min(maxSideWidth(windowWidth), Math.max(SIDE_MIN_WIDTH, value))
}

/** Larghezza effettiva mostrata: il massimo se espanso, altrimenti quella scelta (nei limiti). */
export function effectiveSideWidth(state: SidePanelState, windowWidth: number): number {
  return state.expanded ? maxSideWidth(windowWidth) : clampSideWidth(state.width, windowWidth)
}

/**
 * Trascinamento della maniglia sul bordo sinistro: spostarsi a sinistra allarga il pannello.
 * `startWidth` è la larghezza effettiva all'inizio del trascinamento.
 */
export function dragSideWidth(startWidth: number, startX: number, currentX: number, windowWidth: number): number {
  return clampSideWidth(startWidth + (startX - currentX), windowWidth)
}

/**
 * Tasti sulla maniglia (role separator): ← allarga, → stringe, Home al minimo, End al massimo,
 * PagSu/PagGiù a passi grandi. Restituisce la nuova larghezza o null se il tasto non c'entra.
 */
export function keySideWidth(width: number, key: string, windowWidth: number, shift = false): number | null {
  const step = shift ? SIDE_KEY_STEP * 3 : SIDE_KEY_STEP
  switch (key) {
    case 'ArrowLeft':
      return clampSideWidth(width + step, windowWidth)
    case 'ArrowRight':
      return clampSideWidth(width - step, windowWidth)
    case 'PageUp':
      return clampSideWidth(width + SIDE_KEY_STEP * 5, windowWidth)
    case 'PageDown':
      return clampSideWidth(width - SIDE_KEY_STEP * 5, windowWidth)
    case 'Home':
      return SIDE_MIN_WIDTH
    case 'End':
      return maxSideWidth(windowWidth)
    default:
      return null
  }
}

/** Stato salvato (JSON di localStorage) ripulito: valori mancanti o sbagliati tornano ai predefiniti. */
export function parseSideState(raw: string | null | undefined): SidePanelState {
  if (!raw) return { ...DEFAULT_SIDE_STATE }
  try {
    const data = JSON.parse(raw) as Partial<Record<keyof SidePanelState, unknown>>
    const width = typeof data.width === 'number' && Number.isFinite(data.width) && data.width > 0 ? Math.round(data.width) : SIDE_DEFAULT_WIDTH
    return {
      open: data.open === true,
      width: Math.max(SIDE_MIN_WIDTH, width),
      expanded: data.expanded === true
    }
  } catch {
    return { ...DEFAULT_SIDE_STATE }
  }
}
