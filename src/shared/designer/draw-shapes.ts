// Cosa crea ogni strumento di disegno della tavola (1.7): il frammento HTML e le regole CSS di base.
// Lo strumento e la misura vengono dal canvas kit (`DRAW_TOOLS`, `drawnRect`); posizione e misura vanno
// nella regola `#id` dell'elemento, come per gli altri elementi liberi. Puro e testato.
import type { DrawTool } from '../canvas-kit/draw'
import { FREE_CANVAS_CLASS } from './html-model'

export interface DrawnShape {
  /** Tag della radice (serve per suggerire l'id: «div-3», «p-2»). */
  tag: string
  html: string
  /** Regole comuni (aggiunte una volta sola al foglio di stile). */
  css?: string
}

const SHAPE_CSS = `.lab-rettangolo {
  background: #dfe3ff;
  border-radius: 8px;
}

.lab-ellisse {
  background: #ffd8e8;
  border-radius: 50%;
}`

const FRAME_CSS = `.${FREE_CANVAS_CLASS} {
  position: relative;
  overflow: hidden;
  background: #ffffff;
  box-shadow: 0 0 0 1px #e5e8ef;
}`

const TEXT_CSS = `.lab-testo {
  margin: 0;
  font-size: 18px;
  line-height: 1.4;
}`

const BUTTON_CSS = `.lab-bottone {
  border: 0;
  border-radius: 10px;
  background: #6d7cff;
  color: #ffffff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}`

const IMAGE_CSS = `.lab-immagine {
  display: block;
  max-width: 100%;
  height: auto;
  object-fit: cover;
}`

/** Il frammento di uno strumento che disegna (null per Seleziona e Mano). */
export function drawnShape(tool: DrawTool): DrawnShape | null {
  switch (tool) {
    case 'frame':
      return { tag: 'div', html: `<div class="${FREE_CANVAS_CLASS}"></div>`, css: FRAME_CSS }
    case 'rect':
      return { tag: 'div', html: '<div class="lab-rettangolo"></div>', css: SHAPE_CSS }
    case 'ellipse':
      return { tag: 'div', html: '<div class="lab-ellisse"></div>', css: SHAPE_CSS }
    case 'text':
      return { tag: 'p', html: '<p class="lab-testo">Testo</p>', css: TEXT_CSS }
    case 'button':
      return { tag: 'button', html: '<button type="button" class="lab-bottone">Pulsante</button>', css: BUTTON_CSS }
    case 'image':
      return { tag: 'img', html: '<img class="lab-immagine" src="img/segnaposto-foto-1.svg" alt="Descrivi l’immagine">', css: IMAGE_CSS }
    default:
      return null
  }
}

/**
 * Dichiarazioni della regola `#id` di una forma disegnata: posizione assoluta nel contenitore, misura
 * disegnata e margine zero (left/top sono proprio l'angolo, come per ogni elemento libero). Il testo non
 * riceve un'altezza fissa: va a capo e cresce.
 */
export function drawnDeclarations(tool: DrawTool, box: { left: number; top: number; width: number; height: number }): Record<string, string> {
  const out: Record<string, string> = {
    position: 'absolute',
    left: `${Math.round(box.left)}px`,
    top: `${Math.round(box.top)}px`,
    width: `${Math.round(box.width)}px`,
    margin: '0'
  }
  if (tool === 'text') out['min-height'] = `${Math.round(box.height)}px`
  else out['height'] = `${Math.round(box.height)}px`
  return out
}
