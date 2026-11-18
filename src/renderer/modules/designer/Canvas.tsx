// Canvas del designer: la pagina in un iframe senza script (stessa origine, quindi leggibile) e, sopra,
// un livello che gestisce tutte le interazioni. Nelle "tavole libere" gli elementi si spostano e si
// ridimensionano a mano libera con guide magnetiche (stile Canva); altrove si riordinano a flusso (stile Wix).
// Le regole su dove finisce un elemento rilasciato stanno in @shared/designer/drop (pure e testate).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FREE_CANVAS_CLASS, FREE_ELEMENT_CLASS, hasClass, isFreeElement, type ElementInfo, type HtmlModel } from '@shared/designer/html-model'
import { clampBox, decideDrop, elementLabel, flowAxis, targetParent, type Axis, type DropTarget, freeContainerAt, appendTarget } from '@shared/designer/drop'
import { fitScale, STAGE_PAD, stageX, wheelZoom, zoomAround } from '@shared/canvas-kit/zoom'
import { resizeRect, type Handle } from '@shared/canvas-kit/geometry'
import { SNAP_DISTANCE, snapMove, snapResize, type SnapContext } from '@shared/canvas-kit/snap'
import { measureBetween, nearestDistances } from '@shared/canvas-kit/measure'
import { drawnRect, isShapeTool, toolForKey, type DrawTool } from '@shared/canvas-kit/draw'
import { moveGuide } from '@shared/canvas-kit/rulers'
import { ALIGN_MODES, type RestackOp } from '@shared/canvas-kit/align'
import { blockById } from '@shared/designer/blocks'
import { showContextMenu, type MenuItem } from '../../ui/ContextMenu'
import { t } from '../../i18n'
import { notify } from '../../workbench/notifications'
import { backToFlow, copyStyle, drawElement, duplicateSelected, insertBlock, makeFreeInPlace, moveNode, moveOutOfFreeCanvas, pasteStyle, placePage, removeSelected, setElementRules, setElementText, setFreeBox, setFreeBoxes, setStyles } from './actions'
import { alignSelection, canInferLayout, distributeSelection, freeToLayout, restackSelection } from './arrange'
import { redo, undo } from './document'
import { keyOf, resolveSelection, selectedElements, useDesigner } from './designer-store'
import { boxBetween, marqueeHits, withDescendants, type Box } from '@shared/designer/selection'
import { elementForViewKey } from '@shared/designer/view-keys'
import { registerFrame } from './frame-access'
import { DrawTools } from './DrawTools'
import { Rulers } from './Rulers'
import { showSnap, SnapLayer } from './SnapLayer'
import { useCanvasView } from './view-state'

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/** `make`: «Sposta liberamente» fuori da una tavola (l'elemento diventa libero in quel contenitore). */
type FreeTarget = { freeIn: number; x: number; y: number; make?: boolean }
type FlowTarget = DropTarget | FreeTarget

interface FlowDrag {
  kind: 'flow'
  id: number
  startX: number
  startY: number
  /** Punto in cui si è afferrato l'elemento, rispetto al suo angolo (px del documento). */
  grab: { x: number; y: number }
  size: { width: number; height: number }
  /** Tavola da cui parte un elemento libero (rientrandovi torna lo spostamento libero). */
  home: number | null
  origin: Rect | null
  target: FlowTarget | null
}

type Drag =
  | { kind: 'pending'; startX: number; startY: number; id: number; grab: { x: number; y: number } }
  | { kind: 'free-move'; startX: number; startY: number; id: number; origin: Rect; current: Rect; home: number; grab: { x: number; y: number }; group: GroupMember[] }
  /** Rettangolo di selezione (1.6): trascinato sullo sfondo, prende gli elementi che ci stanno dentro. */
  | { kind: 'marquee'; startX: number; startY: number; current: { x: number; y: number } }
  | { kind: 'free-resize'; startX: number; startY: number; id: number; handle: string; origin: Rect; current: Rect; free: boolean }
  /** Strumento di disegno: rettangolo tracciato nel contenitore sotto il puntatore (px rispetto al contenitore). */
  | { kind: 'draw'; tool: DrawTool; container: number; origin: { x: number; y: number }; start: { x: number; y: number }; bounds: { width: number; height: number } | null; containerHeight: number; current: Rect }
  /** Maniglia di rotazione: gradi da scrivere in `transform: rotate()`. */
  | { kind: 'rotate'; id: number; center: { x: number; y: number }; start: number; pointer0: number; current: number; top: number }
  | FlowDrag

/** Un altro elemento libero della selezione multipla che si sposta insieme a quello trascinato. */
interface GroupMember {
  id: number
  node: HTMLElement
  left: number
  top: number
}

interface Indicator {
  /** Contenitore che riceverà l'elemento. */
  parent: Rect | null
  /** Linea d'inserimento (verticale nelle righe flex e nelle griglie). */
  line: { left: number; top: number; length: number; vertical: boolean } | null
  free: boolean
  label: string
}

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
/** Fascia (px dello schermo) vicino al bordo di un contenitore che vale «prima/dopo» invece di «dentro». */
const EDGE = 7
/**
 * ...ma mai più di 10 px della pagina: con il canvas rimpicciolito la fascia coprirebbe tutto il padding
 * (che deve valere «dentro»). Per andare prima/dopo basta lasciarlo appena fuori dal contenitore.
 */
const EDGE_MAX = 10
/** Fascia (px dello schermo) vicino al bordo del canvas che fa scorrere la pagina durante il trascinamento. */
const SCROLL_ZONE = 48
/** Di quanto (px dello schermo) il puntatore deve uscire da una tavola perché l'elemento libero ne esca. */
const LEAVE_MARGIN = 24

/**
 * Carica la pagina nel canvas con `srcdoc` (niente document.write né metodi della finestra: in un frame
 * senza script Chrome li segnala come "script bloccati"). Lo scorrimento si conserva via proprietà DOM.
 */
export function writeCanvas(iframe: HTMLIFrameElement | null, html: string, afterLoad?: () => void): void {
  if (!iframe) return
  const scroller = iframe.contentDocument?.scrollingElement
  const top = scroller?.scrollTop ?? 0
  const left = scroller?.scrollLeft ?? 0
  iframe.onload = () => {
    const next = iframe.contentDocument?.scrollingElement
    if (next) {
      next.scrollTop = top
      next.scrollLeft = left
    }
    afterLoad?.()
  }
  iframe.srcdoc = html
}

export function copyStyleWithNotice(element: ElementInfo): void {
  const count = copyStyle(element)
  notify(count ? t('designer.styleCopied', { count }) : t('designer.styleEmpty'), count ? 'success' : 'info')
}

