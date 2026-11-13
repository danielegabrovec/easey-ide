// Contrasto WCAG 2.2 fra testo e sfondo: rapporto (1–21), livello e correzione automatica
// (il colore più vicino che raggiunge la soglia cambiando solo la chiarezza, così la tinta resta).
import { fromOklch, parseColor, toHex, toOklch, type Rgb } from './color'

/** Soglie WCAG: 4,5 per il testo normale, 3 per il testo grande (≥ 24 px, o ≥ 18,66 px in grassetto) e la grafica. */
export const AA_TEXT = 4.5
export const AA_LARGE = 3
export const AAA_TEXT = 7

const channel = (v: number) => {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Luminanza relativa (0 nero – 1 bianco). */
export function luminance(color: Rgb): number {
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
}

/** Un colore semitrasparente sopra uno sfondo pieno. */
export function flatten(color: Rgb, background: Rgb): Rgb {
  const a = color.a
  return { r: color.r * a + background.r * (1 - a), g: color.g * a + background.g * (1 - a), b: color.b * a + background.b * (1 - a), a: 1 }
}

/** Rapporto di contrasto WCAG fra due colori (null se uno dei due non si legge). */
export function contrastRatio(foreground: string, background: string): number | null {
  const bg = parseColor(background)
  const fgRaw = parseColor(foreground)
  if (!bg || !fgRaw) return null
  const base = bg.a < 1 ? flatten(bg, { r: 255, g: 255, b: 255, a: 1 }) : bg
  const fg = fgRaw.a < 1 ? flatten(fgRaw, base) : fgRaw
  const [a, b] = [luminance(fg), luminance(base)].sort((x, y) => y - x) as [number, number]
  return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100
}

/** Testo «grande» per WCAG: almeno 24 px, oppure 18,66 px in grassetto (≥ 700). */
export const isLargeText = (fontSizePx: number, fontWeight: number): boolean => fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700)

export type ContrastLevel = 'AAA' | 'AA' | 'AA-grande' | 'insufficiente'

export function contrastLevel(ratio: number, large = false): ContrastLevel {
  if (ratio >= AAA_TEXT) return 'AAA'
  if (ratio >= AA_TEXT) return 'AA'
  if (large && ratio >= AA_LARGE) return 'AA-grande'
  return 'insufficiente'
}

/** Soglia da raggiungere per un testo di questa misura. */
export const contrastTarget = (large: boolean): number => (large ? AA_LARGE : AA_TEXT)

/**
 * Il colore più vicino a `foreground` (stessa tinta, saturazione quasi uguale) che su `background`
 * raggiunge `target`. Si prova a scurire e a schiarire e si sceglie il cambiamento più piccolo che basta.
 * Restituisce il colore di partenza se basta già, il bianco o il nero se nessuna chiarezza basta.
 */
export function fixContrast(foreground: string, background: string, target = AA_TEXT): string {
  const fg = parseColor(foreground)
  const bg = parseColor(background)
  if (!fg || !bg) return foreground
  const start = toHex({ ...fg, a: 1 })
  if ((contrastRatio(start, background) ?? 0) >= target) return start
  const lch = toOklch(fg)
  const candidates: { color: string; distance: number }[] = []
  for (const direction of [-1, 1]) {
    for (let step = 1; step <= 100; step++) {
      const l = lch.l + (direction * step) / 100
      if (l < 0 || l > 1) break
      const color = toHex(fromOklch({ l, c: lch.c, h: lch.h }))
      if ((contrastRatio(color, background) ?? 0) >= target) {
        candidates.push({ color, distance: step })
        break
      }
    }
  }
  candidates.sort((a, b) => a.distance - b.distance)
  if (candidates[0]) return candidates[0].color
  return (contrastRatio('#ffffff', background) ?? 0) >= (contrastRatio('#000000', background) ?? 0) ? '#ffffff' : '#000000'
}

/** Bianco o un testo scuro: quello che si legge meglio su questo sfondo. */
export function readableOn(background: string, dark = '#111827', light = '#ffffff'): string {
  return (contrastRatio(light, background) ?? 0) >= (contrastRatio(dark, background) ?? 0) ? light : dark
}
