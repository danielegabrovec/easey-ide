// Azioni del designer: ognuna diventa una modifica chirurgica di HTML e/o CSS in un unico passo annullabile.
import { blockById, PAGE_BODY_RESET } from '@shared/designer/blocks'
import { appendRulesOnce, BREAKPOINTS, getDeclarations, getVariables, setDeclarations } from '@shared/designer/css-edit'
import { copyableStyles, themeRules, type SiteTheme, type StylePatch } from '@shared/designer/presets'
import { DEFAULT_PLACEHOLDER_COLORS, placeholderNames, placeholderPath, placeholderSvg } from '@shared/design-kit/placeholder'
import { fontFaceCss, fontPair, fontStack, kitFont, pairFonts } from '@shared/design-kit/fonts'
import { ICON_CSS, iconSvg } from '@shared/design-kit/icons'
import { themeFromColor } from '@shared/design-kit/themes'
import { typeVariables, type TypeScaleId } from '@shared/design-kit/type'
import { dirnameOf, filePaths } from '@shared/paths'
import { ide } from '../../ipc'
import { t } from '../../i18n'
import { choose } from '../../ui/dialogs'
import { workbench } from '../../workbench/store'
import {
  clearBody,
  duplicateElement,
  ensureId,
  insertHtml,
  isInside,
  moveElementAt,
  removeElement,
  setAttribute,
  setText,
  suggestId,
  visibleBodyChildren,
  type InsertPosition,
  type TextEdit
} from '@shared/designer/html-edit'
import { findByAttrId, isFreeElement, type ElementInfo, type HtmlModel } from '@shared/designer/html-model'
import { appendTarget, freeStyleChange, landsInFreeCanvas } from '@shared/designer/drop'
import { notifyError } from '../../workbench/notifications'
import { modelFor, parse, stylesheetFor, Transaction } from './document'
import { keyOf, selectedElement, useDesigner } from './designer-store'

type PageWork = (context: {
  html: HtmlModel
  transaction: Transaction
  /** Modifiche all'HTML calcolate sul modello corrente (rianalizzato dopo ogni passo). */
  editHtml: (build: (html: HtmlModel) => TextEdit[]) => HtmlModel
  /** Modifica il foglio di stile della pagina (lo crea se manca). */
  editCss: (change: (css: string) => string) => Promise<void>
}) => Promise<void> | void

async function withPage(work: PageWork): Promise<void> {
  const path = useDesigner.getState().path
  if (!path) return
  try {
    const htmlModel = await modelFor(path)
    const transaction = new Transaction()
    let html = parse(htmlModel)
    const editHtml = (build: (current: HtmlModel) => TextEdit[]) => {
      transaction.html(htmlModel, build(html))
      html = parse(htmlModel)
      return html
    }
    const editCss = async (change: (css: string) => string) => {
      const sheet = await stylesheetFor(path, html, transaction, htmlModel)
      html = parse(htmlModel)
      transaction.replace(sheet.model, change(sheet.model.getValue()))
    }
    await work({ html, transaction, editHtml, editCss })
    transaction.commit()
  } catch (error) {
    notifyError(error)
  }
}

function media(): string | null {
  return BREAKPOINTS[useDesigner.getState().breakpoint]
}

/** Stile in linea: "a: 1; b: 2" ↔ oggetto. */
export function parseInlineStyle(style: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of style.split(';')) {
    const index = part.indexOf(':')
    if (index > 0) out[part.slice(0, index).trim()] = part.slice(index + 1).trim()
  }
  return out
}

function inlineStyle(declarations: Record<string, string>): string {
  return Object.entries(declarations)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ')
}

/** `<body>` e `<html>` sono unici: lo stile va sul loro tag (`body { … }`), senza aggiungere un id. */
function pageSelector(element: ElementInfo): string | null {
  return element.tag === 'body' || element.tag === 'html' ? element.tag : null
}

/** Selettore e dichiarazioni attuali per il bersaglio scelto nell'ispettore. */
export function currentRule(element: ElementInfo | null): { selector: string | null; declarations: Record<string, string> } {
  const { target, targetClass, css, stylesheet } = useDesigner.getState()
  if (!element) return { selector: null, declarations: {} }
  if (target === 'inline') return { selector: 'style=""', declarations: parseInlineStyle(element.attrs['style'] ?? '') }
  const selector = target === 'class' && targetClass ? `.${targetClass}` : (pageSelector(element) ?? (element.attrs['id'] ? `#${element.attrs['id']}` : null))
  if (!selector || !stylesheet) return { selector, declarations: {} }
  return { selector, declarations: getDeclarations(css[stylesheet] ?? '', selector, media()) }
}

