// Stili pronti dell'ispettore (un clic = più proprietà insieme) e temi del sito (colori e caratteri
// come variabili CSS). Idea presa dagli editor visuali più diffusi: si parte da scelte coerenti e
// poi si ritocca; ogni valore resta CSS normale, leggibile nel foglio di stile.

import { activeFontPair } from '../design-kit/fonts'
import { THEMES, type KitTheme } from '../design-kit/themes'
import { designTokens } from '../design-kit/tokens'
import { activeTypeScale, DEFAULT_TYPE_SCALE, typeVariables, type TypeStep } from '../design-kit/type'

export type StylePatch = Record<string, string | null>

export interface StylePreset {
  id: string
  label: string
  styles: StylePatch
}

export type PresetGroup = 'text' | 'button' | 'box' | 'layout'

const PRIMARY = 'var(--colore-primario, #4f46e5)'

/** Gradino della scala tipografica del kit, con il valore della scala «equilibrata» se il sito non ce l'ha. */
const size = (step: TypeStep) => `var(--testo-${step}, ${typeVariables('equilibrata')[`--testo-${step}`]})`

export const TEXT_PRESETS: StylePreset[] = [
  { id: 'display', label: 'Titolo enorme', styles: { 'font-size': size('5xl'), 'font-weight': '800', 'line-height': '1.05', 'letter-spacing': '-0.02em', 'font-family': 'var(--font-titoli)', 'text-wrap': 'balance', 'max-width': '20ch' } },
  { id: 'titolo', label: 'Titolo', styles: { 'font-size': size('3xl'), 'font-weight': '700', 'line-height': '1.15', 'letter-spacing': '-0.01em', 'font-family': 'var(--font-titoli)', 'text-wrap': 'balance' } },
  { id: 'sottotitolo', label: 'Sottotitolo', styles: { 'font-size': size('xl'), 'font-weight': '600', 'line-height': '1.3', 'letter-spacing': null, 'text-wrap': 'balance' } },
  { id: 'corpo', label: 'Testo', styles: { 'font-size': size('m'), 'font-weight': '400', 'line-height': '1.6', 'letter-spacing': null, 'text-transform': null, 'max-width': '65ch' } },
  { id: 'didascalia', label: 'Didascalia', styles: { 'font-size': size('s'), 'font-weight': '400', 'line-height': '1.4', color: 'var(--colore-tenue, #6b7385)' } },
  { id: 'etichetta', label: 'Etichetta', styles: { 'font-size': size('xs'), 'font-weight': '700', 'letter-spacing': '0.08em', 'text-transform': 'uppercase' } }
]

export const BUTTON_PRESETS: StylePreset[] = [
  { id: 'pieno', label: 'Pieno', styles: { display: 'inline-block', padding: '12px 24px', border: `2px solid ${PRIMARY}`, 'border-radius': '10px', background: PRIMARY, color: '#ffffff', 'font-weight': '600', 'text-decoration': 'none', cursor: 'pointer' } },
  { id: 'contorno', label: 'Contorno', styles: { display: 'inline-block', padding: '12px 24px', border: `2px solid ${PRIMARY}`, 'border-radius': '10px', background: 'transparent', color: PRIMARY, 'font-weight': '600', 'text-decoration': 'none', cursor: 'pointer' } },
  { id: 'pillola', label: 'Pillola', styles: { display: 'inline-block', padding: '12px 28px', border: '0', 'border-radius': '999px', background: PRIMARY, color: '#ffffff', 'font-weight': '700', 'text-decoration': 'none', cursor: 'pointer' } },
  { id: 'morbido', label: 'Morbido', styles: { display: 'inline-block', padding: '10px 20px', border: '0', 'border-radius': '10px', background: `color-mix(in srgb, ${PRIMARY} 14%, transparent)`, color: PRIMARY, 'font-weight': '600', 'text-decoration': 'none', cursor: 'pointer' } },
  { id: 'collegamento', label: 'Solo testo', styles: { display: null, padding: '0', border: '0', background: 'none', color: PRIMARY, 'font-weight': '600', 'text-decoration': 'underline', cursor: 'pointer' } }
]

