// Modifiche chirurgiche al sorgente HTML: ogni operazione restituisce piccole sostituzioni di testo
// (TextEdit), lasciando intatto tutto il resto (formattazione, commenti, ordine degli attributi).
import { indentationAt, indentUnit, type ElementInfo, type HtmlModel } from './html-model'

export interface TextEdit {
  start: number
  end: number
  text: string
}

export type InsertPosition = 'before' | 'after' | 'inside-start' | 'inside-end'

export function applyEdits(source: string, edits: TextEdit[]): string {
  let out = source
  for (const edit of [...edits].sort((a, b) => b.start - a.start || b.end - a.end)) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  return out
}

export function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function element(model: HtmlModel, id: number): ElementInfo {
  const found = model.elements[id]
  if (!found) throw new Error(`Elemento ${id} non trovato`)
  return found
}

export function setAttribute(model: HtmlModel, id: number, name: string, value: string | null): TextEdit[] {
  const el = element(model, id)
  const range = el.attrRanges[name]
  if (range) {
    if (value === null) {
      // Toglie anche lo spazio che precede l'attributo.
      let start = range.start
      while (start > 0 && /[ \t]/.test(model.source[start - 1]!)) start--
      return [{ start, end: range.end, text: '' }]
    }
    return [{ start: range.start, end: range.end, text: value === '' && name !== 'value' && name !== 'alt' ? name : `${name}="${escapeAttr(value)}"` }]
  }
  if (value === null) return []
  const selfClosing = model.source.slice(el.startTagEnd - 2, el.startTagEnd) === '/>'
  let position = el.startTagEnd - (selfClosing ? 2 : 1)
  while (selfClosing && position > el.start && /\s/.test(model.source[position - 1]!)) position--
  return [{ start: position, end: position, text: ` ${name}="${escapeAttr(value)}"` }]
}

export function setText(model: HtmlModel, id: number, text: string): TextEdit[] {
  const el = element(model, id)
  if (!el.leafText || el.endTagStart === null) throw new Error('Questo elemento non contiene solo testo')
  return [{ start: el.startTagEnd, end: el.endTagStart, text: escapeText(text) }]
}

/** Rientra tutte le righe (dalla seconda in poi) di un frammento. */
function indentLines(html: string, indent: string): string {
  return html
    .split('\n')
    .map((line, index) => (index === 0 || !line ? line : indent + line))
    .join('\n')
}

/** Toglie il rientro comune a tutte le righe (dalla seconda) di un frammento estratto dal sorgente. */
function dedent(html: string, indent: string): string {
  if (!indent) return html
  return html
    .split('\n')
    .map((line, index) => (index > 0 && line.startsWith(indent) ? line.slice(indent.length) : line))
    .join('\n')
}

export function insertHtml(model: HtmlModel, targetId: number | null, where: InsertPosition, html: string): TextEdit[] {
  const source = model.source
  const unit = indentUnit(source)
  const target = targetId === null ? (model.body !== null ? element(model, model.body) : null) : element(model, targetId)
  const fragment = html.trim()
  if (!target) {
    // Nessun <body> nel sorgente: in fondo al file.
    return [{ start: source.length, end: source.length, text: `${source.endsWith('\n') ? '' : '\n'}${fragment}\n` }]
  }
  const indent = indentationAt(source, target.start)
  if (where === 'before') return [{ start: target.start, end: target.start, text: `${indentLines(fragment, indent)}\n${indent}` }]
  if (where === 'after') return [{ start: target.end, end: target.end, text: `\n${indent}${indentLines(fragment, indent)}` }]
  const childIndent = indent + unit
  if (target.endTagStart === null) throw new Error(`<${target.tag}> non può contenere altri elementi`)
  if (where === 'inside-start') return [{ start: target.startTagEnd, end: target.startTagEnd, text: `\n${childIndent}${indentLines(fragment, childIndent)}` }]
  // inside-end: prima del tag di chiusura, rispettando la riga su cui sta.
  const lineStart = source.lastIndexOf('\n', target.endTagStart - 1)
  const beforeEnd = source.slice(lineStart + 1, target.endTagStart)
  if (lineStart >= target.startTagEnd && /^[ \t]*$/.test(beforeEnd)) {
    return [{ start: lineStart, end: lineStart, text: `\n${childIndent}${indentLines(fragment, childIndent)}` }]
  }
  return [{ start: target.endTagStart, end: target.endTagStart, text: `\n${childIndent}${indentLines(fragment, childIndent)}\n${indent}` }]
}