export function setStyles(declarations: Record<string, string | null>): Promise<void> {
  const element = selectedElement()
  if (!element) return Promise.resolve()
  const { target, targetClass } = useDesigner.getState()
  return withPage(async ({ html, editHtml, editCss }) => {
    const el = html.elements[element.id]!
    if (target === 'inline') {
      const current = parseInlineStyle(el.attrs['style'] ?? '')
      for (const [prop, value] of Object.entries(declarations)) {
        if (value === null || value === '') delete current[prop]
        else current[prop] = value
      }
      const style = inlineStyle(current)
      editHtml((h) => setAttribute(h, el.id, 'style', style || null))
      return
    }
    let selector: string
    const tagSelector = pageSelector(el)
    if (target === 'class' && targetClass) selector = `.${targetClass}`
    else if (tagSelector) selector = tagSelector
    else {
      const { id, edits } = ensureId(html, el.id)
      if (edits.length) {
        editHtml(() => edits)
        useDesigner.getState().select({ attrId: id, path: el.path })
      }
      selector = `#${id}`
    }
    await editCss((css) => setDeclarations(css, selector, declarations, media()))
  })
}

export function setElementText(id: number, text: string): Promise<void> {
  return withPage(({ editHtml }) => {
    editHtml((h) => setText(h, id, text))
  })
}

export function setElementAttribute(id: number, name: string, value: string | null): Promise<void> {
  return withPage(({ editHtml }) => {
    const html = editHtml((h) => setAttribute(h, id, name, value))
    if (name === 'id' && value) useDesigner.getState().select({ attrId: value, path: html.elements[id]?.path ?? [] })
  })
}

export function removeSelected(): Promise<void> {
  const element = selectedElement()
  if (!element || ['html', 'head', 'body'].includes(element.tag)) return Promise.resolve()
  const parent = element.parent
  return withPage(({ editHtml }) => {
    const html = editHtml((h) => removeElement(h, element.id))
    useDesigner.getState().selectElement(parent !== null ? (html.elements[parent] ?? null) : null)
  })
}

export function duplicateSelected(): Promise<void> {
  const element = selectedElement()
  if (!element || ['html', 'head', 'body'].includes(element.tag)) return Promise.resolve()
  return withPage(async ({ html, editHtml, editCss }) => {
    const newId = element.attrs['id'] ? suggestId(html, element.tag) : undefined
    const after = editHtml((h) => duplicateElement(h, element.id, newId))
    if (newId && element.attrs['id']) {
      // La copia riceve gli stessi stili dell'originale (spostata un po' se è libera).
      const { css, stylesheet } = useDesigner.getState()
      const original = stylesheet ? getDeclarations(css[stylesheet] ?? '', `#${element.attrs['id']}`) : {}
      if (Object.keys(original).length) {
        const shifted = { ...original }
        for (const prop of ['left', 'top']) if (/^-?\d+(\.\d+)?px$/.test(shifted[prop] ?? '')) shifted[prop] = `${parseFloat(shifted[prop]!) + 16}px`
        await editCss((css) => setDeclarations(css, `#${newId}`, shifted))
      }
      const copy = findByAttrId(after, newId)
      if (copy) useDesigner.getState().selectElement(copy)
    }
  })
}

export function moveSelectedTo(targetId: number, where: InsertPosition): Promise<void> {
  const element = selectedElement()
  if (!element) return Promise.resolve()
  return moveNode(element.id, targetId, where)
}

/**
 * Sposta un elemento qualunque (trascinato nel canvas o nei Livelli) e lo riseleziona dove è finito.
 * Se entra in una tavola libera diventa libero (posizione assoluta); se ne esce torna nel flusso.
 */
