// «Ritocchi consigliati»: controllo di qualità del design su una pagina già misurata. Le regole sono
// pure: ricevono elementi con riquadro e stile calcolato (li misura chi ha il DOM: il canvas del
// designer, o la tavola delle schermate) e le dichiarazioni del foglio di stile, e restituiscono i
// problemi con, dove possibile, la correzione da applicare con un clic.
import { contrastRatio, contrastTarget, fixContrast, isLargeText } from './contrast'
import { isOnScale, nearestSpace } from './space'

export interface LintElement {
  id: number
  tag: string
  attrs: Record<string, string>
  /** Testo proprio (non dei figli), già ripulito dagli spazi. */
  text: string
  box: { left: number; top: number; width: number; height: number }
  /** Colore del testo e sfondo effettivo dietro all'elemento (rgb/hex). */
  color: string
  background: string
  /** false se lo sfondo è un gradiente o un'immagine (il contrasto è solo stimato). */
  backgroundExact: boolean
  fontSize: number
  fontWeight: number
  display: string
  /** Colonne effettive di una griglia (0 se non è una griglia). */
  gridColumns: number
  /** Figli visibili (id). */
  children: number[]
  /** Pulsante o collegamento con l'aspetto di un pulsante. */
  buttonLike: boolean
  /** false se nascosto (display: none, visibility: hidden, misure nulle). */
  visible: boolean
}

export interface LintDeclaration {
  selector: string
  /** null = regola di base, altrimenti la condizione della @media. */
  media: string | null
  prop: string
  value: string
}

export interface LintInput {
  elements: LintElement[]
  /** Larghezza della pagina misurata. */
  viewportWidth: number
  /** Misura sul telefono: elementi che escono a destra (px). */
  phoneOverflow?: { id: number; overflow: number }[]
  declarations?: LintDeclaration[]
}

export type LintRule = 'contrasto' | 'griglia-orfana' | 'spazio-fuori-scala' | 'titolo-lungo' | 'righe-lunghe' | 'overflow-telefono' | 'immagine-senza-alt' | 'immagine-da-rete' | 'pulsante-piccolo'

export type LintFix =
  /** Stili sull'elemento (regola #id); `here` = nel punto di interruzione in cui si guarda la pagina. */
  | { kind: 'styles'; id: number; styles: Record<string, string>; here?: boolean }
  /** Una dichiarazione del foglio di stile cambia valore. */
  | { kind: 'css'; selector: string; media: string | null; prop: string; value: string }
  | { kind: 'attr'; id: number; name: string; value: string }

export interface LintIssue {
  rule: LintRule
  /** Elemento da mostrare (se c'è). */
  id: number | null
  severity: 'alta' | 'media' | 'bassa'
  /** Valori per il messaggio (rapporto, caratteri, px…). */
  values: Record<string, string | number>
  fix: LintFix | null
}

const SEVERITY_ORDER = { alta: 0, media: 1, bassa: 2 } as const

/** Minimo per un bersaglio da toccare col dito (Apple, Material; WCAG 2.5.5 AAA). */
export const MIN_TARGET = 44
/** Un titolo oltre questa lunghezza non si legge più «a colpo d'occhio». */
export const MAX_HEADING_CHARS = 80
/** Righe di testo oltre questi caratteri stancano la lettura (65–75 è l'ideale). */
export const MAX_LINE_CHARS = 90

const HEADINGS = new Set(['h1', 'h2', 'h3'])
const SPACING_PROPS = /^(margin|padding)(-(top|right|bottom|left|block|inline)(-(start|end))?)?$|^(row-|column-)?gap$/

function contrastIssues(el: LintElement): LintIssue[] {
  if (!el.text || !el.visible) return []
  const ratio = contrastRatio(el.color, el.background)
  if (ratio === null) return []
  const large = isLargeText(el.fontSize, el.fontWeight)
  const target = contrastTarget(large)
  if (ratio >= target) return []
  const fixed = fixContrast(el.color, el.background, target)
  return [{ rule: 'contrasto', id: el.id, severity: ratio < 3 ? 'alta' : 'media', values: { ratio: Math.round(ratio * 10) / 10, target, color: fixed, exact: el.backgroundExact ? 1 : 0 }, fix: { kind: 'styles', id: el.id, styles: { color: fixed } } }]
}

/** Divisore più grande di `n` che non supera `max` (per rifare una griglia senza orfani). */
function largestDivisor(n: number, max: number): number {
  for (let d = Math.min(n, max); d > 1; d--) if (n % d === 0) return d
  return 1
}

function orphanIssues(el: LintElement, byId: Map<number, LintElement>): LintIssue[] {
  const count = el.children.length
  const columns = el.gridColumns
  if (columns < 2 || count <= columns || count % columns !== 1) return []
  const last = el.children[count - 1]!
  // L'ultima occupa già tutta la riga (es. corretta con grid-column: 1 / -1): è voluto, non è sola.
  const lastBox = byId.get(last)?.box
  if (lastBox && lastBox.width >= el.box.width * 0.9) return []
  const better = largestDivisor(count, columns)
  const fix: LintFix =
    better > 1
      ? { kind: 'styles', id: el.id, styles: { 'grid-template-columns': `repeat(${better}, minmax(0, 1fr))` }, here: true }
      : { kind: 'styles', id: last, styles: { 'grid-column': '1 / -1' }, here: true }
  return [{ rule: 'griglia-orfana', id: el.id, severity: 'media', values: { count, columns, better }, fix }]
}