function rectOf(element: Element | null): Rect | null {
  if (!element) return null
  const r = element.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

const inside = (rect: Rect, x: number, y: number) => x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height


/** Rotazione attuale (gradi) letta dalla matrice calcolata: 0 se non ruota. */
function rotationOf(node: HTMLElement): number {
  const value = node.ownerDocument.defaultView?.getComputedStyle(node).transform ?? 'none'
  const match = /matrix\(([^,]+),\s*([^,]+)/.exec(value)
  return match ? Math.round((Math.atan2(Number(match[2]), Number(match[1])) * 180) / Math.PI) : 0
}

/** Elementi dell'iframe (altra finestra: `instanceof HTMLElement` non vale) che contano per l'aggancio. */
function snapSiblings(parent: HTMLElement, exclude: ReadonlySet<Element>): Rect[] {
  const out: Rect[] = []
  for (const child of Array.from(parent.children) as HTMLElement[]) {
    if (exclude.has(child) || child.hasAttribute('data-lab-ghost') || ['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE'].includes(child.tagName)) continue
    if (child.offsetWidth + child.offsetHeight === 0) continue
    out.push({ left: child.offsetLeft, top: child.offsetTop, width: child.offsetWidth, height: child.offsetHeight })
  }
  return out
}

export function Canvas({ html: canvasHtml, width, onReady }: { html: string; width: number; onReady?: () => void }) {
  const page = useDesigner((s) => s.html)
  const selection = useDesigner((s) => s.selection)
  const hoverId = useDesigner((s) => s.hoverId)
  const iframe = useRef<HTMLIFrameElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [marquee, setMarquee] = useState<Box | null>(null)
  const others = useDesigner((s) => s.others)
  const ghost = useRef<{ clone: HTMLElement; node: HTMLElement } | null>(null)
  const pointer = useRef<{ clientX: number; clientY: number; alt: boolean } | null>(null)
  const scrollLoop = useRef(0)
  const zoom = useDesigner((s) => s.zoom)
  const [hostSize, setHostSize] = useState({ width: 0, height: 0 })
  /** Posizione orizzontale chiesta per la pagina quando è più larga del canvas (vedi stageX). */
  const [pan, setPan] = useState(STAGE_PAD)
  /** Punto attorno a cui fare il prossimo zoom (la rotellina lo mette sotto il puntatore). */
  const zoomAnchor = useRef<{ x: number; y: number } | null>(null)
  const previous = useRef<{ scale: number; zoom: number | null; left: number }>({ scale: 1, zoom: null, left: STAGE_PAD })
  /** Spostamento della vista: spazio premuto (o tasto centrale) + trascinamento. */
  const panDrag = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const hovering = useRef(false)
  const refreshFlowRef = useRef<() => void>(() => undefined)
  const scale = zoom ?? fitScale(hostSize.width, width)
  const height = Math.max(300, (hostSize.height - 2 * STAGE_PAD) / scale)
  const left = stageX(hostSize.width, width * scale, pan)
  const overflowsRef = useRef(false)
  overflowsRef.current = width * scale + 2 * STAGE_PAD > hostSize.width
  const leftRef = useRef(left)
  leftRef.current = left
  const [, setTick] = useState(0)
  const [indicator, setIndicator] = useState<Indicator | null>(null)
  const [editing, setEditing] = useState<{ id: number; rect: Rect; style: React.CSSProperties; text: string } | null>(null)
  // strumenti, righelli, guide, occhio e lucchetto (stato solo dell'editor, view-state.ts).
  const tool = useCanvasView((s) => s.tool)
  const rulers = useCanvasView((s) => s.rulers)
  const userGuides = useCanvasView((s) => s.guides)
  const hiddenKeys = useCanvasView((s) => s.hidden)
  const lockedKeys = useCanvasView((s) => s.locked)
  /** Scorrimento della pagina nell'iframe (righelli e guide lo seguono). */
  const [scroll, setScroll] = useState({ top: 0, left: 0 })
  const crossX = useRef<HTMLDivElement>(null)
  const crossY = useRef<HTMLDivElement>(null)
  const drawPreview = useRef<HTMLDivElement>(null)
  /** Guida trascinata (dal righello o già sulla tela): `out` = lasciandola qui sparisce. */
  const [guideDrag, setGuideDrag] = useState<{ axis: 'x' | 'y'; index: number; value: number; out: boolean } | null>(null)
  const guideView = useRef({ left: 0, scale: 1, scroll: { top: 0, left: 0 } })
  /** Toglie i gestori della finestra del trascinamento di una guida (rilascio, annullo, smontaggio). */
  const guideCleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => guideCleanup.current?.(), [])

  const selected = resolveSelection(page, selection)
  const doc = () => iframe.current?.contentDocument ?? null
  const elementNode = useCallback((id: number | null | undefined) => (id === null || id === undefined ? null : (doc()?.querySelector(`[data-lab-id="${id}"]`) as HTMLElement | null)), [])

  /** Elementi bloccati (lucchetto nei Livelli) e i loro discendenti: sulla tela non si scelgono. */
  const keyIds = (model: HtmlModel | null, keys: readonly string[]) =>
    model ? withDescendants(model, keys.map((key) => elementForViewKey(model, key)?.id).filter((id): id is number => id !== undefined)) : new Set<number>()
  const lockedIds = useMemo(() => keyIds(page, lockedKeys), [page, lockedKeys])
  /** Nascosti (occhio) e bloccati non entrano nel rettangolo di selezione, con quello che contengono. */
  const unpickable = useMemo(() => new Set([...lockedIds, ...keyIds(page, hiddenKeys)]), [page, hiddenKeys, lockedIds])

  /** Occhio nei Livelli: nascosti solo nel canvas del designer (stile in linea nell'iframe, mai nel file). */
  const applyHidden = useCallback(() => {
    const d = iframe.current?.contentDocument
    const model = useDesigner.getState().html
    if (!d || !model) return
    d.querySelectorAll('[data-lab-hidden]').forEach((node) => {
      ;(node as HTMLElement).style.visibility = ''
      node.removeAttribute('data-lab-hidden')
    })
    for (const key of useCanvasView.getState().hidden) {
      const element = elementForViewKey(model, key)
      const node = element ? (d.querySelector(`[data-lab-id="${element.id}"]`) as HTMLElement | null) : null
      if (!node) continue
      node.style.visibility = 'hidden'
      node.setAttribute('data-lab-hidden', '')
    }
  }, [])

  useEffect(() => applyHidden(), [hiddenKeys, page, applyHidden])

  useEffect(() => {
    registerFrame(iframe.current)
    return () => registerFrame(null)
  }, [])

  // Scrive la pagina nell'iframe a ogni cambiamento del sorgente; poi, se richiesto, porta in vista la selezione.
  useEffect(() => {
    writeCanvas(iframe.current, canvasHtml, () => {
      const state = useDesigner.getState()
      applyHidden()
      state.canvasLoaded()
      if (!state.revealSelection) return
      const target = resolveSelection(state.html, state.selection)
      const node = target ? (iframe.current?.contentDocument?.querySelector(`[data-lab-id="${target.id}"]`) as HTMLElement | null) : null
      if (node) {
        node.scrollIntoView({ block: 'nearest' })
        state.setRevealSelection(false)
      }
    })
    setTick((n) => n + 1)
    onReady?.()
  }, [canvasHtml, onReady, applyHidden])

  // Misura lo spazio disponibile: la scala «adatta» e l'altezza della pagina dipendono da lì.
  useLayoutEffect(() => {
    const element = host.current
    if (!element) return
    const observer = new ResizeObserver(() => setHostSize({ width: element.clientWidth, height: element.clientHeight }))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // La scala effettiva si vede nella barra del designer.
  const fit = fitScale(hostSize.width, width)
  useEffect(() => {
    useDesigner.getState().setViewScale(scale, fit)
  }, [scale, fit])

  // Cambiando lo zoom (rotellina, scorciatoie, menu) il punto sotto il puntatore, o il centro della vista,
  // resta fermo: si ricalcolano lo scorrimento della pagina e la posizione orizzontale.
  useLayoutEffect(() => {
    const before = previous.current
    previous.current = { scale, zoom, left: before.left }
    if (before.zoom === zoom || before.scale === scale) return
    const scroller = doc()?.scrollingElement
    const anchor = zoomAnchor.current ?? { x: hostSize.width / 2, y: hostSize.height / 2 }
    zoomAnchor.current = null
    const next = zoomAround({ from: before.scale, to: scale, x: anchor.x, y: anchor.y, stageLeft: before.left, stageTop: STAGE_PAD, scrollTop: scroller?.scrollTop ?? 0 })
    setPan(next.pan)
    if (scroller) scroller.scrollTop = next.scrollTop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, zoom])

  // Dopo ogni disegno: dove sta la pagina (serve al prossimo zoom, che parte dalla posizione di prima).
  useLayoutEffect(() => {
    previous.current.left = left
  })

  // Ctrl+rotellina (o pizzico sul touchpad) = zoom attorno al puntatore; rotellina = scorre la pagina,
  // Maiusc+rotellina o rotellina orizzontale = sposta la vista di lato quando la pagina è più larga.
  // Ascoltatore nativo non passivo: serve preventDefault (React registra la rotellina come passiva).
  useEffect(() => {
    const element = host.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const state = useDesigner.getState()
      const box = element.getBoundingClientRect()
      if (event.ctrlKey || event.metaKey) {
        zoomAnchor.current = { x: event.clientX - box.left, y: event.clientY - box.top }
        state.setZoom(wheelZoom(state.viewScale, event.deltaY))
        return
      }
      const scroller = iframe.current?.contentDocument?.scrollingElement
      const sideways = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX
      if (scroller && !(event.shiftKey && !event.deltaX)) scroller.scrollTop += event.deltaY / state.viewScale
      if (sideways) {
        // Pagina più larga del canvas: si sposta la vista; altrimenti scorre la pagina (se sborda di lato).
        if (overflowsRef.current) setPan(leftRef.current - sideways)
        else if (scroller) scroller.scrollLeft += sideways / state.viewScale
      }
      // La pagina è scorsa sotto il puntatore: il bersaglio di un trascinamento va ricalcolato subito.
      refreshFlowRef.current()
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  // Spazio tenuto premuto con il puntatore sul canvas (o il fuoco nel canvas) = mano per spostare la vista.
  useEffect(() => {
    const editable = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || editable(event.target)) return
      const focused = overlay.current !== null && document.activeElement === overlay.current
      if (!focused && !hovering.current) return
      event.preventDefault()
      if (!event.repeat) setSpaceHeld(true)
    }
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceHeld(false)
    }
    const blur = () => setSpaceHeld(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  // Ridisegna i riquadri: la pagina può cambiare (immagini caricate, scorrimento) senza avvisare.
  useEffect(() => {
    let frame = 0
    let last = ''
    const loop = () => {
      const s = rectOf(elementNode(useDesigner.getState().selection ? resolveSelection(useDesigner.getState().html, useDesigner.getState().selection)?.id : null))
      const h = rectOf(elementNode(useDesigner.getState().hoverId))
      const scroller = iframe.current?.contentDocument?.scrollingElement
      const sc = { top: scroller?.scrollTop ?? 0, left: scroller?.scrollLeft ?? 0 }
      const signature = JSON.stringify([s, h, sc])
      if (signature !== last) {
        last = signature
        setScroll((prev) => (prev.top === sc.top && prev.left === sc.left ? prev : sc))
        setTick((n) => n + 1)
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [elementNode])

  useEffect(() => () => cancelAnimationFrame(scrollLoop.current), [])

  const toDoc = (event: { clientX: number; clientY: number }) => {
    const box = overlay.current!.getBoundingClientRect()
    return { x: (event.clientX - box.left) / scale, y: (event.clientY - box.top) / scale }
  }

  const idAt = (x: number, y: number, exclude?: number): number | null => {
    const d = doc()
    if (!d || !page) return null
    for (const node of d.elementsFromPoint(x, y)) {
      const tagged = (node as HTMLElement).closest?.('[data-lab-id]') as HTMLElement | null
      if (!tagged) continue
      const id = Number(tagged.dataset['labId'])
      const info = page.elements[id]
      if (!info || info.tag === 'html' || info.tag === 'head') continue
      if (exclude !== undefined && isWithin(id, exclude)) continue
      if (lockedIds.has(id)) continue
      return id
    }
    return page.body
  }

  // ------------------------------------------------------------ aggancio, guide e misure (canvas kit)

  /** Contesto d'aggancio di un elemento libero: contenitore, fratelli e guide dei righelli nelle sue coordinate. */
  const snapContextOf = (node: HTMLElement, exclude: ReadonlySet<Element>): { origin: { x: number; y: number }; ctx: SnapContext } => {
    const parent = node.parentElement!
    const p = parent.getBoundingClientRect()
    const origin = { x: p.left + parent.clientLeft, y: p.top + parent.clientTop }
    const scroller = doc()?.scrollingElement
    const sx = scroller?.scrollLeft ?? 0
    const sy = scroller?.scrollTop ?? 0
    const guides = useCanvasView.getState().guides
    return {
      origin,
      ctx: {
        container: { width: parent.clientWidth, height: parent.clientHeight },
        siblings: snapSiblings(parent, exclude),
        userGuides: { xs: guides.xs.map((gx) => gx - sx - origin.x), ys: guides.ys.map((gy) => gy - sy - origin.y) },
        threshold: SNAP_DISTANCE / scale
      }
    }
  }

  /** Etichetta «L × A» sotto un riquadro (coordinate del livello del canvas). */
  const sizeLabel = (box: Rect, origin = { x: 0, y: 0 }) => ({ text: `${Math.round(box.width)} × ${Math.round(box.height)}`, x: origin.x + box.left, y: origin.y + box.top + box.height + 6 / scale })

  // ------------------------------------------------------------ guide trascinate dai righelli

  // Zoom, posizione e scorrimento di ADESSO: i gestori della finestra vivono più di un disegno (si zooma o si
  // scorre mentre si trascina), quindi leggono da qui e non dai valori del disegno in cui sono nati.
  guideView.current = { left, scale, scroll }

  /** Px della pagina sotto il puntatore, per una guida verticale (x) o orizzontale (y). */
  const guideValueAt = (axis: 'x' | 'y', clientX: number, clientY: number): { value: number; out: boolean } => {
    const view = guideView.current
    const box = host.current!.getBoundingClientRect()
    const hx = clientX - box.left
    const hy = clientY - box.top
    const out = hx < 0 || hy < 0 || hx > box.width || hy > box.height
    const value = axis === 'x' ? view.scroll.left + (hx - view.left) / view.scale : view.scroll.top + (hy - STAGE_PAD) / view.scale
    return { value, out }
  }

  const startGuideDrag = (axis: 'x' | 'y', index: number, event: React.PointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    guideCleanup.current?.()
    setGuideDrag({ axis, index, ...guideValueAt(axis, event.clientX, event.clientY) })
    const move = (e: PointerEvent) => setGuideDrag({ axis, index, ...guideValueAt(axis, e.clientX, e.clientY) })
    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
      guideCleanup.current = null
      setGuideDrag(null)
    }
    const cancel = () => cleanup()
    const up = (e: PointerEvent) => {
      const { value, out } = guideValueAt(axis, e.clientX, e.clientY)
      cleanup()
      const current = useCanvasView.getState().guides
      const list = axis === 'x' ? current.xs : current.ys
      const next = moveGuide(list, index, out ? null : value)
      useCanvasView.getState().setGuides(axis === 'x' ? { ...current, xs: next } : { ...current, ys: next })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    guideCleanup.current = cleanup
  }

  const isWithin = (id: number, container: number) => {
    let current: number | null = id
    while (current !== null) {
      if (current === container) return true
      current = page?.elements[current]?.parent ?? null
    }
    return false
  }

  const tavolaFor = (id: number): number | null => {
    let current: number | null = id
    while (current !== null && page) {
      if (hasClass(page.elements[current]!, FREE_CANVAS_CLASS)) return current
      current = page.elements[current]!.parent
    }
    return null
  }

  const axisOf = (id: number): Axis => {
    const node = elementNode(id)
    const view = iframe.current?.contentWindow
    if (!node || !view) return 'vertical'
    const style = view.getComputedStyle(node)
    return flowAxis({ display: style.display, flexDirection: style.flexDirection, gridTemplateColumns: style.gridTemplateColumns, gridAutoFlow: style.gridAutoFlow })
  }

  const indicatorFor = (target: DropTarget): Indicator | null => {
    if (!page) return null
    const parentId = targetParent(page, target)
    const parent = parentId !== null ? page.elements[parentId]! : null
    let line: Indicator['line'] = null
    let where = t('designer.dropEnd')
    if (target.where === 'before' || target.where === 'after') {
      const r = rectOf(elementNode(target.id))
      const axis = parentId !== null ? axisOf(parentId) : 'vertical'
      const before = target.where === 'before'
      if (r) line = axis === 'horizontal' ? { left: before ? r.left - 2 : r.left + r.width - 1, top: r.top, length: r.height, vertical: true } : { left: r.left, top: before ? r.top - 2 : r.top + r.height - 1, length: r.width, vertical: false }
      const label = elementLabel(page.elements[target.id]!)
      where = before ? t('designer.dropBefore', { el: label }) : t('designer.dropAfter', { el: label })
    }
    return {
      parent: parentId !== null ? rectOf(elementNode(parentId)) : null,
      line,
      free: false,
      label: `${t('designer.dropInto', { parent: parent ? elementLabel(parent) : 'body' })} › ${where}`
    }
  }

  /** Dove andrebbe un elemento lasciato qui: tavola libera (posizione) o flusso (prima/dopo/dentro). */
  const dropPlacement = (x: number, y: number, options: { exclude?: number; alt?: boolean; grab?: { x: number; y: number }; size?: { width: number; height: number }; free?: boolean } = {}): { indicator: Indicator; target: FlowTarget } | null => {
    const { exclude } = options
    const id = idAt(x, y, exclude)
    if (id === null || !page) return null
    const tavola = tavolaFor(id)
    if (tavola !== null && (exclude === undefined || !isWithin(tavola, exclude))) {
      const node = elementNode(tavola)
      const rect = rectOf(node)!
      const grab = options.grab ?? { x: 0, y: 0 }
      const width = options.size ? Math.min(options.size.width, node?.clientWidth ?? rect.width) : 0
      const height = options.size?.height ?? 0
      const box = clampBox(x - rect.left - grab.x, y - rect.top - grab.y, width, height, node?.clientWidth ?? rect.width, node?.clientHeight ?? rect.height)
      return { indicator: { parent: rect, line: null, free: true, label: `${t('designer.dropInto', { parent: elementLabel(page.elements[tavola]!) })} › ${t('designer.dropFree')}` }, target: { freeIn: tavola, x: box.left, y: box.top } }
    }
    // «Sposta liberamente»: resta dove lo si lascia, nel contenitore sotto il puntatore (Alt = in fila, come prima).
    if (options.free && !options.alt) {
      const container = freeContainerAt(page, id, exclude)
      const node = container !== null ? elementNode(container) : null
      const rect = node ? rectOf(node) : null
      if (container !== null && node && rect) {
        const grab = options.grab ?? { x: 0, y: 0 }
        const width = options.size ? Math.min(options.size.width, node.clientWidth || rect.width) : 0
        // In alto e a sinistra mai fuori dal contenitore; in basso può allungarlo (la sua altezza minima cresce).
        const box = clampBox(x - rect.left - node.clientLeft - grab.x, y - rect.top - node.clientTop - grab.y, width, 0, node.clientWidth || rect.width, Number.MAX_SAFE_INTEGER)
        return { indicator: { parent: rect, line: null, free: true, label: `${t('designer.dropInto', { parent: elementLabel(page.elements[container]!) })} › ${t('designer.dropFree')}` }, target: { freeIn: container, x: box.left, y: box.top, make: true } }
      }
    }
    const target = decideDrop({ model: page, hit: id, x, y, rectOf: (n) => rectOf(elementNode(n)), axisOf, edge: Math.min(EDGE / scale, EDGE_MAX), outside: options.alt, exclude })
    if (!target) return null
    const indicator = indicatorFor(target)
    return indicator ? { indicator, target } : null
  }

  const select = (element: ElementInfo | null) => useDesigner.getState().selectElement(element)

  const startEditing = (element: ElementInfo) => {
    const node = elementNode(element.id)
    const rect = rectOf(node)
    const computed = node ? iframe.current!.contentWindow!.getComputedStyle(node) : null
    if (!rect || !computed || !element.leafText) return
    setEditing({
      id: element.id,
      rect,
      text: node!.textContent ?? '',
      style: {
        fontFamily: computed.fontFamily,
        fontSize: computed.fontSize,
        fontWeight: computed.fontWeight as React.CSSProperties['fontWeight'],
        fontStyle: computed.fontStyle,
        color: computed.color,
        lineHeight: computed.lineHeight,
        letterSpacing: computed.letterSpacing,
        textAlign: computed.textAlign as React.CSSProperties['textAlign'],
        padding: computed.padding,
        background: computed.backgroundColor === 'rgba(0, 0, 0, 0)' ? '#ffffffee' : computed.backgroundColor
      }
    })
  }

  // ------------------------------------------------------------ fantasma e scorrimento automatico

  const showGhost = (id: number) => {
    const d = doc()
    const node = elementNode(id)
    if (!d || !node || ghost.current) return
    const clone = node.cloneNode(true) as HTMLElement
    clone.removeAttribute('data-lab-id')
    clone.querySelectorAll('[data-lab-id]').forEach((n) => n.removeAttribute('data-lab-id'))
    const r = node.getBoundingClientRect()
    Object.assign(clone.style, {
      position: 'fixed',
      margin: '0',
      width: `${r.width}px`,
      height: `${r.height}px`,
      left: `${r.left}px`,
      top: `${r.top}px`,
      opacity: '0.6',
      pointerEvents: 'none',
      zIndex: '2147483647',
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      transition: 'none'
    })
    clone.setAttribute('data-lab-ghost', '')
    d.body.appendChild(clone)
    node.style.opacity = '0.3'
    ghost.current = { clone, node }
  }

  const moveGhost = (x: number, y: number, grab: { x: number; y: number }) => {
    if (!ghost.current) return
    ghost.current.clone.style.left = `${x - grab.x}px`
    ghost.current.clone.style.top = `${y - grab.y}px`
  }

  const hideGhost = () => {
    if (!ghost.current) return
    ghost.current.clone.remove()
    ghost.current.node.style.opacity = ''
    ghost.current = null
  }

  /** Ricalcola il bersaglio con l'ultima posizione del puntatore (dopo uno scorrimento la pagina è cambiata sotto). */
  const refreshFlow = () => {
    const current = drag.current
    const last = pointer.current
    if (!current || current.kind !== 'flow' || !last) return
    const { x, y } = toDoc(last)
    moveGhost(x, y, current.grab)
    const placement = dropPlacement(x, y, { exclude: current.id, alt: last.alt, grab: current.grab, size: current.size, free: useDesigner.getState().freeMove })
    current.target = placement?.target ?? null
    setIndicator(placement?.indicator ?? null)
  }
  refreshFlowRef.current = refreshFlow

  /** Vicino al bordo alto o basso del canvas la pagina scorre da sola. Restituisce di quanto ha scorso. */
  const edgeScroll = (clientY: number, step: number): number => {
    const scroller = doc()?.scrollingElement
    const box = host.current?.getBoundingClientRect()
    if (!scroller || !box) return 0
    let delta = 0
    if (clientY < box.top + SCROLL_ZONE) delta = -step * Math.min(1, (box.top + SCROLL_ZONE - clientY) / SCROLL_ZONE)
    else if (clientY > box.bottom - SCROLL_ZONE) delta = step * Math.min(1, (clientY - (box.bottom - SCROLL_ZONE)) / SCROLL_ZONE)
    if (!delta) return 0
    const before = scroller.scrollTop
    scroller.scrollTop += delta / scale
    return scroller.scrollTop - before
  }

  const startScrollLoop = () => {
    cancelAnimationFrame(scrollLoop.current)
    const loop = () => {
      const current = drag.current
      if (!current || current.kind !== 'flow') return
      if (pointer.current && edgeScroll(pointer.current.clientY, 18)) refreshFlow()
      scrollLoop.current = requestAnimationFrame(loop)
    }
    scrollLoop.current = requestAnimationFrame(loop)
  }

  const enterFlow = (from: { id: number; startX: number; startY: number; grab: { x: number; y: number } }, home: number | null, origin: Rect | null) => {
    const node = elementNode(from.id)
    if (!node) return
    if (home !== null) {
      // Esce dalla tavola: l'elemento torna dov'era finché non lo si lascia.
      node.style.left = ''
      node.style.top = ''
      showSnap(null)
    }
    const r = node.getBoundingClientRect()
    drag.current = { kind: 'flow', id: from.id, startX: from.startX, startY: from.startY, grab: from.grab, size: { width: r.width, height: r.height }, home, origin, target: null }
    showGhost(from.id)
    startScrollLoop()
  }

  const cancelDrag = () => {
    const current = drag.current
    drag.current = null
    setMarquee(null)
    cancelAnimationFrame(scrollLoop.current)
    hideGhost()
    setIndicator(null)
    showSnap(null)
    hideDrawPreview()
    if (current && (current.kind === 'free-move' || current.kind === 'free-resize')) {
      const node = elementNode(current.id)
      if (node) for (const prop of ['left', 'top', 'width', 'height'] as const) node.style[prop] = ''
      for (const member of current.kind === 'free-move' ? current.group : []) {
        member.node.style.left = ''
        member.node.style.top = ''
      }
    }
    if (current?.kind === 'rotate') {
      const node = elementNode(current.id)
      if (node) node.style.transform = ''
    }
  }

  const hideDrawPreview = () => {
    if (drawPreview.current) drawPreview.current.style.display = 'none'
  }

  /** Inizio di un disegno: il contenitore è la tavola sotto il puntatore, o il primo contenitore che può ricevere figli. */
  const startDraw = (x: number, y: number, drawTool: DrawTool): boolean => {
    if (!page) return false
    const hit = idAt(x, y) ?? page.body
    if (hit === null) return false
    // Sopra una forma libera (un rettangolo è un <div>) si disegna accanto, non dentro: si sale al suo contenitore.
    let container = tavolaFor(hit) ?? freeContainerAt(page, hit)
    while (container !== null && container !== page.body && isFreeElement(page, container) && !hasClass(page.elements[container]!, FREE_CANVAS_CLASS)) {
      const parent = page.elements[container]!.parent
      container = parent === null ? null : (tavolaFor(parent) ?? freeContainerAt(page, parent))
    }
    const node = container !== null ? elementNode(container) : null
    if (container === null || !node) return false
    const r = node.getBoundingClientRect()
    const origin = { x: r.left + node.clientLeft, y: r.top + node.clientTop }
    const start = { x: x - origin.x, y: y - origin.y }
    const bounds = hasClass(page.elements[container]!, FREE_CANVAS_CLASS) ? { width: node.clientWidth, height: node.clientHeight } : null
    const current = drawnRect(start, start, drawTool)
    drag.current = { kind: 'draw', tool: drawTool, container, origin, start, bounds, containerHeight: node.offsetHeight, current }
    updateDraw(drag.current, x, y, false, false)
    return true
  }

  const updateDraw = (current: Extract<Drag, { kind: 'draw' }>, x: number, y: number, square: boolean, fromCenter: boolean) => {
    let box = drawnRect(current.start, { x: x - current.origin.x, y: y - current.origin.y }, current.tool, { square, fromCenter })
    // In una tavola (che taglia ciò che sborda) il disegno resta dentro.
    if (current.bounds) {
      const width = Math.min(box.width, current.bounds.width)
      const height = Math.min(box.height, current.bounds.height)
      box = { width, height, ...clampBox(box.left, box.top, width, height, current.bounds.width, current.bounds.height) }
    } else box = { ...box, left: Math.max(0, box.left), top: Math.max(0, box.top) }
    current.current = box
    const preview = drawPreview.current
    if (preview) {
      Object.assign(preview.style, { display: 'block', left: `${current.origin.x + box.left}px`, top: `${current.origin.y + box.top}px`, width: `${box.width}px`, height: `${box.height}px` })
      preview.dataset['tool'] = current.tool
    }
    showSnap({ label: sizeLabel(box, current.origin) })
  }

  // ------------------------------------------------------------ puntatore

  // Spostamento della vista (sul canvas e anche sullo sfondo attorno alla pagina).
  const isPanStart = (event: React.PointerEvent) => event.button === 1 || (event.button === 0 && (spaceHeld || tool === 'hand'))

  const onHostPointerDown = (event: React.PointerEvent) => {
    if (!isPanStart(event)) return
    event.preventDefault()
    panDrag.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
    host.current?.setPointerCapture(event.pointerId)
  }

  const onHostPointerMove = (event: React.PointerEvent) => {
    // Mirino nei righelli: spostato direttamente nel DOM (niente ridisegno a ogni movimento).
    const box = host.current?.getBoundingClientRect()
    if (box && crossX.current && crossY.current) {
      crossX.current.style.display = 'block'
      crossY.current.style.display = 'block'
      crossX.current.style.left = `${event.clientX - box.left}px`
      crossY.current.style.top = `${event.clientY - box.top}px`
    }
    const current = panDrag.current
    if (!current) return
    const dx = event.clientX - current.x
    const dy = event.clientY - current.y
    current.x = event.clientX
    current.y = event.clientY
    if (dx) setPan(left + dx)
    const scroller = doc()?.scrollingElement
    if (scroller && dy) scroller.scrollTop -= dy / scale
  }

  const onHostPointerUp = (event: React.PointerEvent) => {
    if (!panDrag.current) return
    panDrag.current = null
    host.current?.releasePointerCapture?.(event.pointerId)
  }

  const onPointerDown = (event: React.PointerEvent) => {
    if (isPanStart(event)) return
    if (event.button !== 0 || editing) return
    overlay.current?.focus()
    const { x, y } = toDoc(event)
    showSnap(null)
    const handle = (event.target as HTMLElement).dataset['handle']
    if ((event.target as HTMLElement).dataset['rotate'] && selected) {
      const node = elementNode(selected.id)
      const r = rectOf(node)
      if (!node || !r) return
      const center = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      const start = rotationOf(node)
      drag.current = { kind: 'rotate', id: selected.id, center, start, pointer0: Math.atan2(y - center.y, x - center.x), current: start, top: r.top }
      overlay.current?.setPointerCapture(event.pointerId)
      return
    }
    // Strumento di disegno: si traccia un elemento nuovo (clic = misura base).
    if (isShapeTool(tool) && !handle) {
      if (startDraw(x, y, tool)) overlay.current?.setPointerCapture(event.pointerId)
      return
    }
    if (handle && selected) {
      const node = elementNode(selected.id)!
      const free = isFreeElement(page!, selected.id)
      const origin = free ? { left: node.offsetLeft, top: node.offsetTop, width: node.offsetWidth, height: node.offsetHeight } : rectOf(node)!
      drag.current = { kind: 'free-resize', startX: x, startY: y, id: selected.id, handle, origin, current: origin, free }
      overlay.current?.setPointerCapture(event.pointerId)
      return
    }
    const id = idAt(x, y)
    const element = id !== null ? page!.elements[id]! : null
    // Sullo sfondo (il body o fuori dalla pagina): rettangolo di selezione (1.6).
    if (!element || element.tag === 'body') {
      select(element)
      drag.current = { kind: 'marquee', startX: x, startY: y, current: { x, y } }
      overlay.current?.setPointerCapture(event.pointerId)
      return
    }
    // Maiusc o Ctrl + clic: aggiunge o toglie l'elemento dalla selezione multipla.
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      useDesigner.getState().toggleInGroup(element)
      return
    }
    // Clic su un elemento già nella selezione multipla: resta tutto scelto (per spostarli insieme).
    const group = selectedElements()
    if (group.length > 1 && group.some((e) => e.id === element.id)) useDesigner.getState().setGroup([element, ...group.filter((e) => e.id !== element.id)])
    else select(element)
    const r = rectOf(elementNode(element.id))
    drag.current = { kind: 'pending', startX: x, startY: y, id: element.id, grab: r ? { x: x - r.left, y: y - r.top } : { x: 0, y: 0 } }
    overlay.current?.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (panDrag.current) return
    const { x, y } = toDoc(event)
    pointer.current = { clientX: event.clientX, clientY: event.clientY, alt: event.altKey }
    const current = drag.current
    if (!current) {
      const id = idAt(x, y)
      if (id !== useDesigner.getState().hoverId) useDesigner.getState().setHover(id)
      // Alt sopra un altro elemento: le distanze fra quello scelto e questo (stile Figma).
      const chosen = selectedElements()[0]
      const a = event.altKey && chosen && id !== null && id !== chosen.id ? rectOf(elementNode(chosen.id)) : null
      const b = a ? rectOf(elementNode(id)) : null
      showSnap(a && b ? { measures: measureBetween(a, b) } : null)
      return
    }
    if (current.kind === 'draw') {
      updateDraw(current, x, y, event.shiftKey, event.altKey)
      return
    }
    if (current.kind === 'rotate') {
      const node = elementNode(current.id)
      if (!node) return
      let deg = current.start + ((Math.atan2(y - current.center.y, x - current.center.x) - current.pointer0) * 180) / Math.PI
      deg = event.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg)
      deg = ((((deg + 180) % 360) + 360) % 360) - 180
      current.current = deg
      node.style.transform = deg ? `rotate(${deg}deg)` : 'none'
      showSnap({ label: { text: `${deg}°`, x: current.center.x, y: current.top - 28 / scale } })
      return
    }
    if (current.kind === 'marquee') {
      current.current = { x, y }
      setMarquee(boxBetween({ x: current.startX, y: current.startY }, current.current))
      return
    }
    if (current.kind === 'pending') {
      if (Math.hypot(x - current.startX, y - current.startY) < 5) return
      const node = elementNode(current.id)
      if (!node) return
      if (isFreeElement(page!, current.id)) {
        const origin = { left: node.offsetLeft, top: node.offsetTop, width: node.offsetWidth, height: node.offsetHeight }
        // Gli altri elementi liberi scelti si spostano insieme (stesso spostamento).
        const group = selectedElements()
          .filter((e) => e.id !== current.id && isFreeElement(page!, e.id))
          .map((e) => ({ id: e.id, node: elementNode(e.id) }))
          .filter((m): m is { id: number; node: HTMLElement } => !!m.node)
          .map((m) => ({ ...m, left: m.node.offsetLeft, top: m.node.offsetTop }))
        drag.current = { kind: 'free-move', startX: current.startX, startY: current.startY, id: current.id, origin, current: origin, home: page!.elements[current.id]!.parent!, grab: current.grab, group }
      } else {
        enterFlow(current, null, null)
        refreshFlow()
      }
      return
    }
    if (current.kind === 'flow') {
      // Un elemento libero che rientra nella sua tavola torna a spostarsi a mano libera.
      const homeRect = current.home !== null ? rectOf(elementNode(current.home)) : null
      if (homeRect && current.origin && inside(homeRect, x, y)) {
        hideGhost()
        cancelAnimationFrame(scrollLoop.current)
        setIndicator(null)
        drag.current = { kind: 'free-move', startX: current.startX, startY: current.startY, id: current.id, origin: current.origin, current: current.origin, home: current.home!, grab: current.grab, group: [] }
        return
      }
      refreshFlow()
      return
    }
    const node = elementNode(current.id)
    if (!node) return
    const dx = x - current.startX
    const dy = y - current.startY
    if (current.kind === 'free-move') {
      const parent = node.parentElement!
      const parentRect = rectOf(parent)!
      // Ben fuori dalla tavola: diventa un trascinamento a flusso (al rilascio l'elemento esce dalla tavola).
      const margin = LEAVE_MARGIN / scale
      if (!inside({ left: parentRect.left - margin, top: parentRect.top - margin, width: parentRect.width + 2 * margin, height: parentRect.height + 2 * margin }, x, y)) {
        enterFlow(current, current.home, current.origin)
        refreshFlow()
        return
      }
      // Aggancio del canvas kit: bordi e centri di contenitore, fratelli e guide dei righelli, più linee
      // insieme, distanze uguali; Alt lo spegne. Le misure in px verso i vicini si vedono mentre si sposta.
      const w = current.origin.width
      const h = current.origin.height
      const { origin, ctx } = snapContextOf(node, new Set<Element>([node, ...current.group.map((m) => m.node)]))
      const snapped = snapMove({ left: current.origin.left + dx, top: current.origin.top + dy, width: w, height: h }, ctx, event.altKey)
      // Mai oltre i bordi della tavola (che taglia ciò che sborda): l'elemento resta sempre visibile.
      const clamped = clampBox(snapped.box.left, snapped.box.top, w, h, parent.clientWidth, parent.clientHeight)
      const left = clamped.left
      const top = clamped.top
      const placed = { left, top, width: w, height: h }
      showSnap({ origin, guides: snapped.guides, spacing: snapped.spacing, measures: nearestDistances(placed, ctx.siblings, ctx.container) })
      current.current = { ...current.origin, left, top }
      node.style.left = `${left}px`
      node.style.top = `${top}px`
      for (const member of current.group) {
        member.node.style.left = `${member.left + left - current.origin.left}px`
        member.node.style.top = `${member.top + top - current.origin.top}px`
      }
      return
    }
    // Ridimensionamento.
    // Ridimensionamento del canvas kit (Maiusc = proporzioni); da libero aggancia i bordi mossi alle stesse linee.
    const { handle, origin } = current
    let box = resizeRect(origin, handle as Handle, { x: dx, y: dy }, { keepRatio: event.shiftKey })
    if (current.free) {
      const { origin: o, ctx } = snapContextOf(node, new Set<Element>([node]))
      const snapped = snapResize(box, handle as Handle, ctx, event.altKey)
      box = snapped.box
      showSnap({ origin: o, guides: snapped.guides, label: sizeLabel(box, o) })
    } else showSnap({ label: sizeLabel(box) })
    current.current = box
    node.style.width = `${box.width}px`
    node.style.height = `${box.height}px`
    if (current.free) {
      node.style.left = `${box.left}px`
      node.style.top = `${box.top}px`
    }
  }

  const onPointerUp = (event: React.PointerEvent) => {
    const current = drag.current
    drag.current = null
    cancelAnimationFrame(scrollLoop.current)
    overlay.current?.releasePointerCapture?.(event.pointerId)
    hideGhost()
    showSnap(null)
    hideDrawPreview()
    setIndicator(null)
    if (!current) return
    if (current.kind === 'draw') {
      const box = current.current
      // Dopo aver disegnato si torna a Seleziona (come negli editor di grafica).
      useCanvasView.getState().setTool('select')
      void drawElement(current.tool, current.container, box, Math.max(current.containerHeight, box.top + box.height + 8))
      return
    }
    if (current.kind === 'rotate') {
      if (current.current === current.start) {
        const node = elementNode(current.id)
        if (node) node.style.transform = ''
        return
      }
      void setElementRules([{ id: current.id, declarations: { transform: current.current ? `rotate(${current.current}deg)` : null } }])
      return
    }
    // Clic (senza trascinare) su un elemento della selezione multipla: resta solo lui.
    if (current.kind === 'pending' && useDesigner.getState().others.length) {
      useDesigner.getState().selectElement(page!.elements[current.id] ?? null)
      return
    }
    if (current.kind === 'marquee') {
      setMarquee(null)
      const box = boxBetween({ x: current.startX, y: current.startY }, current.current)
      // Un clic senza trascinare resta un clic (il body scelto).
      if (box.width < 4 && box.height < 4) return
      const hits = marqueeHits(page!, box, (id) => rectOf(elementNode(id)), unpickable)
      if (hits.length) useDesigner.getState().setGroup(hits.map((id) => page!.elements[id]!))
      return
    }
    if (current.kind === 'free-move') {
      const dx = current.current.left - current.origin.left
      const dy = current.current.top - current.origin.top
      if (current.group.length) void setFreeBoxes([{ id: current.id, left: current.current.left, top: current.current.top }, ...current.group.map((m) => ({ id: m.id, left: m.left + dx, top: m.top + dy }))])
      else void setFreeBox({ left: current.current.left, top: current.current.top })
    }
    else if (current.kind === 'free-resize') {
      const { left, top, width, height } = current.current
      const { origin } = current
      // Un clic su una maniglia senza trascinare non cambia niente (niente id né larghezza scritti per caso).
      if (Math.abs(width - origin.width) < 1 && Math.abs(height - origin.height) < 1 && Math.abs(left - origin.left) < 1 && Math.abs(top - origin.top) < 1) return
      if (current.free) void setFreeBox({ left, top, width, height })
      else void setStyles({ width: `${Math.round(width)}px`, height: handleChangesHeight(current.handle) ? `${Math.round(height)}px` : null })
    } else if (current.kind === 'flow' && current.target) {
      // Si sposta l'elemento trascinato (non la selezione, che nel frattempo può essere cambiata).
      const target = current.target
      if ('freeIn' in target) {
        const container = elementNode(target.freeIn)
        // Con «Sposta liberamente» il contenitore non deve accorciarsi né tagliare l'elemento: altezza minima fino al suo fondo.
        const containerHeight = Math.max(container?.offsetHeight ?? 0, target.y + current.size.height + 8)
        // In fondo al contenitore, ma prima degli script finali (come ogni inserimento del designer).
        const at = target.make ? appendTarget(page!, target.freeIn, current.id) : { id: target.freeIn, where: 'inside-end' as const }
        void moveNode(current.id, at.id, at.where, { left: target.x, top: target.y, width: current.size.width }, target.make ? { container: target.freeIn, containerHeight } : undefined)
      }
      else void moveNode(current.id, target.id, target.where)
    }
  }

  // ------------------------------------------------------------ trascinamento dalla palette

  const onDragOver = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes('text/x-lab-block')) return
    event.preventDefault()
    edgeScroll(event.clientY, 24)
    const { x, y } = toDoc(event)
    const placement = dropPlacement(x, y, { alt: event.altKey })
    setIndicator(placement?.indicator ?? null)
  }

  const onDrop = (event: React.DragEvent) => {
    const blockId = event.dataTransfer.getData('text/x-lab-block')
    setIndicator(null)
    if (!blockId) return
    event.preventDefault()
    const { x, y } = toDoc(event)
    // In una tavola libera il blocco nuovo (con la sua misura iniziale) resta dentro i bordi.
    const placement = dropPlacement(x, y, { alt: event.altKey, size: blockById(blockId)?.freeSize })
    if (!placement) return
    const target = placement.target
    // Una pagina intera sostituisce la pagina (o va in fondo), anche se la si lascia sopra una tavola libera.
    if (blockId.startsWith('pagina-') && page) void placePage(blockId)
    else void insertBlock(blockId, 'freeIn' in target ? target : { targetId: target.id, where: target.where })
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (editing) return
    // Esc durante un trascinamento lo annulla (e non cambia la selezione).
    if (event.key === 'Escape' && drag.current) {
      event.preventDefault()
      cancelDrag()
      return
    }
    const ctrl = event.ctrlKey || event.metaKey
    // Strumenti di disegno: V H F R O T B I; Esc torna a Seleziona.
    if (event.key === 'Escape' && useCanvasView.getState().tool !== 'select') {
      event.preventDefault()
      useCanvasView.getState().setTool('select')
      return
    }
    if (!ctrl && !event.altKey && event.key.length === 1) {
      const next = toolForKey(event.key)
      if (next) {
        event.preventDefault()
        useCanvasView.getState().setTool(next)
        return
      }
    }
    if (ctrl && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
    } else if (ctrl && event.key.toLowerCase() === 'y') {
      event.preventDefault()
      redo()
    } else if (ctrl && event.altKey && event.key.toLowerCase() === 'c' && selected) {
      // Copia e incolla dello stile (non dell'elemento), come negli editor di grafica.
      event.preventDefault()
      copyStyleWithNotice(selected)
    } else if (ctrl && event.altKey && event.key.toLowerCase() === 'v') {
      event.preventDefault()
      void pasteStyle()
    } else if (ctrl && event.key.toLowerCase() === 'd') {
      event.preventDefault()
      void duplicateSelected()
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      void removeSelected()
    } else if (event.key === 'Escape' && selected?.parent != null && !others.length) {
      select(page!.elements[selected.parent]!)
    } else if (event.key === 'Enter' && selected?.leafText) {
      event.preventDefault()
      startEditing(selected)
    } else if (event.key === 'Escape' && others.length) {
      // Prima Esc: resta solo l'elemento principale.
      event.preventDefault()
      useDesigner.getState().selectElement(selected ?? null)
    } else if (event.key.startsWith('Arrow') && selectedElements().some((e) => isFreeElement(page!, e.id))) {
      event.preventDefault()
      const step = event.shiftKey ? 10 : 1
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
      const boxes = selectedElements()
        .filter((e) => isFreeElement(page!, e.id))
        .map((e) => ({ id: e.id, node: elementNode(e.id) }))
        .filter((m): m is { id: number; node: HTMLElement } => !!m.node)
        .map(({ id, node }) => {
          const parent = node.parentElement!
          return { id, ...clampBox(node.offsetLeft + dx, node.offsetTop + dy, node.offsetWidth, node.offsetHeight, parent.clientWidth, parent.clientHeight) }
        })
      void setFreeBoxes(boxes)
    }
  }

  /** «Mettilo dove vuoi»: libero dov'è adesso (misure prese nel canvas, rispetto al contenitore). */
  const makeFreeHere = (id: number) => {
    const node = elementNode(id)
    const parent = node?.parentElement
    if (!node || !parent) return
    const r = node.getBoundingClientRect()
    const p = parent.getBoundingClientRect()
    void makeFreeInPlace(id, { left: r.left - p.left - parent.clientLeft, top: r.top - p.top - parent.clientTop, width: r.width }, parent.offsetHeight)
  }

  const onContextMenu = (event: React.MouseEvent) => {
    const { x, y } = toDoc(event)
    const id = idAt(x, y)
    const element = id !== null ? page?.elements[id] : null
    if (!element) return
    // Tasto destro su un elemento già scelto con altri: la selezione multipla resta (allinea, livelli…).
    const group = selectedElements()
    const inGroup = group.length > 1 && group.some((e) => e.id === element.id)
    if (!inGroup) select(element)
    const parent = element.parent !== null ? page!.elements[element.parent] : null
    const free = isFreeElement(page!, element.id)
    const restackItems: MenuItem[] = (['front', 'forward', 'backward', 'back'] as RestackOp[]).map((op) => ({ label: t(`designer.restack.${op}` as 'designer.restack.front'), run: () => void restackSelection(op), testId: `designer-restack-${op}` }))
    const alignItems: MenuItem[] = [
      ...ALIGN_MODES.map((mode) => ({ label: t(`designer.align.${mode}` as 'designer.align.left'), run: () => void alignSelection(mode), testId: `designer-align-${mode}` })),
      'separator' as const,
      { label: t('designer.distributeH'), run: () => void distributeSelection('horizontal'), disabled: group.length < 3, title: t('designer.distributeNeedThree') },
      { label: t('designer.distributeV'), run: () => void distributeSelection('vertical'), disabled: group.length < 3, title: t('designer.distributeNeedThree') }
    ]
    // «Da libero a layout»: sul contenitore con figli liberi (o sul contenitore dell'elemento libero).
    const layoutTarget = canInferLayout(element) ? element : parent && canInferLayout(parent) ? parent : null
    const node = elementNode(element.id)
    const rotated = node ? rotationOf(node) !== 0 : false
    const items: MenuItem[] = [
      ...(element.leafText && !inGroup ? [{ label: t('designer.editText'), run: () => startEditing(element) }] : []),
      ...(!inGroup ? [{ label: t('designer.duplicate'), run: () => void duplicateSelected() }] : []),
      ...(parent && parent.tag !== 'html' && !inGroup ? [{ label: t('designer.selectParent'), run: () => select(parent) }] : []),
      'separator' as const,
      ...(inGroup ? [{ label: t('designer.arrange'), items: alignItems, testId: 'designer-align-menu' }] : []),
      { label: t('designer.copyStyle'), run: () => copyStyleWithNotice(element) },
      ...(useDesigner.getState().styleClipboard > 0 ? [{ label: t('designer.pasteStyle'), run: () => void pasteStyle() }] : []),
      ...(free
        ? [
            { label: t('designer.layers'), items: restackItems, testId: 'designer-restack-menu' },
            hasClass(element, FREE_ELEMENT_CLASS)
              ? { label: t('designer.backToFlow'), run: () => void backToFlow(element.id), testId: 'designer-back-to-flow' }
              : { label: t('designer.moveOutOfCanvas'), run: () => void moveOutOfFreeCanvas(element.id) }
          ]
        : element.tag !== 'body' && parent && !inGroup
          ? [{ label: t('designer.makeFree'), run: () => makeFreeHere(element.id), testId: 'designer-make-free' }]
          : []),
      ...(rotated ? [{ label: t('designer.unrotate'), run: () => void setElementRules([{ id: element.id, declarations: { transform: null } }]), testId: 'designer-unrotate' }] : []),
      ...(layoutTarget ? [{ label: t('designer.freeToLayout'), detail: elementLabel(layoutTarget), run: () => void freeToLayout(layoutTarget), testId: 'designer-free-to-layout' }] : []),
      'separator' as const,
      { label: t('designer.delete'), danger: true, run: () => void removeSelected() }
    ]
    showContextMenu(event, items)
  }

  const commitEdit = (text: string | null) => {
    const current = editing
    setEditing(null)
    overlay.current?.focus()
    if (current && text !== null && text !== current.text) void setElementText(current.id, text.replace(/\n+$/, ''))
  }

  const selectedRect = rectOf(elementNode(selected?.id))
  const hoverRect = hoverId !== null && hoverId !== selected?.id && !indicator ? rectOf(elementNode(hoverId)) : null
  const selectedFree = selected ? isFreeElement(page!, selected.id) : false
  const resizable = selected && !['body', 'html'].includes(selected.tag)
  // Righelli: px della pagina sotto il bordo della tela, selezione evidenziata (in px della tela).
  const toHostX = (overlayX: number) => left + overlayX * scale
  const toHostY = (overlayY: number) => STAGE_PAD + overlayY * scale
  const rulerView = {
    width: hostSize.width,
    height: hostSize.height,
    originX: scroll.left - left / scale,
    originY: scroll.top - STAGE_PAD / scale,
    scale,
    selection: selectedRect ? { x0: toHostX(selectedRect.left), x1: toHostX(selectedRect.left + selectedRect.width), y0: toHostY(selectedRect.top), y1: toHostY(selectedRect.top + selectedRect.height) } : null
  }
  const shownGuides = (axis: 'x' | 'y') => {
    const list = axis === 'x' ? userGuides.xs : userGuides.ys
    if (!guideDrag || guideDrag.axis !== axis) return list.map((value, index) => ({ value, index, dragging: false }))
    const out = list.map((value, index) => ({ value: index === guideDrag.index ? guideDrag.value : value, index, dragging: index === guideDrag.index }))
    if (guideDrag.index >= list.length) out.push({ value: guideDrag.value, index: guideDrag.index, dragging: true })
    return out
  }

  return (
    <div className={`designer-canvas${rulers ? ' with-rulers' : ''}`} data-testid="designer-canvas">
      <DrawTools />
      {rulers && <Rulers view={rulerView} crossX={crossX} crossY={crossY} onGuideStart={(axis, event) => startGuideDrag(axis, axis === 'x' ? userGuides.xs.length : userGuides.ys.length, event)} />}
    <div
      className={`designer-host${spaceHeld || tool === 'hand' ? ' panning' : ''}${isShapeTool(tool) ? ' drawing' : ''}`}
      ref={host}
      onPointerDown={onHostPointerDown}
      onPointerMove={onHostPointerMove}
      onPointerUp={onHostPointerUp}
      onPointerCancel={onHostPointerUp}
      onPointerEnter={() => (hovering.current = true)}
      onPointerLeave={() => {
        hovering.current = false
        if (crossX.current) crossX.current.style.display = 'none'
        if (crossY.current) crossY.current.style.display = 'none'
      }}
      onAuxClick={(event) => event.button === 1 && event.preventDefault()}
      data-testid="designer-host"
    >
      <div
        className="designer-stage"
        // --dz-inv: le maniglie, le etichette e le linee restano della stessa misura sullo schermo a ogni zoom.
        style={{ width, height, left, top: STAGE_PAD, transform: `scale(${scale})`, ['--dz-inv' as string]: String(1 / scale) }}
        data-scale={scale}
      >
        <iframe ref={iframe} title={t('designer.canvasTitle')} sandbox="allow-same-origin" className="designer-frame" data-testid="designer-frame" />
        <div
          ref={overlay}
          className="designer-overlay"
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={cancelDrag}
          onPointerLeave={() => {
            if (drag.current) return
            useDesigner.getState().setHover(null)
            showSnap(null)
          }}
          onDoubleClick={() => selected?.leafText && startEditing(selected)}
          onDragOver={onDragOver}
          onDragLeave={() => setIndicator(null)}
          onDrop={onDrop}
          onKeyDown={onKeyDown}
          onKeyUp={(event) => event.key === 'Alt' && !drag.current && showSnap(null)}
          onContextMenu={onContextMenu}
          data-testid="designer-overlay"
        >
          {hoverRect && <div className="dz-hover" style={boxStyle(hoverRect)} />}
          {selectedRect && selected && (
            <div className={`dz-selected${selectedFree ? ' free' : ''}`} style={boxStyle(selectedRect)} data-testid="designer-selection">
              <span className="dz-label">
                {selected.tag}
                {selected.attrs['id'] ? `#${selected.attrs['id']}` : ''}
                {selectedFree ? ` · ${t('designer.free')}` : ''}
                {others.length > 0 ? ` · ${t('designer.multiCount', { n: others.length + 1 })}` : ''}
              </span>
              {resizable && visibleHandles(selectedFree ? HANDLES : ['e', 's', 'se'], selectedRect.width * scale, selectedRect.height * scale).map((h) => <span key={h} className={`dz-handle h-${h}`} data-handle={h} />)}
              {/* Solo sugli elementi liberi: su quelli in fila coprirebbe l'elemento di sopra (clic rubati). */}
              {resizable && selectedFree && !others.length && <span className="dz-rotate" data-rotate="1" title={t('designer.rotateHint')} data-testid="designer-rotate" />}
            </div>
          )}
          {others.length > 0 &&
            selectedElements()
              .slice(1)
              .map((element) => {
                const rect = rectOf(elementNode(element.id))
                return rect ? <div key={element.id} className="dz-multi" style={boxStyle(rect)} data-testid="designer-multi" /> : null
              })}
          {marquee && <div className="dz-marquee" style={boxStyle(marquee)} data-testid="designer-marquee" />}
          {indicator?.parent && <div className={`dz-inside${indicator.free ? ' free' : ''}`} style={boxStyle(indicator.parent)} data-testid="designer-drop-parent" />}
          {indicator?.line && (
            <div
              className={`dz-line${indicator.line.vertical ? ' vertical' : ''}`}
              style={indicator.line.vertical ? { left: indicator.line.left, top: indicator.line.top, height: indicator.line.length } : { left: indicator.line.left, top: indicator.line.top, width: indicator.line.length }}
              data-testid="designer-drop-line"
            />
          )}
          {indicator && (
            <div
              className="dz-drop-label"
              // Il canvas è scalato: l'etichetta compensa (CSS con --dz-inv) per restare leggibile.
              style={{ left: Math.max(0, indicator.parent?.left ?? 0), top: Math.max(0, (indicator.parent?.top ?? 0) - 22 / scale) }}
              data-testid="designer-drop-label"
            >
              {indicator.label}
            </div>
          )}
          <SnapLayer />
          <div ref={drawPreview} className="dz-draw-preview" style={{ display: 'none' }} data-testid="designer-draw-preview" />
          {editing && (
            <div
              className="dz-editor"
              style={{ ...boxStyle(editing.rect), ...editing.style }}
              contentEditable
              suppressContentEditableWarning
              ref={(element) => {
                if (element && document.activeElement !== element) {
                  element.focus()
                  const range = document.createRange()
                  range.selectNodeContents(element)
                  window.getSelection()?.removeAllRanges()
                  window.getSelection()?.addRange(range)
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onBlur={(e) => commitEdit(e.currentTarget.innerText)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  ;(e.currentTarget as HTMLElement).blur()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  commitEdit(null)
                }
              }}
              data-testid="designer-text-editor"
            >
              {editing.text}
            </div>
          )}
        </div>
      </div>
      {/* Guide dei righelli: sopra la pagina, si spostano trascinandole; riportate sul righello spariscono. */}
      {shownGuides('x').map((g) => (
        <div key={`gx${g.index}`} className={`dz-user-guide v${g.dragging ? ' dragging' : ''}${g.dragging && guideDrag?.out ? ' leaving' : ''}`} style={{ left: left + (g.value - scroll.left) * scale }} onPointerDown={(e) => e.button === 0 && startGuideDrag('x', g.index, e)} title={t('designer.guideHint')} data-testid="user-guide-x" />
      ))}
      {shownGuides('y').map((g) => (
        <div key={`gy${g.index}`} className={`dz-user-guide h${g.dragging ? ' dragging' : ''}${g.dragging && guideDrag?.out ? ' leaving' : ''}`} style={{ top: STAGE_PAD + (g.value - scroll.top) * scale }} onPointerDown={(e) => e.button === 0 && startGuideDrag('y', g.index, e)} title={t('designer.guideHint')} data-testid="user-guide-y" />
      ))}
    </div>
    </div>
  )
}

/**
 * Maniglie da mostrare: su un elemento piccolo sullo schermo (es. a zoom basso) quelle a metà lato
 * coprirebbero l'elemento e un clic per selezionarlo o trascinarlo diventerebbe un ridimensionamento.
 */
function visibleHandles(handles: string[], screenWidth: number, screenHeight: number): string[] {
  return handles.filter((h) => !((h === 'n' || h === 's') && screenHeight < 28) && !((h === 'e' || h === 'w') && screenWidth < 28))
}

function handleChangesHeight(handle: string): boolean {
  return handle.includes('s') || handle.includes('n')
}

function boxStyle(rect: Rect): React.CSSProperties {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

export { keyOf }
