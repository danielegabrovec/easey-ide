// Righelli in alto e a sinistra della tela (1.7): numeri in px della pagina che seguono zoom e scorrimento,
// la selezione evidenziata, il mirino del puntatore (mosso dal Canvas direttamente nel DOM, senza ridisegni)
// e le guide: si trascinano fuori dal righello (alto = guida orizzontale, sinistra = verticale).
import type { RefObject } from 'react'
import { RULER_SIZE, rulerTicks } from '@shared/canvas-kit/rulers'
import { t } from '../../i18n'

export interface RulerView {
  width: number
  height: number
  /** Px della pagina sotto il px 0 (sinistro / alto) della tela. */
  originX: number
  originY: number
  scale: number
  /** Selezione in px della tela (schermo, dal bordo della tela). */
  selection: { x0: number; x1: number; y0: number; y1: number } | null
}

function Ticks({ origin, length, scale, vertical }: { origin: number; length: number; scale: number; vertical: boolean }) {
  return (
    <>
      {rulerTicks(origin, length, scale).map((tick) => (
        <span key={tick.pos} className={`ruler-tick${tick.major ? ' major' : ''}`} style={vertical ? { top: tick.pos } : { left: tick.pos }}>
          {tick.label !== undefined && <span className="ruler-num">{tick.label}</span>}
        </span>
      ))}
    </>
  )
}

export function Rulers({ view, crossX, crossY, onGuideStart }: { view: RulerView; crossX: RefObject<HTMLDivElement | null>; crossY: RefObject<HTMLDivElement | null>; onGuideStart: (axis: 'x' | 'y', event: React.PointerEvent) => void }) {
  const sel = view.selection
  return (
    <>
      <div className="ruler-corner" style={{ width: RULER_SIZE, height: RULER_SIZE }} aria-hidden />
      <div className="ruler ruler-top" style={{ height: RULER_SIZE }} onPointerDown={(e) => e.button === 0 && onGuideStart('y', e)} title={t('designer.rulerHint')} data-testid="ruler-top">
        {sel && <span className="ruler-sel" style={{ left: sel.x0, width: Math.max(1, sel.x1 - sel.x0) }} />}
        <Ticks origin={view.originX} length={view.width} scale={view.scale} vertical={false} />
        <div ref={crossX} className="ruler-cross" />
      </div>
      <div className="ruler ruler-left" style={{ width: RULER_SIZE }} onPointerDown={(e) => e.button === 0 && onGuideStart('x', e)} title={t('designer.rulerHint')} data-testid="ruler-left">
        {sel && <span className="ruler-sel" style={{ top: sel.y0, height: Math.max(1, sel.y1 - sel.y0) }} />}
        <Ticks origin={view.originY} length={view.height} scale={view.scale} vertical />
        <div ref={crossY} className="ruler-cross" />
      </div>
    </>
  )
}