export function moveNode(id: number, targetId: number, where: InsertPosition, free?: { left: number; top: number; width?: number }): Promise<void> {
  const page = useDesigner.getState().html
  const element = page?.elements[id]
  if (!page || !element || id === targetId || ['html', 'head', 'body'].includes(element.tag)) return Promise.resolve()
  // Non si può mettere un elemento dentro sé stesso o un suo discendente.
  if (isInside(page, id, targetId)) return Promise.resolve()
  // Nessun movimento reale (prima del fratello successivo, dopo quello precedente, su sé stesso).
  const siblings = element.parent !== null ? page.elements[element.parent]!.children : []
  const index = siblings.indexOf(id)
  if ((where === 'before' && siblings[index + 1] === targetId) || (where === 'after' && siblings[index - 1] === targetId)) return Promise.resolve()
  return withPage(async ({ html, editHtml, editCss }) => {
    const wasFree = isFreeElement(html, id)
    const nowFree = landsInFreeCanvas(html, { id: targetId, where })
    // Da una tavola a un'altra (o con una posizione nuova) si riscrive comunque la posizione.
    const change = free && nowFree ? freeStyleChange(false, true, free) : freeStyleChange(wasFree, nowFree, free)
    let key = html.elements[id]!.attrs['id'] ?? null
    // Lo stato libero vive nella regola #id: se serve, l'id si aggiunge prima dello spostamento.
    if (change && nowFree && !key) {
      const ensured = ensureId(html, id)
      key = ensured.id
      editHtml(() => ensured.edits)
    }
    let start = -1
    const after = editHtml((h) => {
      const result = moveElementAt(h, id, targetId, where)
      start = result.start
      return result.edits
    })
    if (change && key) {
      const selector = `#${key}`
      await editCss((css) => setDeclarations(css, selector, change))
    }
    const moved = after.elements.find((e) => e.start === start) ?? (key ? findByAttrId(after, key) : null)
    useDesigner.getState().select(moved ? keyOf(moved) : null)
  })
}

/** «Porta fuori dalla tavola»: l'elemento libero va subito dopo la sua tavola e torna nel flusso. */
export function moveOutOfFreeCanvas(id: number): Promise<void> {
  const page = useDesigner.getState().html
  const parent = page?.elements[id]?.parent
  if (!page || parent === null || parent === undefined || !isFreeElement(page, id)) return Promise.resolve()
  return moveNode(id, parent, 'after')
}

// ---------------------------------------------------------------- stili pronti, temi, copia stile

export function applyPreset(styles: StylePatch): Promise<void> {
  return setStyles(styles)
}

/** Un tema = variabili dei colori e dei caratteri in :root + pagina, titoli e link che le usano. */
export function applyTheme(theme: SiteTheme): Promise<void> {
  return withPage(async ({ editCss }) => {
    await editCss((css) => themeRules(theme, getVariables(css)).reduce((next, rule) => setDeclarations(next, rule.selector, rule.styles), css))
  })
}

let copiedStyle: Record<string, string> | null = null

/** «Copia stile»: le proprietà del bersaglio scelto, senza posizione e livello. Restituisce quante sono. */
export function copyStyle(element: ElementInfo): number {
  copiedStyle = copyableStyles(currentRule(element).declarations)
  const count = Object.keys(copiedStyle).length
  useDesigner.getState().setStyleClipboard(count)
  return count
}

export function pasteStyle(): Promise<void> {
  if (!copiedStyle || !Object.keys(copiedStyle).length) return Promise.resolve()
  return setStyles(copiedStyle)
}

/** Posizione e dimensioni di un elemento in una tavola libera (px). */
export function setFreeBox(box: { left?: number; top?: number; width?: number; height?: number }): Promise<void> {
  const px = (v: number | undefined) => (v === undefined ? undefined : `${Math.round(v)}px`)
  const declarations: Record<string, string> = { position: 'absolute' }
  for (const [prop, value] of Object.entries(box)) if (value !== undefined) declarations[prop] = px(value)!
  return setStyles(declarations)
}

function withRootId(html: string, id: string): string {
  return /^<[a-z][\w-]*[^>]*\sid="/i.test(html) ? html : html.replace(/^<([a-z][\w-]*)/i, `<$1 id="${id}"`)
}

export type Placement = { targetId: number | null; where: InsertPosition } | { freeIn: number; x: number; y: number }

/** In fondo alla pagina ma prima degli <script> finali: il contenuto nuovo resta sopra il codice. */
export function endOfBody(html: HtmlModel): Placement {
  if (html.body === null) return { targetId: null, where: 'inside-end' }
  const target = appendTarget(html, html.body)
  return { targetId: target.id, where: target.where }
}

