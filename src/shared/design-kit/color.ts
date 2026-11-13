// Colori del design kit: lettura (#hex, rgb()), OKLCH ⇄ sRGB, scale 50–900 da un solo colore,
// armonie e miscele. OKLCH è uno spazio «percettivo»: stessa L = stessa chiarezza percepita, quindi le
// scale e le armonie restano equilibrate qualunque sia la tinta di partenza.
// Codice puro (niente DOM): lo usano il designer HTML e, in futuro, le schermate.

export interface Rgb {
  /** 0–255 */
  r: number
  g: number
  b: number
  /** 0–1 */
  a: number
}

export interface Oklch {
  /** Chiarezza 0–1. */
  l: number
  /** Saturazione (croma), circa 0–0,37. */
  c: number
  /** Tinta in gradi 0–360. */
  h: number
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Legge #rgb, #rrggbb, #rrggbbaa, rgb()/rgba() (con virgole o spazi). null se non è un colore leggibile. */
export function parseColor(value: string): Rgb | null {
  const text = value.trim().toLowerCase()
  const hex = /^#([0-9a-f]{3,8})$/.exec(text)?.[1]
  if (hex) {
    const full = hex.length === 3 || hex.length === 4 ? hex.replace(/./g, (c) => c + c) : hex
    if (full.length !== 6 && full.length !== 8) return null
    const n = (i: number) => parseInt(full.slice(i, i + 2), 16)
    return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) / 255 : 1 }
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(text)?.[1]
  if (fn) {
    const parts = fn.split(/[\s,/]+/).filter(Boolean)
    if (parts.length < 3) return null
    const channel = (p: string) => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p))
    const alpha = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])
    const [r, g, b] = parts.slice(0, 3).map(channel) as [number, number, number]
    if ([r, g, b, alpha].some((v) => Number.isNaN(v))) return null
    return { r, g, b, a: alpha }
  }
  if (text === 'white') return { r: 255, g: 255, b: 255, a: 1 }
  if (text === 'black') return { r: 0, g: 0, b: 0, a: 1 }
  return null
}

export function toHex(color: Rgb): string {
  const h = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${h(color.r)}${h(color.g)}${h(color.b)}${color.a < 1 ? h(color.a * 255) : ''}`
}

/** #rrggbb normalizzato (null se il valore non è un colore). */
export function normalizeHex(value: string): string | null {
  const color = parseColor(value)
  return color ? toHex({ ...color, a: 1 }) : null
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

function rgbToOklab({ r, g, b }: Rgb): [number, number, number] {
  const lr = toLinear(r / 255)
  const lg = toLinear(g / 255)
  const lb = toLinear(b / 255)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}

/** OKLab → sRGB lineare (può uscire da 0–1 se il colore non è rappresentabile). */
function oklabToLinear(L: number, A: number, B: number): [number, number, number] {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
}

export function toOklch(color: Rgb): Oklch {
  const [l, a, b] = rgbToOklab(color)
  const c = Math.hypot(a, b)
  const h = c < 1e-4 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
  return { l, c, h }
}

const inGamut = (rgb: [number, number, number]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4)

/** OKLCH → sRGB; se il colore è fuori dallo schermo si riduce la saturazione (stessa chiarezza e tinta). */
export function fromOklch({ l, c, h }: Oklch, alpha = 1): Rgb {
  const L = clamp01(l)
  const rad = (h * Math.PI) / 180
  let chroma = Math.max(0, c)
  let linear = oklabToLinear(L, chroma * Math.cos(rad), chroma * Math.sin(rad))
  if (!inGamut(linear)) {
    let low = 0
    let high = chroma
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2
      if (inGamut(oklabToLinear(L, mid * Math.cos(rad), mid * Math.sin(rad)))) low = mid
      else high = mid
    }
    chroma = low
    linear = oklabToLinear(L, chroma * Math.cos(rad), chroma * Math.sin(rad))
  }
  const [r, g, b] = linear.map((v) => Math.round(clamp01(fromLinear(clamp01(v))) * 255)) as [number, number, number]
  return { r, g, b, a: alpha }
}

export const oklchHex = (color: Oklch): string => toHex(fromOklch(color))

/** Stringa CSS `oklch(62% 0.19 264)` (i browser recenti la capiscono; utile da mostrare). */
export const oklchCss = ({ l, c, h }: Oklch): string => `oklch(${(l * 100).toFixed(1)}% ${c.toFixed(3)} ${h.toFixed(1)})`

/** Miscela percettiva (OKLab) di due colori: t = 0 → a, t = 1 → b. */
export function mix(a: string, b: string, t: number): string {
  const ca = parseColor(a)
  const cb = parseColor(b)
  if (!ca || !cb) return a
  const [l1, a1, b1] = rgbToOklab(ca)
  const [l2, a2, b2] = rgbToOklab(cb)
  const k = clamp01(t)
  const linear = oklabToLinear(l1 + (l2 - l1) * k, a1 + (a2 - a1) * k, b1 + (b2 - b1) * k)
  const [r, g, bl] = linear.map((v) => Math.round(clamp01(fromLinear(clamp01(v))) * 255)) as [number, number, number]
  return toHex({ r, g, b: bl, a: 1 })
}

export const SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const
export type ScaleStep = (typeof SCALE_STEPS)[number]

/** Chiarezza (OKLCH) di ogni gradino: 50 quasi bianco, 900 quasi nero. */
const STEP_LIGHTNESS: Record<ScaleStep, number> = { 50: 0.975, 100: 0.945, 200: 0.89, 300: 0.81, 400: 0.715, 500: 0.625, 600: 0.545, 700: 0.465, 800: 0.385, 900: 0.3 }

/**
 * Scala 50–900 di un colore (come le palette di Tailwind o Material): stessa tinta, chiarezza a gradini
 * e saturazione ridotta agli estremi (i quasi-bianchi e i quasi-neri troppo saturi sembrano sporchi).
 */
export function colorScale(base: string): Record<ScaleStep, string> {
  const color = parseColor(base) ?? { r: 79, g: 70, b: 229, a: 1 }
  const { c, h } = toOklch(color)
  const out = {} as Record<ScaleStep, string>
  for (const step of SCALE_STEPS) {
    const l = STEP_LIGHTNESS[step]
    const taper = step <= 100 ? 0.25 : step === 200 ? 0.5 : step === 300 ? 0.75 : step >= 800 ? 0.8 : 1
    out[step] = oklchHex({ l, c: c * taper, h })
  }
  return out
}

export type Harmony = 'complementare' | 'analoga' | 'triadica' | 'divisa'

const HARMONY_ANGLES: Record<Harmony, number[]> = { complementare: [180], analoga: [-30, 30], triadica: [120, 240], divisa: [150, 210] }

/** Colori armonici (stessa chiarezza e saturazione, tinta ruotata). */
export function harmony(base: string, kind: Harmony): string[] {
  const color = parseColor(base)
  if (!color) return []
  const lch = toOklch(color)
  return HARMONY_ANGLES[kind].map((angle) => oklchHex({ ...lch, h: (lch.h + angle + 360) % 360 }))
}

/** Ruota la tinta e regola chiarezza/saturazione (comodo per i segnaposto e le varianti). */
export function adjust(base: string, change: { hue?: number; lightness?: number; chroma?: number }): string {
  const color = parseColor(base)
  if (!color) return base
  const lch = toOklch(color)
  return oklchHex({ l: change.lightness ?? lch.l, c: change.chroma ?? lch.c, h: (lch.h + (change.hue ?? 0) + 360) % 360 })
}
