// Righelli in alto e a sinistra della tavola: tacche grandi con numero e tacche piccole, il cui passo
// segue lo zoom (le etichette restano a ~80 px di schermo l'una dall'altra). L'intervallo è quello
// visibile, non un intervallo fisso. Puro: chi disegna converte le posizioni in px dello schermo.

/** Larghezza (px dello schermo) del righello. */
export const RULER_SIZE = 20
/** Distanza minima desiderata fra due numeri sul righello, in px dello schermo. */
export const RULER_LABEL_SPACING = 80

/** Passo «tondo» (1, 2, 5 × 10ⁿ px della pagina) perché i numeri stiano ad almeno `minScreen` px. */
export function rulerStep(scale: number, minScreen = RULER_LABEL_SPACING): number {
  const minPage = minScreen / Math.max(scale, 0.0001)
  const power = 10 ** Math.floor(Math.log10(minPage))
  for (const m of [1, 2, 5, 10]) if (power * m >= minPage) return power * m
  return power * 10
}

export interface RulerTick {
  /** Posizione in px dello schermo dall'inizio del righello. */
  pos: number
  /** Valore in px della pagina (solo per le tacche grandi). */
  label?: string
  major: boolean
}

/**
 * Tacche per un righello lungo `length` px di schermo, dove il px di schermo 0 corrisponde al px della
 * pagina `origin` (può essere negativo se la pagina è spostata), con la scala dello zoom.
 */
export function rulerTicks(origin: number, length: number, scale: number): RulerTick[] {
  const step = rulerStep(scale)
  const minor = step / (step % 5 === 0 || step < 5 ? 5 : 2)
  const first = Math.floor(origin / minor) * minor
  const last = origin + length / scale
  const ticks: RulerTick[] = []
  // Indici interi: niente errori di virgola mobile che spostano le tacche.
  const startIndex = Math.round(first / minor)
  const endIndex = Math.ceil(last / minor)
  for (let i = startIndex; i <= endIndex; i++) {
    const value = i * minor
    const pos = (value - origin) * scale
    if (pos < 0 || pos > length) continue
    const major = Math.abs(value / step - Math.round(value / step)) < 1e-6
    ticks.push(major ? { pos, label: String(Math.round(value)), major } : { pos, major })
  }
  return ticks
}

/** Px della pagina sotto un px dello schermo del righello. */
export const rulerValueAt = (screenPos: number, origin: number, scale: number): number => origin + screenPos / scale

/** Guide trascinate dal righello: aggiunge (arrotondata al px), toglie se trascinata fuori (valore null). */
export function moveGuide(list: readonly number[], index: number, value: number | null): number[] {
  const out = [...list]
  if (index >= out.length) {
    if (value !== null) out.push(Math.round(value))
  } else if (value === null) out.splice(index, 1)
  else out[index] = Math.round(value)
  return out
}