export function insertBlock(blockId: string, placement: Placement, overrides?: { html?: string }): Promise<void> {
  const block = blockById(blockId)
  if (!block) return Promise.resolve()
  return withPage(async ({ html, editHtml, editCss }) => {
    const tag = /^<([a-z][\w-]*)/i.exec(block.html)?.[1]?.toLowerCase() ?? 'div'
    const newId = suggestId(html, tag)
    const fragment = withRootId(overrides?.html ?? block.html, newId)
    await ensurePlaceholders(fragment)
    if ('freeIn' in placement) {
      editHtml((h) => insertHtml(h, placement.freeIn, 'inside-end', fragment))
      const size = block.freeSize ?? { width: 200, height: 80 }
      await editCss((css) => {
        let next = block.css ? appendRulesOnce(css, block.css) : css
        next = setDeclarations(next, `#${newId}`, { position: 'absolute', left: `${Math.round(placement.x)}px`, top: `${Math.round(placement.y)}px`, width: `${size.width}px`, height: `${size.height}px` })
        return next
      })
    } else {
      editHtml((h) => insertHtml(h, placement.targetId, placement.where, fragment))
      if (block.css) await editCss((css) => appendRulesOnce(css, block.css!))
    }
    const page = parse(await modelFor(useDesigner.getState().path!))
    const inserted = findByAttrId(page, newId)
    if (inserted) useDesigner.getState().select(keyOf(inserted))
  })
}

/**
 * Crea accanto alla pagina i segnaposto (`img/segnaposto-….svg`) usati da un frammento, nei colori del
 * tema attuale. Quelli che esistono già non si toccano (l'utente può averli sostituiti con foto vere).
 */
async function ensurePlaceholders(fragment: string): Promise<void> {
  const names = placeholderNames(fragment)
  const { path, css, stylesheet } = useDesigner.getState()
  if (!names.length || !path) return
  const variables = stylesheet ? getVariables(css[stylesheet] ?? '') : {}
  const colors = { primary: variables['--colore-primario'] ?? DEFAULT_PLACEHOLDER_COLORS.primary, secondary: variables['--colore-secondario'] ?? DEFAULT_PLACEHOLDER_COLORS.secondary }
  const dir = dirnameOf(path)
  const existing = new Set(filePaths(workbench().tree))
  for (const name of names) {
    const file = `${dir ? `${dir}/` : ''}${placeholderPath(name)}`
    const svg = placeholderSvg(name, colors)
    if (existing.has(file) || !svg) continue
    try {
      await ide.invoke('workspace:createFile', file, svg)
    } catch {
      /* esiste già (albero non ancora aggiornato) */
    }
  }
}

export type PageMode = 'replace' | 'append'

/**
 * Pagina intera della palette. «replace» toglie il contenuto visibile del body (gli script restano) e la
 * mette al suo posto; «append» la aggiunge in fondo. In tutti e due i casi il body perde le regole che lo
 * stringevano (griglia centrata dei modelli vecchi) e la pagina occupa tutta la larghezza.
 */
export function insertPage(blockId: string, mode: PageMode): Promise<void> {
  const block = blockById(blockId)
  if (!block) return Promise.resolve()
  return withPage(async ({ html, editHtml, editCss }) => {
    const newId = suggestId(html, 'div')
    const fragment = withRootId(block.html, newId)
    await ensurePlaceholders(fragment)
    let current = html
    if (mode === 'replace') current = editHtml((h) => clearBody(h))
    if (current.body === null) editHtml((h) => insertHtml(h, null, 'inside-end', fragment))
    else if (mode === 'replace') editHtml((h) => insertHtml(h, h.body, 'inside-start', fragment))
    else {
      const target = appendTarget(current, current.body)
      editHtml((h) => insertHtml(h, target.id, target.where, fragment))
    }
    await editCss((css) => setDeclarations(block.css ? appendRulesOnce(css, block.css) : css, 'body', PAGE_BODY_RESET))
    const page = parse(await modelFor(useDesigner.getState().path!))
    const inserted = findByAttrId(page, newId)
    if (inserted) useDesigner.getState().select(keyOf(inserted))
  })
}

/**
 * Clic (o rilascio) su una «Pagina intera»: se la pagina ha già del contenuto visibile si chiede se
 * sostituirlo (consigliato: una landing sta meglio da sola) o aggiungere in fondo.
 */
export async function placePage(blockId: string): Promise<void> {
  const page = useDesigner.getState().html
  if (!page) return
  const busy = visibleBodyChildren(page).length > 0
  const mode = busy
    ? await choose<PageMode>({
        title: t('designer.pageModeTitle'),
        message: t('designer.pageModeMessage'),
        choices: [
          { value: 'replace', label: t('designer.pageReplace'), testId: 'page-replace' },
          { value: 'append', label: t('designer.pageAppend'), testId: 'page-append' }
        ]
      })
    : 'replace'
  if (!mode) return
  useDesigner.getState().setRevealSelection(true)
  await insertPage(blockId, mode)
}

/** Variabili e stili globali del sito (scheda "Sito"). */
export function setSiteRule(selector: string, declarations: Record<string, string | null>): Promise<void> {
  return withPage(async ({ editCss }) => {
    await editCss((css) => setDeclarations(css, selector, declarations))
  })
}

