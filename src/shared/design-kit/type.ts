// Scala tipografica fluida: ogni gradino è un `clamp()` che cresce con la larghezza dello schermo
// (dal telefono a 360 px al computer a 1280 px), con rapporti diversi fra il piccolo e il grande.
// Così i titoli restano proporzionati sul telefono senza regole @media.

export const TYPE_STEPS = ['xs', 's', 'm', 'l', 'xl', '2xl', '3xl', '4xl', '5xl'] as const
export type TypeStep = (typeof TYPE_STEPS)[number]

/** Esponente di ogni gradino rispetto al testo normale (m = 0). */
const EXPONENT: Record<TypeStep, number> = { xs: -2, s: -1, m: 0, l: 1, xl: 2, '2xl': 3, '3xl': 4, '4xl': 5, '5xl': 6 }

export type TypeScaleId = 'compatta' | 'equilibrata' | 'editoriale'

export interface TypeScale {
  id: TypeScaleId
  /** Testo normale sul telefono e sul computer (px). */
  base: [number, number]
  /** Rapporto fra un gradino e il successivo sul telefono e sul computer. */
  ratio: [number, number]
}

export const TYPE_SCALES: TypeScale[] = [
  { id: 'compatta', base: [15, 16], ratio: [1.125, 1.2] },
  { id: 'equilibrata', base: [16, 17], ratio: [1.2, 1.25] },
  { id: 'editoriale', base: [16, 18], ratio: [1.2, 1.333] }
]

export const DEFAULT_TYPE_SCALE: TypeScaleId = 'equilibrata'

/** Misura minima del testo (px). */
export const MIN_TEXT = 12

export const FLUID_MIN_VIEWPORT = 360
export const FLUID_MAX_VIEWPORT = 1280

const round = (value: number, digits = 4) => Number(value.toFixed(digits))
const rem = (px: number) => `${round(px / 16)}rem`

/** `clamp()` che va da `minPx` (schermo stretto) a `maxPx` (schermo largo) in modo lineare. */
export function fluidSize(minPx: number, maxPx: number, minViewport = FLUID_MIN_VIEWPORT, maxViewport = FLUID_MAX_VIEWPORT): string {
  if (Math.abs(maxPx - minPx) < 0.01) return rem(maxPx)
  const slope = (maxPx - minPx) / (maxViewport - minViewport)
  const intercept = minPx - slope * minViewport
  const [low, high] = minPx < maxPx ? [minPx, maxPx] : [maxPx, minPx]
  const vw = round(slope * 100, 3)
  return `clamp(${rem(low)}, ${rem(intercept)} ${vw < 0 ? '-' : '+'} ${Math.abs(vw)}vw, ${rem(high)})`
}

/** Misure (px) di un gradino sul telefono e sul computer. */
export function stepSizes(scale: TypeScale, step: TypeStep): [number, number] {
  const n = EXPONENT[step]
  // Mai sotto i 12 px: il testo piccolo deve restare leggibile.
  return [round(Math.max(MIN_TEXT, scale.base[0] * scale.ratio[0] ** n), 2), round(Math.max(MIN_TEXT, scale.base[1] * scale.ratio[1] ** n), 2)]
}

export function typeScaleById(id: string | null | undefined): TypeScale {
  return TYPE_SCALES.find((s) => s.id === id) ?? TYPE_SCALES.find((s) => s.id === DEFAULT_TYPE_SCALE)!
}

/** Variabili CSS della scala: `--testo-xs` … `--testo-5xl`. */
export function typeVariables(id: TypeScaleId | string = DEFAULT_TYPE_SCALE): Record<string, string> {
  const scale = typeScaleById(id)
  const out: Record<string, string> = {}
  for (const step of TYPE_STEPS) {
    const [min, max] = stepSizes(scale, step)
    out[`--testo-${step}`] = fluidSize(min, max)
  }
  return out
}

export const typeVar = (step: TypeStep): string => `var(--testo-${step})`

/** Riconosce la scala in uso dalle variabili del foglio di stile (null se manca o è stata ritoccata). */
export function activeTypeScale(variables: Record<string, string>): TypeScaleId | null {
  for (const scale of TYPE_SCALES) {
    const expected = typeVariables(scale.id)
    if (Object.entries(expected).every(([name, value]) => variables[name] === value)) return scale.id
  }
  return null
}

/** Interlinea consigliata: stretta per i titoli grandi, ariosa per il testo. */
export function lineHeightFor(step: TypeStep): string {
  return EXPONENT[step] >= 4 ? '1.1' : EXPONENT[step] >= 2 ? '1.2' : EXPONENT[step] >= 1 ? '1.35' : '1.6'
}
