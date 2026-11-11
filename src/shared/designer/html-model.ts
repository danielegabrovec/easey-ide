// Modello di una pagina HTML per il designer: ogni elemento scritto dall'utente ha un numero
// e la sua posizione esatta nel sorgente (tag, attributi, contenuto), così le modifiche
// grafiche diventano piccole sostituzioni di testo e il codice resta quello dell'utente.
import { parse, type DefaultTreeAdapterMap } from 'parse5'

export type P5Node = DefaultTreeAdapterMap['node']
export type P5Element = DefaultTreeAdapterMap['element']

export interface Range {
  start: number
  end: number
}

export interface ElementInfo {
  id: number
  tag: string
  attrs: Record<string, string>
  attrRanges: Record<string, Range>
  /** Elemento intero, dal "<" del tag di apertura alla fine del tag di chiusura. */
  start: number
  end: number
  /** Subito dopo il ">" del tag di apertura. */
  startTagEnd: number
  /** Inizio del tag di chiusura, o null (elementi vuoti come <img>, o chiusura mancante). */
  endTagStart: number | null
  parent: number | null
  children: number[]
  /** true se contiene solo testo (niente elementi figli): si può modificare il testo in linea. */
  leafText: boolean
  text: string
  /** Percorso di indici fra fratelli (per ritrovare l'elemento dopo una modifica). */
  path: number[]
}

export interface HtmlModel {
  source: string
  elements: ElementInfo[]
  /** Albero parse5 (contiene i riferimenti agli elementi via `nodeIds`). */
  document: DefaultTreeAdapterMap['document']
  nodeIds: Map<P5Element, number>
  body: number | null
  head: number | null
}

export const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])

function isElement(node: P5Node): node is P5Element {
  return 'tagName' in node
}

export function parseHtml(source: string): HtmlModel {
  const document = parse(source, { sourceCodeLocationInfo: true })
  const elements: ElementInfo[] = []
  const nodeIds = new Map<P5Element, number>()
  let body: number | null = null
  let head: number | null = null

  const walk = (node: P5Node, parent: number | null, path: number[]) => {
    let childIndex = 0
    for (const child of 'childNodes' in node ? node.childNodes : []) {
      if (!isElement(child)) continue
      const location = child.sourceCodeLocation
      let id: number | null = null
      const childPath = [...path, childIndex++]
      if (location?.startTag) {
        id = elements.length
        const attrs: Record<string, string> = {}
        for (const attr of child.attrs) attrs[attr.name] = attr.value
        const attrRanges: Record<string, Range> = {}
        for (const [name, range] of Object.entries(location.attrs ?? {})) attrRanges[name] = { start: range.startOffset, end: range.endOffset }
        const elementChildren = child.childNodes.filter(isElement)
        const textChildren = child.childNodes.filter((n) => n.nodeName === '#text')
        elements.push({
          id,
          tag: child.tagName,
          attrs,
          attrRanges,
          start: location.startOffset,
          end: location.endOffset,
          startTagEnd: location.startTag.endOffset,
          endTagStart: location.endTag ? location.endTag.startOffset : null,
          parent,
          children: [],
          leafText: elementChildren.length === 0 && !VOID_TAGS.has(child.tagName) && !!location.endTag,
          text: textChildren.map((n) => ('value' in n ? String(n.value) : '')).join('').trim(),
          path: childPath
        })
        nodeIds.set(child, id)
        if (parent !== null) elements[parent]!.children.push(id)
        if (child.tagName === 'body') body = id
        if (child.tagName === 'head') head = id
      }
      // I template e gli elementi senza posizione (aggiunti dal parser) passano il genitore effettivo.
      const content = child.tagName === 'template' && 'content' in child ? (child as unknown as { content: P5Node }).content : child
      walk(content, id ?? parent, childPath)
    }
  }
  walk(document, null, [])
  return { source, elements, document, nodeIds, body, head }
}

/** Elemento più interno che contiene la posizione (per sincronizzare cursore dell'editor → designer). */
export function elementAtOffset(model: HtmlModel, offset: number): ElementInfo | null {
  let best: ElementInfo | null = null
  for (const element of model.elements) {
    if (offset >= element.start && offset <= element.end && (!best || element.end - element.start <= best.end - best.start)) best = element
  }
  return best
}

export function findByPath(model: HtmlModel, path: number[]): ElementInfo | null {
  return model.elements.find((e) => e.path.length === path.length && e.path.every((v, i) => v === path[i])) ?? null
}

export function findByAttrId(model: HtmlModel, id: string): ElementInfo | null {
  return model.elements.find((e) => e.attrs['id'] === id) ?? null
}

/** Rientro (spazi/tab) della riga su cui inizia l'offset. */
export function indentationAt(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1
  return /^[ \t]*/.exec(source.slice(lineStart))![0]
}

/** Unità di rientro usata nel file (2 spazi, 4 spazi o tab). */
export function indentUnit(source: string): string {
  const match = /\n([ \t]+)</.exec(source)
  if (!match) return '  '
  if (match[1]!.startsWith('\t')) return '\t'
  return match[1]!.length % 4 === 0 && match[1]!.length >= 4 && !/\n  </.test(source) ? '    ' : '  '
}

export function ancestors(model: HtmlModel, id: number): ElementInfo[] {
  const out: ElementInfo[] = []
  let current = model.elements[id]?.parent ?? null
  while (current !== null) {
    out.push(model.elements[current]!)
    current = model.elements[current]!.parent
  }
  return out
}

export function hasClass(element: ElementInfo, name: string): boolean {
  return (element.attrs['class'] ?? '').split(/\s+/).includes(name)
}

/** Elemento dentro una "tavola libera" (posizionamento assoluto stile Canva). */
export function isFreeElement(model: HtmlModel, id: number): boolean {
  const parent = model.elements[id]?.parent
  return parent !== null && parent !== undefined && hasClass(model.elements[parent]!, FREE_CANVAS_CLASS)
}

export const FREE_CANVAS_CLASS = 'tavola'
