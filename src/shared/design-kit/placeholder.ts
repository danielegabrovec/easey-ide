// Segnaposto per immagini e ritratti: file SVG leggeri, con un gradiente tenue nei colori del tema e
// un'icona. Stanno nella cartella img/ del progetto, quindi si vedono anche senza Internet e restano
// nel sito esportato. Nei blocchi della palette si scrivono come `img/segnaposto-foto-1.svg`.
import { adjust, colorScale, parseColor } from './color'

export type PlaceholderKind = 'foto' | 'persona'

export interface PlaceholderColors {
  primary: string
  secondary: string
}

export const DEFAULT_PLACEHOLDER_COLORS: PlaceholderColors = { primary: '#4f46e5', secondary: '#9333ea' }

/** Segnaposto conosciuti: tipo e rotazione della tinta (così una galleria non ha tre immagini uguali). */
export const PLACEHOLDERS: Record<string, { kind: PlaceholderKind; hue: number }> = {
  'segnaposto-foto-1': { kind: 'foto', hue: 0 },
  'segnaposto-foto-2': { kind: 'foto', hue: 35 },
  'segnaposto-foto-3': { kind: 'foto', hue: -35 },
  'segnaposto-foto-4': { kind: 'foto', hue: 70 },
  'segnaposto-persona-1': { kind: 'persona', hue: 0 },
  'segnaposto-persona-2': { kind: 'persona', hue: 40 },
  'segnaposto-persona-3': { kind: 'persona', hue: -40 }
}

const PATTERN = /img\/(segnaposto-[a-z0-9-]+)\.svg/g

/** Nomi dei segnaposto usati in un frammento HTML (senza doppioni, solo quelli conosciuti). */
export function placeholderNames(html: string): string[] {
  return [...new Set([...html.matchAll(PATTERN)].map((m) => m[1]!))].filter((name) => name in PLACEHOLDERS)
}

export const placeholderPath = (name: string): string => `img/${name}.svg`

function usable(color: string, fallback: string): string {
  return parseColor(color) ? color : fallback
}

/** SVG del segnaposto `name` (null se il nome non è conosciuto). */
export function placeholderSvg(name: string, colors: PlaceholderColors = DEFAULT_PLACEHOLDER_COLORS): string | null {
  const spec = PLACEHOLDERS[name]
  if (!spec) return null
  const primary = adjust(usable(colors.primary, DEFAULT_PLACEHOLDER_COLORS.primary), { hue: spec.hue })
  const secondary = adjust(usable(colors.secondary, DEFAULT_PLACEHOLDER_COLORS.secondary), { hue: spec.hue })
  const a = colorScale(primary)
  const b = colorScale(secondary)
  if (spec.kind === 'persona') {
    return [
      '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480" role="img" aria-label="Segnaposto per un ritratto">',
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a[100]}"/><stop offset="1" stop-color="${b[200]}"/></linearGradient></defs>`,
      '<rect width="480" height="480" fill="url(#g)"/>',
      `<circle cx="240" cy="190" r="78" fill="${a[300]}" opacity="0.85"/>`,
      `<path d="M92 480c0-92 66-158 148-158s148 66 148 158z" fill="${a[400]}" opacity="0.8"/>`,
      '</svg>'
    ].join('')
  }
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800" role="img" aria-label="Segnaposto per una foto">',
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a[100]}"/><stop offset="1" stop-color="${b[200]}"/></linearGradient></defs>`,
    '<rect width="1200" height="800" fill="url(#g)"/>',
    `<circle cx="880" cy="250" r="90" fill="${b[300]}" opacity="0.9"/>`,
    `<path d="M0 620 300 380l170 150 190-230 540 320v180H0z" fill="${a[300]}" opacity="0.75"/>`,
    `<path d="M0 700 260 520l200 120 230-160 510 230v90H0z" fill="${a[400]}" opacity="0.7"/>`,
    '</svg>'
  ].join('')
}