/** Intervallo da togliere per eliminare un elemento senza lasciare righe vuote. */
function removalRange(source: string, el: ElementInfo): { start: number; end: number } {
  const lineStart = source.lastIndexOf('\n', el.start - 1) + 1
  const lineEnd = source.indexOf('\n', el.end)
  const before = source.slice(lineStart, el.start)
  const after = source.slice(el.end, lineEnd < 0 ? source.length : lineEnd)
  if (/^[ \t]*$/.test(before) && /^[ \t]*$/.test(after)) {
    // L'elemento occupa righe intere: si toglie dalla fine della riga precedente.
    const start = lineStart > 0 ? lineStart - 1 : lineStart
    return { start, end: lineEnd < 0 ? source.length : lineStart > 0 ? lineEnd : lineEnd + 1 }
  }
  return { start: el.start, end: el.end }
}

export function removeElement(model: HtmlModel, id: number): TextEdit[] {
  const range = removalRange(model.source, element(model, id))
  return [{ ...range, text: '' }]
}

export function elementSource(model: HtmlModel, id: number): string {
  const el = element(model, id)
  return dedent(model.source.slice(el.start, el.end), indentationAt(model.source, el.start))
}

export function isInside(model: HtmlModel, id: number, container: number): boolean {
  let current: number | null = container
  while (current !== null) {
    if (current === id) return true
    current = model.elements[current]!.parent
  }
  return false
}

export function moveElement(model: HtmlModel, id: number, targetId: number, where: InsertPosition): TextEdit[] {
  return moveElementAt(model, id, targetId, where).edits
}

/**
 * Come moveElement, ma dice anche dove inizia l'elemento nel sorgente dopo lo spostamento: serve a
 * riselezionarlo anche quando non ha un id (il suo vecchio percorso ora indica un altro elemento).
 */
export function moveElementAt(model: HtmlModel, id: number, targetId: number, where: InsertPosition): { edits: TextEdit[]; start: number } {
  if (isInside(model, id, targetId)) throw new Error('Non si può spostare un elemento dentro sé stesso')
  const moved = elementSource(model, id)
  const removal = removeElement(model, id)[0]!
  const insertion = insertHtml(model, targetId, where, moved)[0]!
  // Inserimento che cade dentro l'intervallo tolto (es. "dopo" il fratello precedente): si sposta al bordo.
  if (insertion.start > removal.start && insertion.start < removal.end) insertion.start = insertion.end = removal.start
  const removed = removal.end - removal.start
  const lead = insertion.text.length - insertion.text.trimStart().length
  const start = (insertion.start >= removal.end ? insertion.start - removed : insertion.start) + lead
  return { edits: [removal, insertion], start }
}

export function duplicateElement(model: HtmlModel, id: number, newId?: string): TextEdit[] {
  let html = elementSource(model, id)
  if (newId) html = html.replace(/(<[^>]*?\sid=")[^"]*(")/, `$1${newId}$2`)
  return insertHtml(model, id, 'after', html)
}

/** Nome leggibile per gli id generati automaticamente. */
const TAG_NAMES: Record<string, string> = {
  h1: 'titolo',
  h2: 'titolo',
  h3: 'titolo',
  h4: 'titolo',
  p: 'paragrafo',
  a: 'link',
  button: 'pulsante',
  img: 'immagine',
  section: 'sezione',
  div: 'blocco',
  header: 'intestazione',
  footer: 'piede',
  nav: 'menu',
  form: 'modulo',
  input: 'campo',
  textarea: 'area-testo',
  select: 'selezione',
  label: 'etichetta',
  ul: 'elenco',
  ol: 'elenco',
  li: 'voce',
  span: 'testo',
  main: 'principale',
  article: 'articolo',
  figure: 'figura',
  video: 'video'
}

export function suggestId(model: HtmlModel, tag: string): string {
  const base = TAG_NAMES[tag] ?? tag
  const used = new Set(model.elements.map((e) => e.attrs['id']).filter(Boolean))
  let n = 1
  while (used.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

/** Garantisce un id all'elemento (serve per agganciargli gli stili): restituisce id e modifiche. */
export function ensureId(model: HtmlModel, id: number): { id: string; edits: TextEdit[] } {
  const el = element(model, id)
  if (el.attrs['id']) return { id: el.attrs['id'], edits: [] }
  const generated = suggestId(model, el.tag)
  return { id: generated, edits: setAttribute(model, id, 'id', generated) }
}

/** Primo foglio di stile locale collegato dalla pagina (href relativo), se c'è. */
export function linkedStylesheets(model: HtmlModel): string[] {
  return model.elements
    .filter((e) => e.tag === 'link' && /stylesheet/i.test(e.attrs['rel'] ?? '') && e.attrs['href'] && !/^[a-z]+:|^\/\//i.test(e.attrs['href']))
    .map((e) => e.attrs['href']!)
}
