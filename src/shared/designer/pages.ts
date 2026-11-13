// Pagine del sito nel designer (come il pannello «Pagine» degli editor visuali): elenco delle pagine
// HTML del progetto, nome del file di una pagina nuova e suo contenuto iniziale, che riusa la testa
// (fogli di stile, meta), l'intestazione e il piè di pagina della pagina di partenza.
import { dirnameOf, extensionOf, joinRelative } from '../paths'
import { parseHtml, type ElementInfo, type HtmlModel } from './html-model'

export const isHtmlPage = (path: string): boolean => ['html', 'htm'].includes(extensionOf(path))

/** Pagine HTML fra i file del progetto: prima `index.html` (la home), poi in ordine alfabetico. */
export function htmlPages(files: string[]): string[] {
  const rank = (path: string) => (/(^|\/)index\.html?$/i.test(path) ? path.split('/').length - 1 : 1000)
  return files.filter(isHtmlPage).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'it', { sensitivity: 'base' }))
}

/** "Chi sono" → "chi-sono.html" nella cartella `dir`, con un numero se il nome è già preso. */
export function pageFileName(title: string, existing: string[], dir = ''): string {
  const slug =
    title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\.html?$/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'pagina'
  const taken = new Set(existing.map((p) => p.toLowerCase()))
  let candidate = joinRelative(dir, `${slug}.html`)
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = joinRelative(dir, `${slug}-${n}.html`)
  return candidate
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function inBody(model: HtmlModel, element: ElementInfo): boolean {
  for (let id = element.parent; id !== null; id = model.elements[id]?.parent ?? null) if (id === model.body) return true
  return false
}

/** Rientro della riga su cui inizia l'elemento. */
function indentOf(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1
  return /^[ \t]*/.exec(source.slice(lineStart, offset))?.[0] ?? ''
}

/** Testo dell'elemento con le righe successive riportate al rientro `indent`. */
function reindent(source: string, element: ElementInfo, indent: string): string {
  const original = indentOf(source, element.start)
  return source
    .slice(element.start, element.end)
    .split('\n')
    .map((line, index) => (index === 0 ? indent + line : line.startsWith(original) ? indent + line.slice(original.length) : line))
    .join('\n')
}

export interface NewPageTexts {
  /** Paragrafo segnaposto sotto il titolo. */
  intro: string
  /** Lingua della pagina se quella di partenza non la dichiara. */
  lang: string
}

/**
 * Contenuto di una pagina nuova a partire da quella aperta nel designer (stessa cartella, quindi i
 * percorsi relativi di fogli di stile e immagini restano validi). Gli script della pagina di partenza
 * non si copiano: cercherebbero elementi che nella pagina nuova non ci sono.
 */
export function newPageHtml(source: string | null, title: string, texts: NewPageTexts): string {
  const safeTitle = escapeHtml(title.trim())
  const main = ['    <main>', '      <section class="lab-sezione">', `        <h1>${safeTitle}</h1>`, `        <p>${escapeHtml(texts.intro)}</p>`, '      </section>', '    </main>']
  const model = source ? parseHtml(source) : null
  const body = model && model.body !== null ? model.elements[model.body]! : null
  if (!source || !model || !body || body.endTagStart === null) {
    return [
      '<!doctype html>',
      `<html lang="${texts.lang}">`,
      '  <head>',
      '    <meta charset="UTF-8" />',
      '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      `    <title>${safeTitle}</title>`,
      '  </head>',
      '  <body>',
      ...main,
      '  </body>',
      '</html>',
      ''
    ].join('\n')
  }
  // Tutto fino al tag <body> compreso, con il <title> nuovo.
  let head = source.slice(0, body.startTagEnd)
  const titleElement = model.elements.find((e) => e.tag === 'title' && e.endTagStart !== null && e.end <= body.start)
  if (titleElement) head = head.slice(0, titleElement.startTagEnd) + safeTitle + head.slice(titleElement.endTagStart!)
  else if (model.head !== null && model.elements[model.head]!.endTagStart !== null) {
    const at = model.elements[model.head]!.endTagStart!
    head = head.slice(0, at) + `  <title>${safeTitle}</title>\n  ` + head.slice(at)
  }
  // Intestazione (o barra di navigazione) e piè di pagina comuni a tutto il sito.
  const bodyElements = model.elements.filter((e) => inBody(model, e))
  const header = bodyElements.find((e) => e.tag === 'header') ?? bodyElements.find((e) => e.tag === 'nav')
  const footer = [...bodyElements].reverse().find((e) => e.tag === 'footer' && (!header || !(e.start >= header.start && e.end <= header.end)))
  const parts = [head]
  if (header) parts.push(reindent(source, header, '    '))
  parts.push(...main)
  if (footer) parts.push(reindent(source, footer, '    '))
  return parts.join('\n') + '\n  </body>\n</html>\n'
}

/** Cartella in cui creare la pagina nuova: quella della pagina di partenza. */
export const pageFolder = (from: string | null): string => (from ? dirnameOf(from) : '')
