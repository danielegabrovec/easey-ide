// Guide d'aggancio, distanze uguali, misure in px e angolo di rotazione, disegnate sopra la pagina.
// Hanno un piccolo stato a parte: muovendo il mouse si ridisegna solo questo livello, non tutto il canvas.
import { create } from 'zustand'
import type { Guide, SpacingHint } from '@shared/canvas-kit/snap'
import { measureLabel, type Measure } from '@shared/canvas-kit/measure'

export interface SnapView {
  /** Dove sta lo (0,0) del contenitore nel livello del canvas (px della pagina, finestra dell'iframe). */
  origin: { x: number; y: number }
  guides: Guide[]
  spacing: SpacingHint[]
  measures: Measure[]
  /** Etichetta libera (es. «45°» durante la rotazione), nelle coordinate del livello. */
  label: { text: string; x: number; y: number } | null
}

const EMPTY: SnapView = { origin: { x: 0, y: 0 }, guides: [], spacing: [], measures: [], label: null }

export const useSnapView = create<{ view: SnapView; signature: string }>(() => ({ view: EMPTY, signature: '' }))

/** Aggiorna il livello solo se cambia davvero qualcosa (niente ridisegni inutili a ogni movimento). */
export function showSnap(view: Partial<SnapView> | null): void {
  const next = view ? { ...EMPTY, ...view } : EMPTY
  const signature = JSON.stringify(next)
  if (signature !== useSnapView.getState().signature) useSnapView.setState({ view: next, signature })
}

function segmentStyle(axis: 'x' | 'y', from: number, to: number, at: number, o: { x: number; y: number }): React.CSSProperties {
  return axis === 'x' ? { left: o.x + from, top: o.y + at, width: Math.max(0, to - from) } : { left: o.x + at, top: o.y + from, height: Math.max(0, to - from) }
}

export function SnapLayer() {
  const view = useSnapView((s) => s.view)
  const o = view.origin
  return (
    <>
      {view.guides.map((g) => (
        <div key={`g${g.axis}${g.at}`} className={`dz-snap ${g.axis === 'x' ? 'v' : 'h'}`} style={g.axis === 'x' ? { left: o.x + g.at, top: o.y + g.from, height: Math.max(0, g.to - g.from) } : { top: o.y + g.at, left: o.x + g.from, width: Math.max(0, g.to - g.from) }} data-testid="designer-snap-guide" />
      ))}
      {view.spacing.map((s, i) => (
        <div key={`s${i}`} className={`dz-spacing ${s.axis === 'x' ? 'h' : 'v'}`} style={segmentStyle(s.axis, s.from, s.to, s.at, o)} data-testid="designer-spacing">
          <span>{Math.round(s.gap)}</span>
        </div>
      ))}
      {view.measures.map((m, i) => (
        <div key={`m${i}`} className={`dz-measure ${m.axis === 'x' ? 'h' : 'v'}`} style={segmentStyle(m.axis, m.from, m.to, m.at, o)} data-testid="designer-measure">
          <span>{measureLabel(m)}</span>
        </div>
      ))}
      {view.label && (
        <div className="dz-angle" style={{ left: view.label.x, top: view.label.y }} data-testid="designer-angle">
          {view.label.text}
        </div>
      )}
    </>
  )
}
