// Azioni del designer: ognuna diventa una modifica chirurgica di HTML e/o CSS in un unico passo annullabile.
import { blockById, PAGE_BODY_RESET, SCENE_BLOCK_ID } from '@shared/designer/blocks'
import { hasSceneLoader, SCENE_FOLDER, SCENE_LOADER, SCENE_LOADER_SOURCE, sceneCanvasHtml, sceneLoaderTag } from '@shared/designer/scene-embed'
import { isScene3DPath, SCENE3D_EXTENSION } from '@shared/scene3d/model'
import { executeCommand } from '../../workbench/commands'
import { appendRulesOnce, BREAKPOINTS, getDeclarations, getVariables, setDeclarations } from '@shared/designer/css-edit'
import { copyableStyles, themeRules, type SiteTheme, type StylePatch } from '@shared/designer/presets'
import { DEFAULT_PLACEHOLDER_COLORS, placeholderNames, placeholderPath, placeholderSvg } from '@shared/design-kit/placeholder'
import { fontFaceCss, fontPair, fontStack, kitFont, pairFonts } from '@shared/design-kit/fonts'
import { ICON_CSS, iconSvg } from '@shared/design-kit/icons'
import type { LintFix } from '@shared/design-kit/lint'
import { themeFromColor } from '@shared/design-kit/themes'
import { typeVariables, type TypeScaleId } from '@shared/design-kit/type'
import { basenameOf, dirnameOf, filePaths, joinRelative, relativeTo } from '@shared/paths'
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
import { FREE_ELEMENT_CLASS, findByAttrId, hasClass, isFreeElement, withClass, type ElementInfo, type HtmlModel } from '@shared/designer/html-model'
import { FREE_PROPS, appendTarget, freeContainerStyle, freeStyleChange, landsInFreeCanvas } from '@shared/designer/drop'
import { notify, notifyError } from '../../workbench/notifications'
import { modelFor, parse, stylesheetFor, Transaction } from './document'
import { keyOf, selectedElement, selectedElements, useDesigner } from './designer-store'
import { outermostLastFirst } from '@shared/designer/selection'
import type { DrawTool } from '@shared/canvas-kit/draw'
import { describePlan, type LayoutPlan } from '@shared/canvas-kit/layout-infer'
import { drawnDeclarations, drawnShape } from '@shared/designer/draw-shapes'
import { layoutHtmlEdit, layoutRules, newRowCount } from '@shared/designer/layout-apply'
import { FREE_CANVAS_CLASS } from '@shared/designer/html-model'

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