function textIssues(el: LintElement): LintIssue[] {
  const out: LintIssue[] = []
  if (HEADINGS.has(el.tag) && el.text.length > MAX_HEADING_CHARS) out.push({ rule: 'titolo-lungo', id: el.id, severity: 'bassa', values: { chars: el.text.length, max: MAX_HEADING_CHARS }, fix: null })
  if ((el.tag === 'p' || el.tag === 'li') && el.text.length > MAX_LINE_CHARS && el.fontSize > 0) {
    // Caratteri per riga stimati: larghezza / (mezza dimensione del carattere).
    const perLine = Math.round(el.box.width / (el.fontSize * 0.5))
    if (perLine > MAX_LINE_CHARS) out.push({ rule: 'righe-lunghe', id: el.id, severity: 'bassa', values: { chars: perLine }, fix: { kind: 'styles', id: el.id, styles: { 'max-width': '65ch' } } })
  }
  return out
}

function imageIssues(el: LintElement): LintIssue[] {
  if (el.tag !== 'img') return []
  const out: LintIssue[] = []
  if (!('alt' in el.attrs)) out.push({ rule: 'immagine-senza-alt', id: el.id, severity: 'media', values: {}, fix: null })
  const src = el.attrs['src'] ?? ''
  if (/^(https?:)?\/\//i.test(src)) out.push({ rule: 'immagine-da-rete', id: el.id, severity: 'bassa', values: { src: src.length > 60 ? `${src.slice(0, 57)}…` : src }, fix: null })
  return out
}

function targetIssues(el: LintElement): LintIssue[] {
  if (!el.buttonLike || !el.visible) return []
  const { width, height } = el.box
  if (height >= MIN_TARGET - 0.5 && width >= MIN_TARGET - 0.5) return []
  const styles: Record<string, string> = { 'min-height': `${MIN_TARGET}px` }
  if (width < MIN_TARGET) styles['min-width'] = `${MIN_TARGET}px`
  return [{ rule: 'pulsante-piccolo', id: el.id, severity: 'media', values: { width: Math.round(width), height: Math.round(height), min: MIN_TARGET }, fix: { kind: 'styles', id: el.id, styles } }]
}

/** Spazi (margin, padding, gap) in px fuori dalla scala 4/8: si propone il gradino più vicino. */
export function spacingIssues(declarations: LintDeclaration[]): LintIssue[] {
  const out: LintIssue[] = []
  for (const decl of declarations) {
    if (!SPACING_PROPS.test(decl.prop)) continue
    const values = decl.value.trim().split(/\s+/)
    if (!values.every((v) => /^-?\d+(\.\d+)?px$|^0$|^auto$/.test(v))) continue
    const off = values.filter((v) => v.endsWith('px') && !isOnScale(parseFloat(v)))
    if (!off.length) continue
    const fixed = values.map((v) => (v.endsWith('px') && !isOnScale(parseFloat(v)) ? `${Math.sign(parseFloat(v)) * nearestSpace(Math.abs(parseFloat(v)))}px` : v)).join(' ')
    out.push({ rule: 'spazio-fuori-scala', id: null, severity: 'bassa', values: { selector: decl.selector, prop: decl.prop, value: decl.value, fixed }, fix: { kind: 'css', selector: decl.selector, media: decl.media, prop: decl.prop, value: fixed } })
  }
  return out
}

/** Tutti i ritocchi, dai più importanti. */
export function lintPage(input: LintInput): LintIssue[] {
  const byId = new Map(input.elements.map((el) => [el.id, el]))
  const issues: LintIssue[] = []
  for (const el of input.elements) {
    issues.push(...contrastIssues(el), ...orphanIssues(el, byId), ...textIssues(el), ...imageIssues(el), ...targetIssues(el))
  }
  // Sul telefono: si segnala l'elemento più esterno che esce (i figli escono con lui).
  const overflowing = new Map((input.phoneOverflow ?? []).map((o) => [o.id, o.overflow]))
  for (const [id, overflow] of overflowing) {
    const el = byId.get(id)
    if (!el) continue
    const insideAnother = input.elements.some((other) => other.children.includes(id) && overflowing.has(other.id))
    if (insideAnother) continue
    const fix: LintFix | null = el.tag === 'img' || el.tag === 'video' || el.tag === 'table' ? { kind: 'styles', id, styles: { 'max-width': '100%' } } : el.display.includes('flex') ? { kind: 'styles', id, styles: { 'flex-wrap': 'wrap' } } : null
    issues.push({ rule: 'overflow-telefono', id, severity: 'alta', values: { px: Math.round(overflow) }, fix })
  }
  issues.push(...spacingIssues(input.declarations ?? []))
  return issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

/** Colonne effettive da `grid-template-columns` calcolato («240px 240px 240px» → 3). */
export function columnCount(gridTemplateColumns: string): number {
  if (!gridTemplateColumns || gridTemplateColumns === 'none') return 0
  // Si contano le parti separate da spazi fuori dalle parentesi (il valore calcolato è già in px).
  let depth = 0
  let count = 0
  let inToken = false
  for (const char of gridTemplateColumns.trim()) {
    if (char === '(') depth++
    else if (char === ')') depth--
    if (/\s/.test(char) && depth === 0) inToken = false
    else if (!inToken) {
      inToken = true
      count++
    }
  }
  return count
}
