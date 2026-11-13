// Documento mostrato nel canvas del designer: la pagina dell'utente con un numero su ogni elemento
// (data-lab-id), i fogli di stile incorporati (contenuto aggiornato anche se non salvato), niente script
// (in modalità progettazione la pagina non si esegue) e una <base> che fa trovare immagini e font.
import { parse, serialize, type DefaultTreeAdapterMap } from 'parse5'
import { PREVIEW_HOST, PREVIEW_SCHEME } from '../contracts/runner'
import { dirnameOf, normalizeRelative } from '../paths'

type Node = DefaultTreeAdapterMap['node']
type Element = DefaultTreeAdapterMap['element']

export interface CanvasOptions {
  /** Percorso della pagina nel progetto (per risolvere i percorsi relativi). */
  htmlPath: string
  /** Contenuto di un foglio di stile del progetto (percorso relativo alla radice), o null se non c'è. */
  stylesheet: (projectPath: string) => string | null
}

export const DESIGNER_CSS = `
html { scroll-behavior: auto !important; }
* { cursor: default !important; }
[contenteditable="true"] { outline: 2px solid #6d7cff !important; outline-offset: 2px; cursor: text !important; }
.tavola { outline: 1px dashed rgba(109, 124, 255, 0.55); outline-offset: -1px; }
.tavola:empty::after { content: 'Tavola libera: trascina qui elementi e spostali dove vuoi'; display: grid; place-items: center; height: 100%; color: #8a93a6; font: 14px system-ui; }
/* Le icone SVG si selezionano intere: i loro tracciati non intercettano il puntatore. */
svg * { pointer-events: none !important; }
`

function isElement(node: Node): node is Element {
  return 'tagName' in node
}

export function resolveRelative(htmlPath: string, href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:|^\/\/|^#/i.test(href)) return null
  const base = href.startsWith('/') ? '' : dirnameOf(htmlPath)
  try {
    const parts = `${base ? `${base}/` : ''}${href.replace(/^\//, '')}`.split('/')
    const out: string[] = []
    for (const part of parts) {
      if (part === '..') out.pop()
      else if (part && part !== '.') out.push(part)
    }
    return normalizeRelative(out.join('/').split('?')[0]!.split('#')[0]!)
  } catch {
    return null
  }
}

function textNode(value: string, parent: Element): Element['childNodes'][number] {
  return { nodeName: '#text', value, parentNode: parent } as unknown as Element['childNodes'][number]
}

export function buildCanvasDocument(source: string, options: CanvasOptions): string {
  const document = parse(source, { sourceCodeLocationInfo: true })
  let counter = 0
  let head: Element | null = null
  const toRemove: Element[] = []

  const walk = (node: Node) => {
    for (const child of 'childNodes' in node ? [...node.childNodes] : []) {
      if (!isElement(child)) continue
      if (child.sourceCodeLocation?.startTag) child.attrs.push({ name: 'data-lab-id', value: String(counter++) })
      // Niente gestori di eventi in linea (onclick…): in progettazione la pagina non esegue codice.
      child.attrs = child.attrs.filter((a) => !/^on/i.test(a.name))
      if (child.tagName === 'head') head = child
      if (child.tagName === 'script') toRemove.push(child)
      if (child.tagName === 'link' && /stylesheet/i.test(child.attrs.find((a) => a.name === 'rel')?.value ?? '')) {
        const href = child.attrs.find((a) => a.name === 'href')?.value ?? ''
        const path = resolveRelative(options.htmlPath, href)
        const css = path ? options.stylesheet(path) : null
        if (css !== null) {
          // <link> → <style> con il contenuto attuale (anche non salvato).
          child.tagName = 'style'
          child.nodeName = 'style'
          child.attrs = [...child.attrs.filter((a) => a.name === 'data-lab-id'), { name: 'data-lab-href', value: path! }]
          child.childNodes = [textNode(css, child)]
        }
      }
      const content = child.tagName === 'template' && 'content' in child ? (child as unknown as { content: Node }).content : child
      walk(content)
    }
  }
  walk(document)
  for (const script of toRemove) {
    const parent = script.parentNode as Element | null
    if (parent) parent.childNodes = parent.childNodes.filter((n) => n !== script)
  }
  const dir = dirnameOf(options.htmlPath)
  const baseHref = `${PREVIEW_SCHEME}://${PREVIEW_HOST}/${dir ? `${dir}/` : ''}`
  const html = serialize(document)
  const extra = `<base href="${baseHref}"><style data-lab-designer>${DESIGNER_CSS}</style>`
  if (head) return html.replace(/<head([^>]*)>/i, `<head$1>${extra}`)
  return html.replace(/<html([^>]*)>/i, `<html$1><head>${extra}</head>`)
}