export const BOX_PRESETS: StylePreset[] = [
  { id: 'scheda', label: 'Scheda', styles: { padding: '24px', 'border-radius': 'var(--raggio-l, 16px)', background: 'var(--colore-superficie, #ffffff)', border: null, 'box-shadow': 'var(--ombra-2, 0 8px 24px rgba(0, 0, 0, 0.12))' } },
  { id: 'bordo', label: 'Bordo sottile', styles: { padding: '20px', 'border-radius': '12px', border: '1px solid #e5e8ef', 'box-shadow': null } },
  { id: 'evidenza', label: 'In evidenza', styles: { padding: '20px 24px', 'border-left': `4px solid ${PRIMARY}`, 'border-radius': '8px', background: `color-mix(in srgb, ${PRIMARY} 8%, transparent)` } },
  { id: 'vetro', label: 'Vetro', styles: { padding: '24px', 'border-radius': '16px', border: '1px solid rgba(255, 255, 255, 0.45)', background: 'rgba(255, 255, 255, 0.6)', 'backdrop-filter': 'blur(12px)' } },
  { id: 'scuro', label: 'Scuro', styles: { padding: '32px', 'border-radius': '16px', background: '#111827', color: '#f9fafb' } }
]

const FLEX_RESET: StylePatch = { 'grid-template-columns': null }
const GRID_RESET: StylePatch = { 'flex-direction': null, 'flex-wrap': null, 'justify-content': null }

export const LAYOUT_PRESETS: StylePreset[] = [
  { id: 'riga', label: 'In riga', styles: { ...FLEX_RESET, display: 'flex', 'flex-direction': 'row', 'flex-wrap': 'wrap', 'align-items': 'center', 'justify-content': null, gap: '16px' } },
  { id: 'colonna', label: 'In colonna', styles: { ...FLEX_RESET, display: 'flex', 'flex-direction': 'column', 'flex-wrap': null, 'align-items': null, 'justify-content': null, gap: '12px' } },
  { id: 'centrato', label: 'Tutto al centro', styles: { ...FLEX_RESET, display: 'flex', 'flex-direction': 'column', 'flex-wrap': null, 'align-items': 'center', 'justify-content': 'center', 'text-align': 'center', gap: '12px' } },
  { id: 'spazio', label: 'Ai due lati', styles: { ...FLEX_RESET, display: 'flex', 'flex-direction': 'row', 'flex-wrap': 'wrap', 'align-items': 'center', 'justify-content': 'space-between', gap: '16px' } },
  { id: 'griglia-2', label: 'Griglia da 2', styles: { ...GRID_RESET, display: 'grid', 'grid-template-columns': 'repeat(2, minmax(0, 1fr))', 'align-items': null, gap: '24px' } },
  { id: 'griglia-3', label: 'Griglia da 3', styles: { ...GRID_RESET, display: 'grid', 'grid-template-columns': 'repeat(3, minmax(0, 1fr))', 'align-items': null, gap: '24px' } },
  { id: 'griglia-auto', label: 'Griglia adattiva', styles: { ...GRID_RESET, display: 'grid', 'grid-template-columns': 'repeat(auto-fit, minmax(220px, 1fr))', 'align-items': null, gap: '20px' } }
]

const TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'li', 'blockquote', 'label', 'strong', 'em', 'small', 'cite', 'summary', 'figcaption', 'td', 'th', 'button'])
const BUTTON_TAGS = new Set(['a', 'button'])
const VOID_OR_TEXT_ONLY = new Set(['img', 'input', 'textarea', 'select', 'video', 'hr', 'br', 'span', 'a', 'button', 'strong', 'em', 'small', 'label', 'cite', 'summary', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'td', 'th', 'figcaption'])

