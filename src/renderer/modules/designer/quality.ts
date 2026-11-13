// «Ritocchi consigliati» del designer: misura la pagina nel canvas (e in una copia nascosta larga
// quanto un telefono) e passa i dati alle regole pure del design kit (lint.ts).
import { columnCount, lintPage, type LintElement, type LintIssue } from '@shared/design-kit/lint'
import { allDeclarations } from '@shared/designer/css-edit'
import { NON_VISUAL_TAGS } from '@shared/designer/drop'
import type { HtmlModel } from '@shared/designer/html-model'
import { canvasFrame } from './frame-access'

const PHONE_WIDTH = 390
const TRANSPARENT = /rgba\(\d+,\s*\d+,\s*\d+,\s*0\)|transparent/

function background(view: Window, node: Element): { color: string; exact: boolean } {
  let current: Element | null = node
  while (current) {
    const style = view.getComputedStyle(current)
    if (style.backgroundImage && style.backgroundImage !== 'none') {
      const first = /rgba?\([^)]+\)/.exec(style.backgroundImage)?.[0]
      if (first) return { color: first, exact: false }
    }
    if (style.backgroundColor && !TRANSPARENT.test(style.backgroundColor)) return { color: style.backgroundColor, exact: true }
    current = current.parentElement
  }
  return { color: 'rgb(255, 255, 255)', exact: true }
}

function ownText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isButtonLike(tag: string, attrs: Record<string, string>, style: CSSStyleDeclaration): boolean {
  if (tag === 'button') return true
  if (tag === 'input') return ['submit', 'button', 'reset'].includes(attrs['type'] ?? '')
  if (tag !== 'a') return false
  // Un link «a pulsante»: ha uno sfondo o un bordo e un po' di spazio interno.
  const filled = !TRANSPARENT.test(style.backgroundColor) || parseFloat(style.borderTopWidth) > 0
  return filled && parseFloat(style.paddingTop) + parseFloat(style.paddingLeft) > 0
}

/** Elementi misurati del documento del canvas (coordinate della pagina). */
export function measure(model: HtmlModel, doc: Document): LintElement[] {
  const view = doc.defaultView
  if (!view) return []
  const out: LintElement[] = []
  const visual = (id: number) => {
    const el = model.elements[id]!
    return !NON_VISUAL_TAGS.has(el.tag) && el.tag !== 'head' && el.tag !== 'html'
  }
  const inHead = (id: number) => {
    let current: number | null = id
    while (current !== null) {
      if (model.elements[current]!.tag === 'head') return true
      current = model.elements[current]!.parent
    }
    return false
  }
  for (const el of model.elements) {
    if (!visual(el.id) || inHead(el.id)) continue
    const node = doc.querySelector(`[data-lab-id="${el.id}"]`)
    if (!node) continue
    const style = view.getComputedStyle(node)
    const rect = node.getBoundingClientRect()
    const bg = background(view, node)
    out.push({
      id: el.id,
      tag: el.tag,
      attrs: el.attrs,
      text: ownText(node),
      box: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      color: style.color,
      background: bg.color,
      backgroundExact: bg.exact,
      fontSize: parseFloat(style.fontSize) || 16,
      fontWeight: Number(style.fontWeight) || 400,
      display: style.display,
      gridColumns: style.display.includes('grid') ? columnCount(style.gridTemplateColumns) : 0,
      children: el.children.filter((c) => visual(c) && view.getComputedStyle(doc.querySelector(`[data-lab-id="${c}"]`) ?? node).display !== 'none'),
      buttonLike: isButtonLike(el.tag, el.attrs, style),
      visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    })
  }
  return out
}

/** Elementi che sul telefono escono a destra (esclusi quelli dentro un contenitore che li taglia o li fa scorrere). */
async function phoneOverflow(srcdoc: string): Promise<{ id: number; overflow: number }[]> {
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-same-origin')
  frame.setAttribute('aria-hidden', 'true')
  Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: `${PHONE_WIDTH}px`, height: '800px', border: '0', visibility: 'hidden' })
  document.body.appendChild(frame)
  try {
    await new Promise<void>((resolve) => {
      frame.onload = () => resolve()
      frame.srcdoc = srcdoc
      setTimeout(resolve, 3000)
    })
    const doc = frame.contentDocument
    const view = frame.contentWindow
    if (!doc || !view) return []
    await doc.fonts?.ready
    const limit = doc.documentElement.clientWidth
    const clipped = (node: Element) => {
      let current = node.parentElement
      while (current && current !== doc.body) {
        if (/hidden|auto|scroll|clip/.test(view.getComputedStyle(current).overflowX)) return true
        current = current.parentElement
      }
      return false
    }
    const out: { id: number; overflow: number }[] = []
    for (const node of Array.from(doc.querySelectorAll('body [data-lab-id]'))) {
      const rect = node.getBoundingClientRect()
      const overflow = rect.right - limit
      if (overflow > 1 && rect.width > 0 && !clipped(node)) out.push({ id: Number((node as HTMLElement).dataset['labId']), overflow })
    }
    return out
  } finally {
    frame.remove()
  }
}

/** Controllo completo della pagina nel canvas. */
export async function checkPage(model: HtmlModel, css: string): Promise<LintIssue[]> {
  const frame = canvasFrame()
  const doc = frame?.contentDocument
  if (!frame || !doc) return []
  const elements = measure(model, doc)
  const phone = frame.srcdoc ? await phoneOverflow(frame.srcdoc) : []
  return lintPage({ elements, viewportWidth: doc.documentElement.clientWidth, phoneOverflow: phone, declarations: allDeclarations(css) })
}
