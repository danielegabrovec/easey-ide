// Striscia degli strumenti di disegno a sinistra della tela, come negli editor di grafica:
// V seleziona, H mano, F tavola, R rettangolo, O ellisse, T testo, B bottone, I immagine. Esc torna a V.
import type { ComponentType } from 'react'
import { Circle, Frame, Hand, Image, MousePointer2, RectangleHorizontal, Square, Type } from 'lucide-react'
import { DRAW_TOOLS, type DrawTool } from '@shared/canvas-kit/draw'
import { t } from '../../i18n'
import { useCanvasView } from './view-state'

const ICONS: Record<DrawTool, ComponentType<{ size?: number }>> = {
  select: MousePointer2,
  hand: Hand,
  frame: Frame,
  rect: Square,
  ellipse: Circle,
  text: Type,
  button: RectangleHorizontal,
  image: Image
}

export function DrawTools() {
  const tool = useCanvasView((s) => s.tool)
  return (
    <div className="draw-tools" role="toolbar" aria-label={t('designer.drawTools')} aria-orientation="vertical" data-testid="draw-tools">
      {DRAW_TOOLS.map((info, index) => {
        const Icon = ICONS[info.tool]
        return (
          <span key={info.tool} style={{ display: 'contents' }}>
            {index === 2 && <span className="draw-sep" />}
            <button
              className={`icon-btn${tool === info.tool ? ' active' : ''}`}
              title={`${t(`designer.tool.${info.tool}` as 'designer.tool.select')} (${info.key})`}
              aria-label={t(`designer.tool.${info.tool}` as 'designer.tool.select')}
              aria-pressed={tool === info.tool}
              onClick={() => useCanvasView.getState().setTool(info.tool)}
              data-testid={`tool-${info.tool}`}
            >
              <Icon size={15} />
            </button>
          </span>
        )
      })}
    </div>
  )
}
