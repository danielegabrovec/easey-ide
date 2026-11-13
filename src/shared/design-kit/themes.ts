// Temi del sito: colori con nomi umani (primario, secondario, sfondo, superficie, testo, tenue) e
// caratteri. Un tema si può anche generare da un solo colore: le armonie e il contrasto sono calcolati.
import { adjust, colorScale, mix, normalizeHex, parseColor, SCALE_STEPS, toOklch } from './color'
import { AA_TEXT, AAA_TEXT, contrastRatio, fixContrast } from './contrast'

export interface KitTheme {
  id: string
  label: string
  primary: string
  secondary: string
  background: string
  surface: string
  text: string
  muted: string
  headingFont: string
  bodyFont: string
}

export const SANS = "system-ui, 'Segoe UI', Roboto, sans-serif"
export const SERIF = "Georgia, 'Times New Roman', serif"

export const THEMES: KitTheme[] = [
  { id: 'indaco', label: 'Indaco', primary: '#4f46e5', secondary: '#9333ea', background: '#ffffff', surface: '#ffffff', text: '#1f2937', muted: '#6b7385', headingFont: SANS, bodyFont: SANS },
  { id: 'oceano', label: 'Oceano', primary: '#0369a1', secondary: '#06b6d4', background: '#f8fbfd', surface: '#ffffff', text: '#0f2533', muted: '#5b7180', headingFont: SANS, bodyFont: SANS },
  { id: 'foresta', label: 'Foresta', primary: '#15803d', secondary: '#84cc16', background: '#fbfdf8', surface: '#ffffff', text: '#1c2a1e', muted: '#5f6f61', headingFont: SERIF, bodyFont: SANS },
  { id: 'tramonto', label: 'Tramonto', primary: '#ea580c', secondary: '#db2777', background: '#fffaf5', surface: '#ffffff', text: '#2b1d16', muted: '#7a6458', headingFont: SANS, bodyFont: SANS },
  { id: 'elegante', label: 'Elegante', primary: '#9a6b2f', secondary: '#1f2937', background: '#fdfbf7', surface: '#ffffff', text: '#22201c', muted: '#776f63', headingFont: SERIF, bodyFont: SERIF },
  { id: 'notte', label: 'Notte', primary: '#818cf8', secondary: '#f472b6', background: '#0f172a', surface: '#1e293b', text: '#e2e8f0', muted: '#94a3b8', headingFont: SANS, bodyFont: SANS },
  { id: 'essenziale', label: 'Essenziale', primary: '#111827', secondary: '#6b7280', background: '#fafafa', surface: '#ffffff', text: '#111827', muted: '#6b7280', headingFont: SANS, bodyFont: SANS }
]

/** Ruoli dei colori del tema e variabile CSS di ciascuno (nell'ordine in cui si mostrano). */
export const COLOR_ROLES = [
  ['primary', '--colore-primario'],
  ['secondary', '--colore-secondario'],
  ['background', '--colore-sfondo'],
  ['surface', '--colore-superficie'],
  ['text', '--colore-testo'],
  ['muted', '--colore-tenue']
] as const

export type ColorRole = (typeof COLOR_ROLES)[number][0]

/** Scala 50–900 del colore primario come variabili (`--colore-primario-50` …): tinte pronte per sfondi e bordi. */
export function primaryScaleVariables(primary: string): Record<string, string> {
  const scale = colorScale(primary)
  return Object.fromEntries(SCALE_STEPS.map((step) => [`--colore-primario-${step}`, scale[step]]))
}

export type ThemeHarmony = 'analoga' | 'complementare' | 'triadica'

const HARMONY_HUE: Record<ThemeHarmony, number> = { analoga: 40, complementare: 180, triadica: 120 }

/**
 * Tema completo da un solo colore (es. quello del logo). Il primario si scurisce quanto basta perché il
 * testo bianco dei pulsanti si legga (4,5:1); testo e grigi sono della stessa tinta, molto desaturati;
 * il secondario è armonico. Con `dark` lo sfondo è scuro e i colori si schiariscono.
 */
export function themeFromColor(color: string, options: { harmony?: ThemeHarmony; dark?: boolean; label?: string } = {}): KitTheme {
  const base = normalizeHex(color) ?? '#4f46e5'
  const { c } = toOklch(parseColor(base)!)
  const chroma = Math.max(c, 0.02)
  const hue = HARMONY_HUE[options.harmony ?? 'analoga']
  if (options.dark) {
    const background = adjust(base, { lightness: 0.2, chroma: Math.min(0.03, chroma) })
    const surface = adjust(base, { lightness: 0.26, chroma: Math.min(0.035, chroma) })
    const text = adjust(base, { lightness: 0.94, chroma: 0.01 })
    const primary = fixContrast(adjust(base, { lightness: Math.max(0.7, toOklch(parseColor(base)!).l) }), background, AA_TEXT)
    return {
      id: 'personale',
      label: options.label ?? 'Personale',
      primary,
      secondary: fixContrast(adjust(primary, { hue }), background, 3),
      background,
      surface,
      text,
      muted: fixContrast(adjust(base, { lightness: 0.72, chroma: 0.02 }), surface, AA_TEXT),
      headingFont: SANS,
      bodyFont: SANS
    }
  }
  const primary = fixContrast(base, '#ffffff', AA_TEXT)
  const background = mix('#ffffff', colorScale(base)[50], 0.45)
  const text = adjust(base, { lightness: 0.24, chroma: Math.min(0.03, chroma * 0.25), hue: 0 })
  return {
    id: 'personale',
    label: options.label ?? 'Personale',
    primary,
    secondary: adjust(primary, { hue, chroma: Math.min(0.2, chroma) }),
    background,
    surface: '#ffffff',
    text: fixContrast(text, background, AAA_TEXT),
    muted: fixContrast(adjust(base, { lightness: 0.52, chroma: Math.min(0.025, chroma * 0.2) }), background, AA_TEXT),
    headingFont: SANS,
    bodyFont: SANS
  }
}

/** Controllo di un tema: i contrasti che contano (testo su sfondo e superficie, bianco sul primario). */
export function themeContrasts(theme: KitTheme): { pair: string; ratio: number; target: number }[] {
  const check = (pair: string, fg: string, bg: string, target: number) => ({ pair, ratio: contrastRatio(fg, bg) ?? 0, target })
  return [
    check('testo/sfondo', theme.text, theme.background, AA_TEXT),
    check('testo/superficie', theme.text, theme.surface, AA_TEXT),
    check('tenue/sfondo', theme.muted, theme.background, AA_TEXT),
    check('pulsante', '#ffffff', theme.primary, AA_TEXT)
  ]
}
