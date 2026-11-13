// Caratteri inclusi nell'app (file woff2, licenza SIL Open Font License 1.1, sottoinsieme latino che
// copre l'italiano): si usano senza Internet. Scegliendo una coppia, i file si copiano nella cartella
// fonts/ del progetto e il foglio di stile riceve le regole @font-face: il sito esportato resta autonomo.

export type FontCategory = 'sans' | 'serif'

export interface KitFont {
  /** Nome del file (`<id>.woff2` in resources/fonts e in fonts/ del progetto). */
  id: string
  /** Nome della famiglia nel CSS. */
  family: string
  category: FontCategory
  /** Pesi disponibili: intervallo del carattere variabile (min, max), o un solo peso. */
  weights: [number, number]
  /** Pacchetto npm da cui viene il file (per le note legali). */
  source: string
  version: string
}

export const KIT_FONTS: KitFont[] = [
  { id: 'inter', family: 'Inter', category: 'sans', weights: [100, 900], source: '@fontsource-variable/inter', version: '5.3.0' },
  { id: 'manrope', family: 'Manrope', category: 'sans', weights: [200, 800], source: '@fontsource-variable/manrope', version: '5.3.0' },
  { id: 'dm-sans', family: 'DM Sans', category: 'sans', weights: [100, 900], source: '@fontsource-variable/dm-sans', version: '5.3.0' },
  { id: 'source-sans-3', family: 'Source Sans 3', category: 'sans', weights: [200, 900], source: '@fontsource-variable/source-sans-3', version: '5.3.1' },
  { id: 'space-grotesk', family: 'Space Grotesk', category: 'sans', weights: [300, 700], source: '@fontsource-variable/space-grotesk', version: '5.3.0' },
  { id: 'fraunces', family: 'Fraunces', category: 'serif', weights: [100, 900], source: '@fontsource-variable/fraunces', version: '5.3.0' },
  { id: 'playfair-display', family: 'Playfair Display', category: 'serif', weights: [400, 900], source: '@fontsource-variable/playfair-display', version: '5.3.0' },
  { id: 'dm-serif-display', family: 'DM Serif Display', category: 'serif', weights: [400, 400], source: '@fontsource/dm-serif-display', version: '5.3.0' }
]

export const kitFont = (id: string): KitFont | undefined => KIT_FONTS.find((f) => f.id === id)

const FALLBACK: Record<FontCategory, string> = { sans: "system-ui, 'Segoe UI', Roboto, sans-serif", serif: "Georgia, 'Times New Roman', serif" }

/** `'Inter', system-ui, 'Segoe UI', Roboto, sans-serif` */
export const fontStack = (font: KitFont): string => `'${font.family}', ${FALLBACK[font.category]}`

/** Regola @font-face del carattere, con il percorso del file relativo al foglio di stile. */
export function fontFaceCss(font: KitFont, url: string): string {
  const weight = font.weights[0] === font.weights[1] ? String(font.weights[0]) : `${font.weights[0]} ${font.weights[1]}`
  return `@font-face {\n  font-family: '${font.family}';\n  src: url('${url}') format('woff2');\n  font-weight: ${weight};\n  font-style: normal;\n  font-display: swap;\n}`
}

export interface FontPair {
  id: string
  /** Carattere dei titoli e del testo (id di KIT_FONTS). */
  heading: string
  body: string
  /** Peso consigliato per i titoli. */
  headingWeight: number
}

/** Coppie consigliate: contrasto fra titoli e testo, ma stessa «voce». */
export const FONT_PAIRS: FontPair[] = [
  { id: 'moderna', heading: 'inter', body: 'inter', headingWeight: 800 },
  { id: 'amichevole', heading: 'manrope', body: 'inter', headingWeight: 800 },
  { id: 'editoriale', heading: 'fraunces', body: 'inter', headingWeight: 700 },
  { id: 'elegante', heading: 'playfair-display', body: 'source-sans-3', headingWeight: 700 },
  { id: 'classica', heading: 'dm-serif-display', body: 'dm-sans', headingWeight: 400 },
  { id: 'tecnica', heading: 'space-grotesk', body: 'dm-sans', headingWeight: 700 }
]

export const fontPair = (id: string): FontPair | undefined => FONT_PAIRS.find((p) => p.id === id)

/** Caratteri da installare per una coppia (senza doppioni). */
export const pairFonts = (pair: FontPair): KitFont[] => [...new Set([pair.heading, pair.body])].map((id) => kitFont(id)!).filter(Boolean)

/** La coppia in uso, riconosciuta dalle variabili --font-titoli / --font-testo (null se diversa). */
export function activeFontPair(variables: Record<string, string>): FontPair | null {
  const norm = (v: string | undefined) => (v ?? '').replace(/["']/g, "'").replace(/\s+/g, ' ').trim()
  return FONT_PAIRS.find((pair) => norm(variables['--font-titoli']) === norm(fontStack(kitFont(pair.heading)!)) && norm(variables['--font-testo']) === norm(fontStack(kitFont(pair.body)!))) ?? null
}

/** Pesi che ha senso proporre per un font-family (stack CSS): quelli del carattere del kit, o i soliti. */
export function weightsFor(fontFamily: string | null | undefined): number[] {
  const all = [300, 400, 500, 600, 700, 800, 900]
  const name = (fontFamily ?? '').split(',')[0]!.replace(/["']/g, '').trim().toLowerCase()
  const font = KIT_FONTS.find((f) => f.family.toLowerCase() === name)
  if (!font) return all
  return all.filter((w) => w >= font.weights[0] && w <= font.weights[1])
}