// ---------------------------------------------------------------- design kit: testo, caratteri, icone

/** «Scala del testo» della scheda Sito: variabili --testo-xs … --testo-5xl in :root. */
export function applyTypeScale(id: TypeScaleId): Promise<void> {
  return setSiteRule(':root', typeVariables(id))
}

/**
 * Coppia di caratteri: i file woff2 inclusi nell'app si copiano in fonts/ accanto al foglio di stile,
 * il foglio riceve le @font-face e le variabili --font-titoli / --font-testo; i titoli prendono il peso
 * consigliato. Tutto in un passo annullabile (i file copiati restano: non danno fastidio).
 */
export function applyFontPair(pairId: string): Promise<void> {
  const pair = fontPair(pairId)
  if (!pair) return Promise.resolve()
  return withPage(async ({ editCss }) => {
    const sheet = useDesigner.getState().stylesheet ?? (useDesigner.getState().path ? `${dirnameOf(useDesigner.getState().path!)}/style.css`.replace(/^\//, '') : 'style.css')
    const folder = `${dirnameOf(sheet) ? `${dirnameOf(sheet)}/` : ''}fonts`
    const fonts = pairFonts(pair)
    for (const font of fonts) await ide.invoke('workspace:installFont', font.id, folder)
    const heading = kitFont(pair.heading)!
    const body = kitFont(pair.body)!
    await editCss((css) => {
      let next = appendRulesOnce(css, fonts.map((font) => fontFaceCss(font, `fonts/${font.id}.woff2`)).join('\n\n'))
      next = setDeclarations(next, ':root', { '--font-titoli': fontStack(heading), '--font-testo': fontStack(body) })
      next = setDeclarations(next, 'body', { 'font-family': 'var(--font-testo)' })
      return setDeclarations(next, ':is(h1, h2, h3, h4)', { 'font-family': 'var(--font-titoli)', 'font-weight': String(pair.headingWeight) })
    })
  })
}

/** Tema generato da un colore (es. quello del logo): armonie e contrasti calcolati dal kit. */
export function applyThemeFromColor(color: string, dark: boolean): Promise<void> {
  return applyTheme(themeFromColor(color, { dark }))
}

/** Sostituisce un elemento con altro HTML (es. un'icona con un'altra) e lo riseleziona. */
export function replaceElement(id: number, html: string): Promise<void> {
  return withPage(({ editHtml }) => {
    const before = useDesigner.getState().html?.elements[id]
    if (!before) return
    const after = editHtml((h) => {
      const el = h.elements[id]!
      return [{ start: el.start, end: el.end, text: html }]
    })
    const replaced = after.elements.find((e) => e.start === before.start)
    if (replaced) useDesigner.getState().select(keyOf(replaced))
  })
}

/** Cambia l'icona SVG selezionata (o quella dentro l'elemento selezionato) con un'altra del kit. */
export function setIcon(element: ElementInfo, name: string): Promise<void> {
  const page = useDesigner.getState().html
  const svg = iconSvg(name)
  const target = !page || !svg ? undefined : element.tag === 'svg' ? element : element.children.map((c) => page.elements[c]!).find((c) => c.tag === 'svg')
  if (!target || !svg) return Promise.resolve()
  return withPage(async ({ editHtml, editCss }) => {
    const after = editHtml((h) => [{ start: h.elements[target.id]!.start, end: h.elements[target.id]!.end, text: svg }])
    await editCss((css) => appendRulesOnce(css, ICON_CSS))
    const replaced = after.elements.find((e) => e.start === target.start)
    if (replaced) useDesigner.getState().select(keyOf(replaced.tag === 'svg' && element.tag !== 'svg' ? element : replaced))
  })
}

/** Cambia l'id di un elemento aggiornando anche le regole CSS che lo usano (#vecchio → #nuovo). */
export function renameId(element: ElementInfo, next: string): Promise<void> {
  const previous = element.attrs['id'] ?? ''
  const clean = next.trim().replace(/\s+/g, '-')
  if (clean === previous) return Promise.resolve()
  return withPage(async ({ editHtml, editCss }) => {
    const html = editHtml((h) => setAttribute(h, element.id, 'id', clean || null))
    if (previous && clean) {
      const escaped = previous.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      await editCss((css) => css.replace(new RegExp(`#${escaped}(?![\\w-])`, 'g'), `#${clean}`))
    }
    const renamed = html.elements[element.id]
    if (renamed) useDesigner.getState().selectElement(renamed)
  })
}