/** Stili dall'ispettore: all'elemento scelto e, con la selezione multipla, a tutti gli scelti (1.6). */
export function setStyles(declarations: Record<string, string | null>): Promise<void> {
  const elements = selectedElements()
  if (!elements.length) return Promise.resolve()
  const { target, targetClass } = useDesigner.getState()
  return withPage(async ({ html, editHtml, editCss }) => {
    // Una classe è una regola sola, comune a tutti.
    if (target === 'class' && targetClass) {
      await editCss((css) => setDeclarations(css, `.${targetClass}`, declarations, media()))
      return
    }
    let current = html
    const selectors: string[] = []
    for (const [index, element] of elements.entries()) {
      const el = current.elements[element.id]!
      if (target === 'inline') {
        const style = parseInlineStyle(el.attrs['style'] ?? '')
        for (const [prop, value] of Object.entries(declarations)) {
          if (value === null || value === '') delete style[prop]
          else style[prop] = value
        }
        const text = inlineStyle(style)
        current = editHtml((h) => setAttribute(h, el.id, 'style', text || null))
        continue
      }
      const tagSelector = pageSelector(el)
      if (tagSelector) {
        selectors.push(tagSelector)
        continue
      }
      const { id, edits } = ensureId(current, el.id)
      if (edits.length) {
        current = editHtml(() => edits)
        // Il principale ora ha un id: la selezione lo segue (gli altri restano scelti).
        if (index === 0) useDesigner.getState().select({ attrId: id, path: el.path })
      }
      selectors.push(`#${id}`)
    }
    for (const selector of selectors) await editCss((css) => setDeclarations(css, selector, declarations, media()))
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

/** Canc: toglie l'elemento scelto, o tutti quelli della selezione multipla (dal fondo, così i numeri restano giusti). */
export function removeSelected(): Promise<void> {
  const elements = selectedElements().filter((e) => !['html', 'head', 'body'].includes(e.tag))
  if (!elements.length) return Promise.resolve()
  const parent = elements[0]!.parent
  return withPage(({ html, editHtml }) => {
    let current = html
    for (const id of outermostLastFirst(html, elements.map((e) => e.id))) current = editHtml((h) => removeElement(h, id))
    useDesigner.getState().selectElement(parent !== null && elements.length === 1 ? (current.elements[parent] ?? null) : null)
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

/** «Sposta liberamente»: l'elemento diventa libero nel contenitore (che fa da riferimento e non si accorcia). */
export interface MakeFree {
  /** Il contenitore (che fa da riferimento): `targetId` può essere un suo figlio (es. prima degli script finali). */
  container: number
  /** Altezza attuale del contenitore (px), per la sua altezza minima. */
  containerHeight: number
}

/**
 * Sposta un elemento qualunque (trascinato nel canvas o nei Livelli) e lo riseleziona dove è finito.
 * Se entra in una tavola libera diventa libero (posizione assoluta); se ne esce torna nel flusso. Con `makeFree`
 * («Sposta liberamente», 1.6) resta libero anche fuori dalle tavole, esattamente dove lo si è lasciato.
 */
export function moveNode(id: number, targetId: number, where: InsertPosition, free?: { left: number; top: number; width?: number }, makeFree?: MakeFree): Promise<void> {
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
    const inCanvas = landsInFreeCanvas(html, { id: targetId, where })
    const nowFree = inCanvas || (!!makeFree && !!free)
    // Da una tavola a un'altra (o con una posizione nuova) si riscrive comunque la posizione.
    const change = free && nowFree ? freeStyleChange(false, true, free) : freeStyleChange(wasFree, nowFree, free)
    let key = html.elements[id]!.attrs['id'] ?? null
    // Lo stato libero vive nella regola #id: se serve, l'id si aggiunge prima dello spostamento.
    if (change && nowFree && !key) {
      const ensured = ensureId(html, id)
      key = ensured.id
      editHtml(() => ensured.edits)
    }
    // Libero fuori da una tavola: la classe «libero» sull'elemento, il contenitore fa da riferimento.
    // (Prima dello spostamento: i numeri degli elementi cambiano solo spostando.)
    const libero = nowFree && !inCanvas
    let container: string | null = null
    if (libero || hasClass(html.elements[id]!, FREE_ELEMENT_CLASS) !== libero) {
      const current = html.elements[id]!
      if (hasClass(current, FREE_ELEMENT_CLASS) !== libero) editHtml((h) => setAttribute(h, id, 'class', withClass(current.attrs['class'], FREE_ELEMENT_CLASS, libero)))
    }
    const containerId = makeFree?.container ?? targetId
    if (libero && makeFree) {
      const target = html.elements[containerId]!
      if (target.tag !== 'body') {
        // Sul testo già ritoccato (classe, id dell'elemento): le posizioni nel file sono cambiate.
        const updated = editHtml((h) => ensureId(h, containerId).edits)
        container = `#${ensureId(updated, containerId).id}`
      } else container = 'body'
    }
    const containerTag = html.elements[containerId]!.tag
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
    if (container && makeFree) {
      const rule = container
      await editCss((css) => setDeclarations(css, rule, freeContainerStyle(containerTag, makeFree.containerHeight)))
    }
    const moved = after.elements.find((e) => e.start === start) ?? (key ? findByAttrId(after, key) : null)
    useDesigner.getState().select(moved ? keyOf(moved) : null)
  })
}

/**
 * «Mettilo dove vuoi» (tasto destro): l'elemento diventa libero dov'è adesso (posizione e larghezza misurate nel
 * canvas, rispetto al contenitore), poi lo si trascina dove si vuole.
 */
export function makeFreeInPlace(id: number, box: { left: number; top: number; width: number }, containerHeight: number): Promise<void> {
  const page = useDesigner.getState().html
  const element = page?.elements[id]
  if (!page || !element || element.parent === null || isFreeElement(page, id) || ['html', 'head', 'body'].includes(element.tag)) return Promise.resolve()
  const parentId = element.parent
  return withPage(async ({ html, editHtml, editCss }) => {
    const ensured = ensureId(html, id)
    if (ensured.edits.length) editHtml(() => ensured.edits)
    editHtml((h) => setAttribute(h, id, 'class', withClass(h.elements[id]!.attrs['class'], FREE_ELEMENT_CLASS, true)))
    const parent = html.elements[parentId]!
    let container = 'body'
    if (parent.tag !== 'body') {
      const updated = editHtml((h) => ensureId(h, parentId).edits)
      container = `#${ensureId(updated, parentId).id}`
    }
    const position = freeStyleChange(false, true, box)!
    await editCss((css) => setDeclarations(setDeclarations(css, `#${ensured.id}`, position), container, freeContainerStyle(parent.tag, containerHeight)))
    const after = editHtml(() => [])
    const moved = findByAttrId(after, ensured.id)
    useDesigner.getState().select(moved ? keyOf(moved) : null)
  })
}

/** «Rimetti in fila»: un elemento libero (fuori dalle tavole) torna nel flusso, dov'è nel codice. */
export function backToFlow(id: number): Promise<void> {
  const page = useDesigner.getState().html
  const element = page?.elements[id]
  if (!page || !element || !hasClass(element, FREE_ELEMENT_CLASS)) return Promise.resolve()
  return withPage(async ({ html, editHtml, editCss }) => {
    const key = html.elements[id]!.attrs['id'] ?? null
    editHtml((h) => setAttribute(h, id, 'class', withClass(h.elements[id]!.attrs['class'], FREE_ELEMENT_CLASS, false)))
    if (key) await editCss((css) => setDeclarations(css, `#${key}`, Object.fromEntries(FREE_PROPS.map((p) => [p, null]))))
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

/** Posizione (e misura) di elementi liberi, ciascuno nella sua regola #id: uno o più, spostati insieme (px). */
export function setFreeBoxes(boxes: { id: number; left?: number; top?: number; width?: number; height?: number }[]): Promise<void> {
  if (!boxes.length) return Promise.resolve()
  return withPage(async ({ html, editHtml, editCss }) => {
    let current = html
    const rules: [string, Record<string, string>][] = []
    for (const { id: elementId, ...box } of boxes) {
      const { id, edits } = ensureId(current, elementId)
      if (edits.length) current = editHtml(() => edits)
      const declarations: Record<string, string> = { position: 'absolute' }
      for (const [prop, value] of Object.entries(box)) if (value !== undefined) declarations[prop] = `${Math.round(value)}px`
      rules.push([`#${id}`, declarations])
    }
    await editCss((css) => rules.reduce((next, [selector, declarations]) => setDeclarations(next, selector, declarations), css))
  })
}

/** Posizione e dimensioni dell'elemento libero scelto (px): solo lui, anche con la selezione multipla. */
export function setFreeBox(box: { left?: number; top?: number; width?: number; height?: number }): Promise<void> {
  const element = selectedElement()
  return element ? setFreeBoxes([{ id: element.id, ...box }]) : Promise.resolve()
}

// ---------------------------------------------------------------- tela libera (1.7)

/** Selettore della regola di un contenitore (il body non riceve un id), aggiungendo l'id se manca. */
function containerSelector(html: HtmlModel, id: number, editHtml: (build: (html: HtmlModel) => TextEdit[]) => HtmlModel): string {
  if (html.elements[id]!.tag === 'body') return 'body'
  const updated = editHtml((h) => ensureId(h, id).edits)
  return `#${ensureId(updated, id).id}`
}

/**
 * Strumenti di disegno: crea l'elemento dello strumento nel contenitore, libero, alla posizione e misura
 * disegnate (px rispetto al contenitore). In una tavola è un suo figlio; altrove riceve la classe `libero`
 * e il contenitore fa da riferimento (come «Mettilo dove vuoi»). Un passo solo annullabile.
 */
export function drawElement(tool: DrawTool, containerId: number, box: { left: number; top: number; width: number; height: number }, containerHeight: number): Promise<void> {
  const shape = drawnShape(tool)
  if (!shape) return Promise.resolve()
  return withPage(async ({ html, editHtml, editCss }) => {
    const container = html.elements[containerId]
    if (!container) return
    const inCanvas = hasClass(container, FREE_CANVAS_CLASS)
    const newId = suggestId(html, shape.tag)
    let fragment = withRootId(shape.html, newId)
    if (!inCanvas) fragment = fragment.replace(/\sclass="/, ` class="${FREE_ELEMENT_CLASS} `)
    await ensurePlaceholders(fragment)
    // In fondo al contenitore, ma prima degli script finali.
    const target = inCanvas ? { id: containerId, where: 'inside-end' as const } : appendTarget(html, containerId)
    const after = editHtml((h) => insertHtml(h, target.id, target.where, fragment))
    const selector = inCanvas ? null : containerSelector(after, containerId, editHtml)
    await editCss((css) => {
      let next = shape.css ? appendRulesOnce(css, shape.css) : css
      next = setDeclarations(next, `#${newId}`, drawnDeclarations(tool, box))
      if (selector) next = setDeclarations(next, selector, freeContainerStyle(container.tag, containerHeight))
      return next
    })
    const page = parse(await modelFor(useDesigner.getState().path!))
    const inserted = findByAttrId(page, newId)
    if (inserted) useDesigner.getState().selectElement(inserted)
  })
}

export interface FreePlacement {
  id: number
  left: number
  top: number
  width?: number
  height?: number
  /** Elemento in fila da rendere libero prima (misurato nel canvas: non salta). */
  makeFree?: { containerHeight: number }
}

/**
 * Posizioni di più elementi in un unico passo; quelli ancora in fila diventano prima liberi (classe `libero`,
 * contenitore di riferimento). Serve ad «Allinea», «Distribuisci» e «Mettili liberi e allinea».
 */
export function placeFreeBoxes(items: FreePlacement[]): Promise<void> {
  if (!items.length) return Promise.resolve()
  return withPage(async ({ html, editHtml, editCss }) => {
    let current = html
    const rules: [string, Record<string, string | null>][] = []
    for (const item of items) {
      const element = current.elements[item.id]
      if (!element) continue
      const ensured = ensureId(current, item.id)
      if (ensured.edits.length) current = editHtml(() => ensured.edits)
      const declarations: Record<string, string | null> = { position: 'absolute', left: `${Math.round(item.left)}px`, top: `${Math.round(item.top)}px` }
      if (item.width !== undefined) declarations['width'] = `${Math.round(item.width)}px`
      if (item.height !== undefined) declarations['height'] = `${Math.round(item.height)}px`
      if (item.makeFree && !isFreeElement(current, item.id) && element.parent !== null) {
        current = editHtml((h) => setAttribute(h, item.id, 'class', withClass(h.elements[item.id]!.attrs['class'], FREE_ELEMENT_CLASS, true)))
        declarations['margin'] = '0'
        const parent = current.elements[element.parent]!
        const selector = containerSelector(current, element.parent, editHtml)
        current = editHtml(() => [])
        rules.push([selector, freeContainerStyle(parent.tag, item.makeFree.containerHeight)])
      }
      rules.push([`#${ensured.id}`, declarations])
    }
    await editCss((css) => rules.reduce((next, [selector, declarations]) => setDeclarations(next, selector, declarations), css))
    // Il principale resta scelto (con l'id appena aggiunto) e gli altri con lui.
    const keys = items.map((item) => current.elements[item.id]).filter((e): e is ElementInfo => !!e)
    if (keys.length) useDesigner.getState().setGroup(keys)
  })
}

/** Dichiarazioni sulla regola `#id` di ciascun elemento (livelli, rotazione…), in un passo solo. */
export function setElementRules(entries: { id: number; declarations: Record<string, string | null> }[]): Promise<void> {
  if (!entries.length) return Promise.resolve()
  return withPage(async ({ html, editHtml, editCss }) => {
    let current = html
    const rules: [string, Record<string, string | null>][] = []
    for (const { id: elementId, declarations } of entries) {
      if (!current.elements[elementId]) continue
      const { id, edits } = ensureId(current, elementId)
      if (edits.length) current = editHtml(() => edits)
      rules.push([`#${id}`, declarations])
    }
    await editCss((css) => rules.reduce((next, [selector, declarations]) => setDeclarations(next, selector, declarations), css))
  })
}

/**
 * «Da libero a layout»: i figli liberi del contenitore vanno in un flex (riga o colonna, con le righe
 * affiancate in un nuovo <div>) o in una griglia, nell'ordine in cui si vedono; perdono la posizione
 * assoluta. Una tavola smette di essere tavola (ne conserva l'aspetto). Un passo solo annullabile.
 */
export function applyFreeLayout(containerId: number, plan: LayoutPlan<number>): Promise<void> {
  return withPage(async ({ html, editHtml, editCss }) => {
    const container = html.elements[containerId]
    if (!container || container.tag === 'body') return
    const freeCanvas = hasClass(container, FREE_CANVAS_CLASS)
    const positioned = isFreeElement(html, containerId)
    let current = html
    const ensure = (id: number) => {
      const result = ensureId(current, id)
      if (result.edits.length) current = editHtml(() => result.edits)
      return result.id
    }
    const containerKey = ensure(containerId)
    const flow = plan.kind === 'grid' ? plan.order : plan.children.flatMap((c) => (c.kind === 'item' ? [c.id] : c.items))
    const keys = new Map<number, string>()
    for (const id of flow) keys.set(id, ensure(id))
    for (const id of flow) {
      const element = current.elements[id]!
      if (hasClass(element, FREE_ELEMENT_CLASS)) current = editHtml((h) => setAttribute(h, id, 'class', withClass(h.elements[id]!.attrs['class'], FREE_ELEMENT_CLASS, false)))
    }
    // La tavola diventa un contenitore normale: i figli non sono più liberi per forza.
    if (freeCanvas) current = editHtml((h) => setAttribute(h, containerId, 'class', withClass(h.elements[containerId]!.attrs['class'], FREE_CANVAS_CLASS, false)))
    const rowIds: string[] = []
    for (let i = 0; i < newRowCount(plan); i++) {
      let n = rowIds.length + 1
      while (findByAttrId(current, `riga-${n}`) || rowIds.includes(`riga-${n}`)) n++
      rowIds.push(`riga-${n}`)
    }
    const edit = layoutHtmlEdit(current, containerId, plan, rowIds)
    if (edit) current = editHtml(() => [edit])
    const { css: sheets, stylesheet } = useDesigner.getState()
    // L'aspetto della tavola (sfondo, larghezza, margini) resta sulla regola del contenitore.
    const look = freeCanvas && stylesheet ? getDeclarations(sheets[stylesheet] ?? '', `.${FREE_CANVAS_CLASS}`) : {}
    for (const prop of ['height', 'position', 'overflow']) delete look[prop]
    const rules = layoutRules(plan, `#${containerKey}`, (id) => `#${keys.get(id)}`, (i) => `#${rowIds[i]}`, { freeCanvas, positioned })
    await editCss((css) => {
      let next = Object.keys(look).length ? setDeclarations(css, `#${containerKey}`, look) : css
      for (const [selector, declarations] of rules) next = setDeclarations(next, selector, declarations)
      return next
    })
    const after = findByAttrId(current, containerKey)
    if (after) useDesigner.getState().selectElement(after)
    notify(t('designer.layoutDone', { plan: describePlan(plan) }), 'success')
  })
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

export function insertBlock(blockId: string, placement: Placement, overrides?: { html?: string; finish?: (editHtml: (build: (html: HtmlModel) => TextEdit[]) => HtmlModel) => void }): Promise<void> {
  const block = blockById(blockId)
  if (!block) return Promise.resolve()
  // La scena 3D (1.7): prima si sceglie (o si crea) la scena e si preparano i suoi file.
  if (blockId === SCENE_BLOCK_ID && !overrides?.html) return insertScene3D(placement)
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
    overrides?.finish?.(editHtml)
    const page = parse(await modelFor(useDesigner.getState().path!))
    const inserted = findByAttrId(page, newId)
    if (inserted) useDesigner.getState().select(keyOf(inserted))
  })
}

/**
 * Blocco «Scena 3D» (1.7): si sceglie una scena del progetto o se ne crea una nuova; lo Studio 3D prepara
 * i file (Three in `vendor/three`, modulo generato e immagine accanto alla scena), qui si scrive il caricatore
 * `js/scene-3d.js` (una volta), il <canvas data-scena> e lo script del caricatore in fondo al body: un passo solo.
 */
export async function insertScene3D(placement: Placement): Promise<void> {
  const path = useDesigner.getState().path
  if (!path) return
  const pageDir = dirnameOf(path)
  const scenes = filePaths(workbench().tree).filter(isScene3DPath)
  const choice = await choose<string>({
    title: t('designer.sceneChooseTitle'),
    message: t('designer.sceneChooseMessage'),
    choices: [...scenes.slice(0, 6).map((scene) => ({ value: scene, label: basenameOf(scene).replace(SCENE3D_EXTENSION, ''), testId: `scene-pick-${basenameOf(scene)}` })), { value: '', label: t('designer.sceneNew'), testId: 'scene-new' }]
  })
  if (choice === null) return
  let scene = choice
  if (!scene) {
    const created = (await executeCommand('studio3d.createScene', { dir: joinRelative(pageDir, SCENE_FOLDER), name: 'Scena', preset: 'vetrina' })) as string | null | undefined
    if (!created) return
    scene = created
  }
  try {
    await executeCommand('studio3d.prepareEmbed', { path: scene })
    const loader = joinRelative(pageDir, SCENE_LOADER)
    if (!filePaths(workbench().tree).includes(loader)) {
      try {
        await ide.invoke('workspace:createFile', loader, SCENE_LOADER_SOURCE)
      } catch {
        /* esiste già (albero non ancora aggiornato) */
      }
    }
  } catch (error) {
    notifyError(error)
    return
  }
  const name = basenameOf(scene).replace(SCENE3D_EXTENSION, '')
  await insertBlock(SCENE_BLOCK_ID, placement, {
    html: sceneCanvasHtml(relativeTo(pageDir, scene), t('designer.sceneLabel', { name })),
    finish: (editHtml) => {
      editHtml((h) => (h.body !== null && !hasSceneLoader(h.source) ? insertHtml(h, h.body, 'inside-end', sceneLoaderTag()) : []))
    }
  })
  notify(t('designer.sceneInserted'), 'success')
  if (!choice) void executeCommand('studio3d.open', { path: scene })
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

/** «Correggi» di un ritocco consigliato: stili sull'elemento, una dichiarazione del CSS o un attributo. */
export function applyLintFix(fix: LintFix): Promise<void> {
  return withPage(async ({ html, editHtml, editCss }) => {
    if (fix.kind === 'css') {
      await editCss((css) => setDeclarations(css, fix.selector, { [fix.prop]: fix.value }, fix.media))
      return
    }
    if (!html.elements[fix.id]) return
    if (fix.kind === 'attr') {
      editHtml((h) => setAttribute(h, fix.id, fix.name, fix.value))
      return
    }
    const { id, edits } = ensureId(html, fix.id)
    if (edits.length) editHtml(() => edits)
    await editCss((css) => setDeclarations(css, `#${id}`, fix.styles, fix.here ? media() : null))
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