/** Gruppi di stili pronti adatti a un elemento (per tag e, per i pulsanti, anche per tipo di input). */
export function presetGroupsFor(tag: string, attrs: Record<string, string> = {}): PresetGroup[] {
  const groups: PresetGroup[] = []
  if (BUTTON_TAGS.has(tag) || (tag === 'input' && ['submit', 'button', 'reset'].includes(attrs['type'] ?? ''))) groups.push('button')
  if (TEXT_TAGS.has(tag)) groups.push('text')
  if (!VOID_OR_TEXT_ONLY.has(tag) && tag !== 'html') {
    groups.push('layout')
    if (tag !== 'body') groups.push('box')
  }
  return groups
}

export const PRESETS: Record<PresetGroup, StylePreset[]> = { text: TEXT_PRESETS, button: BUTTON_PRESETS, box: BOX_PRESETS, layout: LAYOUT_PRESETS }

// ---------------------------------------------------------------- temi del sito

// I temi vivono nel design kit (condiviso): qui restano i nomi usati dal designer.
export type SiteTheme = KitTheme
export { THEMES }

/**
 * Nomi brevi dei modelli di progetto (fino alla 1.3 avevano colori propri): se il foglio di stile li usa,
 * il tema li collega alle variabili del tema, così anche i pulsanti «vecchi» cambiano colore.
 */
export const LEGACY_ALIASES: Record<string, string> = { '--accento': 'var(--colore-primario)', '--sfondo': 'var(--colore-sfondo)', '--testo': 'var(--colore-testo)' }

/**
 * Regole CSS di un tema: variabili in :root (con gli alias dei nomi brevi già presenti fra `variables`),
 * poi pagina, titoli e collegamenti che le usano.
 */
export function themeRules(theme: SiteTheme, variables: Record<string, string> = {}): { selector: string; styles: StylePatch }[] {
  const aliases = Object.fromEntries(Object.entries(LEGACY_ALIASES).filter(([name]) => name in variables))
  // Tutti i token del kit (scala del primario, testo, spazi, raggi, ombre). La scala del testo resta
  // quella scelta; una coppia di caratteri del kit già scelta resta (il tema cambia solo i colori).
  const tokens = designTokens({ theme, typeScale: activeTypeScale(variables) ?? DEFAULT_TYPE_SCALE })
  if (activeFontPair(variables)) {
    delete tokens['--font-titoli']
    delete tokens['--font-testo']
  }
  // Testo, spazi, raggi e ombre già presenti (magari ritoccati a mano) non si toccano: il tema porta i colori.
  for (const name of Object.keys(tokens)) if (!name.startsWith('--colore-') && !name.startsWith('--font-') && name in variables) delete tokens[name]
  return [
    {
      selector: ':root',
      styles: { ...tokens, ...aliases }
    },
    { selector: 'body', styles: { background: 'var(--colore-sfondo)', color: 'var(--colore-testo)', 'font-family': 'var(--font-testo)' } },
    { selector: ':is(h1, h2, h3, h4)', styles: { 'font-family': 'var(--font-titoli)' } },
    { selector: 'a', styles: { color: 'var(--colore-primario)' } }
  ]
}

/** Il tema in uso, riconosciuto dalle variabili del foglio di stile (null se personalizzato). */
export function activeTheme(variables: Record<string, string>): SiteTheme | null {
  return THEMES.find((theme) => variables['--colore-primario'] === theme.primary && variables['--colore-sfondo'] === theme.background) ?? null
}

/** Proprietà da non copiare con «Copia stile»: posizione e livello dipendono dall'elemento. */
const NOT_COPIED = new Set(['position', 'left', 'top', 'right', 'bottom', 'z-index', 'grid-area', 'order'])

export function copyableStyles(declarations: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(declarations).filter(([prop]) => !NOT_COPIED.has(prop)))
}
