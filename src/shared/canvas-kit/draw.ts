// Strumenti di disegno della tavola (stile Figma): V seleziona, H mano, F tavola, R rettangolo,
// O ellisse, T testo, B bottone, I immagine. Un clic inserisce l'elemento alla misura base,
// un trascinamento lo crea della misura disegnata. Puro: il designer crea l'elemento vero.
import { rectBetween, type Point, type Rect } from './geometry'

export type DrawTool = 'select' | 'hand' | 'frame' | 'rect' | 'ellipse' | 'text' | 'button' | 'image'

export interface DrawToolInfo {
  tool: DrawTool
  key: string
  label: string
  /** Misura per il clic senza trascinare. */
  base: { width: number; height: number }
}

export const DRAW_TOOLS: readonly DrawToolInfo[] = [
  { tool: 'select', key: 'V', label: 'Seleziona', base: { width: 0, height: 0 } },
  { tool: 'hand', key: 'H', label: 'Mano (sposta la vista)', base: { width: 0, height: 0 } },
  { tool: 'frame', key: 'F', label: 'Tavola', base: { width: 320, height: 200 } },
  { tool: 'rect', key: 'R', label: 'Rettangolo', base: { width: 120, height: 80 } },
  { tool: 'ellipse', key: 'O', label: 'Ellisse', base: { width: 100, height: 100 } },
  { tool: 'text', key: 'T', label: 'Testo', base: { width: 160, height: 32 } },
  { tool: 'button', key: 'B', label: 'Bottone', base: { width: 140, height: 44 } },
  { tool: 'image', key: 'I', label: 'Immagine', base: { width: 200, height: 140 } }
]

/** Lo strumento di una scorciatoia (V, H, F, R, O, T, B, I; maiuscole o minuscole). */
export function toolForKey(key: string): DrawTool | null {
  const k = key.toUpperCase()
  return DRAW_TOOLS.find((t) => t.key === k)?.tool ?? null
}

export const isShapeTool = (tool: DrawTool): boolean => tool !== 'select' && tool !== 'hand'

/** Sotto questa distanza (px della pagina) il gesto è un clic: si usa la misura base. */
export const CLICK_DRAW = 4

/**
 * Riquadro disegnato fra il punto di partenza e quello attuale. `square` (Maiusc) rende lati uguali,
 * `fromCenter` (Alt) disegna dal centro. Con un gesto corto restituisce la misura base con l'angolo in alto a sinistra sul clic.
 */
export function drawnRect(start: Point, current: Point, tool: DrawTool, options: { square?: boolean; fromCenter?: boolean } = {}): Rect {
  const base = DRAW_TOOLS.find((t) => t.tool === tool)?.base ?? { width: 100, height: 100 }
  if (Math.abs(current.x - start.x) < CLICK_DRAW && Math.abs(current.y - start.y) < CLICK_DRAW) {
    return { left: start.x, top: start.y, width: base.width, height: base.height }
  }
  let dx = current.x - start.x
  let dy = current.y - start.y
  if (options.square) {
    const side = Math.max(Math.abs(dx), Math.abs(dy))
    dx = Math.sign(dx || 1) * side
    dy = Math.sign(dy || 1) * side
  }
  const end = { x: start.x + dx, y: start.y + dy }
  const from = options.fromCenter ? { x: start.x - dx, y: start.y - dy } : start
  const r = rectBetween(from, end)
  return { left: Math.round(r.left), top: Math.round(r.top), width: Math.max(8, Math.round(r.width)), height: Math.max(8, Math.round(r.height)) }
}
