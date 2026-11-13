// Canvas del designer: la pagina in un iframe senza script (stessa origine, quindi leggibile) e, sopra,
// un livello che gestisce tutte le interazioni. Nelle "tavole libere" gli elementi si spostano e si
// ridimensionano a mano libera con guide magnetiche (stile Canva); altrove si riordinano a flusso (stile Wix).
// Le regole su dove finisce un elemento rilasciato stanno in @shared/designer/drop (pure e testate).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FREE_CANVAS_CLASS, hasClass, isFreeElement, type ElementInfo } from '@shared/designer/html-model'
import { clampBox, decideDrop, elementLabel, flowAxis, targetParent, type Axis, type DropTarget } from '@shared/designer/drop'
import { showContextMenu } from '../../ui/ContextMenu'
import { t } from '../../i18n'
import { notify } from '../../workbench/notifications'
import { copyStyle, duplicateSelected, endOfBody, insertBlock, moveNode, moveOutOfFreeCanvas, pasteStyle, removeSelected, setElementText, setFreeBox, setStyles } from './actions'
import { redo, undo } from './document'
import { keyOf, resolveSelection, useDesigner } from './designer-store'
import { registerFrame } from './frame-access'

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

type FreeTarget = { freeIn: number; x: number; y: number }
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
  | { kind: 'free-move'; startX: number; startY: number; id: number; origin: Rect; current: Rect; home: number; grab: { x: number; y: number } }
  | { kind: 'free-resize'; startX: number; startY: number; id: number; handle: string; origin: Rect; current: Rect; free: boolean }
  | FlowDrag

interface Indicator {
  /** Contenitore che riceverà l'elemento. */
  parent: Rect | null
  /** Linea d'inserimento (verticale nelle righe flex e nelle griglie). */
  line: { left: number; top: number; length: number; vertical: boolean } | null
  free: boolean
  label: string
}

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const SNAP = 6
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

export function Canvas({ html: canvasHtml, width, onReady }: { html: string; width: number; onReady?: () => void }) {
  const page = useDesigner((s) => s.html)
  const selection = useDesigner((s) => s.selection)
  const hoverId = useDesigner((s) => s.hoverId)
  const iframe = useRef<HTMLIFrameElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const ghost = useRef<{ clone: HTMLElement; node: HTMLElement } | null>(null)
  const pointer = useRef<{ clientX: number; clientY: number; alt: boolean } | null>(null)
  const scrollLoop = useRef(0)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState(600)
  const [, setTick] = useState(0)
  const [indicator, setIndicator] = useState<Indicator | null>(null)
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] })
  const [editing, setEditing] = useState<{ id: number; rect: Rect; style: React.CSSProperties; text: string } | null>(null)

  const selected = resolveSelection(page, selection)
  const doc = () => iframe.current?.contentDocument ?? null
  const elementNode = useCallback((id: number | null | undefined) => (id === null || id === undefined ? null : (doc()?.querySelector(`[data-lab-id="${id}"]`) as HTMLElement | null)), [])

  useEffect(() => {
    registerFrame(iframe.current)
    return () => registerFrame(null)
  }, [])

  // Scrive la pagina nell'iframe a ogni cambiamento del sorgente; poi, se richiesto, porta in vista la selezione.
  useEffect(() => {
    writeCanvas(iframe.current, canvasHtml, () => {
      const state = useDesigner.getState()
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
  }, [canvasHtml, onReady])

  // Adatta la scala alla larghezza disponibile.
  useLayoutEffect(() => {
    const element = host.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      const available = element.clientWidth - 24
      const next = Math.min(1, available / width)
      setScale(next > 0 ? next : 1)
      setHeight(Math.max(300, (element.clientHeight - 24) / (next > 0 ? next : 1)))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [width])

  // Ridisegna i riquadri: la pagina può cambiare (immagini caricate, scorrimento) senza avvisare.
  useEffect(() => {
    let frame = 0
    let last = ''
    const loop = () => {
      const s = rectOf(elementNode(useDesigner.getState().selection ? resolveSelection(useDesigner.getState().html, useDesigner.getState().selection)?.id : null))
      const h = rectOf(elementNode(useDesigner.getState().hoverId))
      const signature = JSON.stringify([s, h])
      if (signature !== last) {
        last = signature
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
      return id
    }
    return page.body
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
  const dropPlacement = (x: number, y: number, options: { exclude?: number; alt?: boolean; grab?: { x: number; y: number }; size?: { width: number; height: number } } = {}): { indicator: Indicator; target: FlowTarget } | null => {
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
    const placement = dropPlacement(x, y, { exclude: current.id, alt: last.alt, grab: current.grab, size: current.size })
    current.target = placement?.target ?? null
    setIndicator(placement?.indicator ?? null)
  }

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
      setGuides({ x: [], y: [] })
    }
    const r = node.getBoundingClientRect()
    drag.current = { kind: 'flow', id: from.id, startX: from.startX, startY: from.startY, grab: from.grab, size: { width: r.width, height: r.height }, home, origin, target: null }
    showGhost(from.id)
    startScrollLoop()
  }

  const cancelDrag = () => {
    const current = drag.current
    drag.current = null
    cancelAnimationFrame(scrollLoop.current)
    hideGhost()
    setIndicator(null)
    setGuides({ x: [], y: [] })
    if (current && (current.kind === 'free-move' || current.kind === 'free-resize')) {
      const node = elementNode(current.id)
      if (node) for (const prop of ['left', 'top', 'width', 'height'] as const) node.style[prop] = ''
    }
  }

  // ------------------------------------------------------------ puntatore

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0 || editing) return
    overlay.current?.focus()
    const { x, y } = toDoc(event)
    const handle = (event.target as HTMLElement).dataset['handle']
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
    if (!element) return
    select(element)
    if (element.tag !== 'body') {
      const r = rectOf(elementNode(element.id))
      drag.current = { kind: 'pending', startX: x, startY: y, id: element.id, grab: r ? { x: x - r.left, y: y - r.top } : { x: 0, y: 0 } }
      overlay.current?.setPointerCapture(event.pointerId)
    }
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const { x, y } = toDoc(event)
    pointer.current = { clientX: event.clientX, clientY: event.clientY, alt: event.altKey }
    const current = drag.current
    if (!current) {
      const id = idAt(x, y)
      if (id !== useDesigner.getState().hoverId) useDesigner.getState().setHover(id)
      return
    }
    if (current.kind === 'pending') {
      if (Math.hypot(x - current.startX, y - current.startY) < 5) return
      const node = elementNode(current.id)
      if (!node) return
      if (isFreeElement(page!, current.id)) {
        const origin = { left: node.offsetLeft, top: node.offsetTop, width: node.offsetWidth, height: node.offsetHeight }
        drag.current = { kind: 'free-move', startX: current.startX, startY: current.startY, id: current.id, origin, current: origin, home: page!.elements[current.id]!.parent!, grab: current.grab }
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
        drag.current = { kind: 'free-move', startX: current.startX, startY: current.startY, id: current.id, origin: current.origin, current: current.origin, home: current.home!, grab: current.grab }
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
      let left = current.origin.left + dx
      let top = current.origin.top + dy
      // Guide magnetiche: bordi e centri della tavola e degli altri elementi.
      const xs = [0, parent.clientWidth / 2, parent.clientWidth]
      const ys = [0, parent.clientHeight / 2, parent.clientHeight]
      for (const sibling of Array.from(parent.children) as HTMLElement[]) {
        if (sibling === node) continue
        xs.push(sibling.offsetLeft, sibling.offsetLeft + sibling.offsetWidth / 2, sibling.offsetLeft + sibling.offsetWidth)
        ys.push(sibling.offsetTop, sibling.offsetTop + sibling.offsetHeight / 2, sibling.offsetTop + sibling.offsetHeight)
      }
      const w = current.origin.width
      const h = current.origin.height
      const snapX = event.altKey ? null : xs.flatMap((gx) => [gx - left, gx - (left + w / 2), gx - (left + w)].map((delta) => ({ gx, delta }))).filter((c) => Math.abs(c.delta) <= SNAP).sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0]
      const snapY = event.altKey ? null : ys.flatMap((gy) => [gy - top, gy - (top + h / 2), gy - (top + h)].map((delta) => ({ gy, delta }))).filter((c) => Math.abs(c.delta) <= SNAP).sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0]
      if (snapX) left += snapX.delta
      if (snapY) top += snapY.delta
      // Mai oltre i bordi della tavola (che taglia ciò che sborda): l'elemento resta sempre visibile.
      const clamped = clampBox(left, top, w, h, parent.clientWidth, parent.clientHeight)
      left = clamped.left
      top = clamped.top
      setGuides({ x: snapX ? [parentRect.left + snapX.gx] : [], y: snapY ? [parentRect.top + snapY.gy] : [] })
      current.current = { ...current.origin, left, top }
      node.style.left = `${left}px`
      node.style.top = `${top}px`
      return
    }
    // Ridimensionamento.
    const { handle, origin } = current
    const box = { ...origin }
    if (handle.includes('e')) box.width = Math.max(8, origin.width + dx)
    if (handle.includes('s')) box.height = Math.max(8, origin.height + dy)
    if (handle.includes('w')) {
      box.width = Math.max(8, origin.width - dx)
      box.left = origin.left + (origin.width - box.width)
    }
    if (handle.includes('n')) {
      box.height = Math.max(8, origin.height - dy)
      box.top = origin.top + (origin.height - box.height)
    }
    if (event.shiftKey && origin.height > 0) box.height = Math.round((box.width * origin.height) / origin.width)
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
    setGuides({ x: [], y: [] })
    setIndicator(null)
    if (!current) return
    if (current.kind === 'free-move') void setFreeBox({ left: current.current.left, top: current.current.top })
    else if (current.kind === 'free-resize') {
      const { left, top, width, height } = current.current
      if (current.free) void setFreeBox({ left, top, width, height })
      else void setStyles({ width: `${Math.round(width)}px`, height: handleChangesHeight(current.handle) ? `${Math.round(height)}px` : null })
    } else if (current.kind === 'flow' && current.target) {
      // Si sposta l'elemento trascinato (non la selezione, che nel frattempo può essere cambiata).
      const target = current.target
      if ('freeIn' in target) void moveNode(current.id, target.freeIn, 'inside-end', { left: target.x, top: target.y, width: current.size.width })
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
    const placement = dropPlacement(x, y, { alt: event.altKey })
    if (!placement) return
    const target = placement.target
    // Una pagina intera va sempre in fondo alla pagina, anche se la si lascia sopra una tavola libera.
    if (blockId.startsWith('pagina-') && page) void insertBlock(blockId, endOfBody(page))
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
    } else if (event.key === 'Escape' && selected?.parent != null) {
      select(page!.elements[selected.parent]!)
    } else if (event.key === 'Enter' && selected?.leafText) {
      event.preventDefault()
      startEditing(selected)
    } else if (event.key.startsWith('Arrow') && selected && isFreeElement(page!, selected.id)) {
      event.preventDefault()
      const node = elementNode(selected.id)
      if (!node) return
      const step = event.shiftKey ? 10 : 1
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
      const parent = node.parentElement!
      const box = clampBox(node.offsetLeft + dx, node.offsetTop + dy, node.offsetWidth, node.offsetHeight, parent.clientWidth, parent.clientHeight)
      void setFreeBox(box)
    }
  }

  const onContextMenu = (event: React.MouseEvent) => {
    const { x, y } = toDoc(event)
    const id = idAt(x, y)
    const element = id !== null ? page?.elements[id] : null
    if (!element) return
    select(element)
    const parent = element.parent !== null ? page!.elements[element.parent] : null
    const free = isFreeElement(page!, element.id)
    showContextMenu(event, [
      ...(element.leafText ? [{ label: t('designer.editText'), run: () => startEditing(element) }] : []),
      { label: t('designer.duplicate'), run: () => void duplicateSelected() },
      ...(parent && parent.tag !== 'html' ? [{ label: t('designer.selectParent'), run: () => select(parent) }] : []),
      'separator' as const,
      { label: t('designer.copyStyle'), run: () => copyStyleWithNotice(element) },
      ...(useDesigner.getState().styleClipboard > 0 ? [{ label: t('designer.pasteStyle'), run: () => void pasteStyle() }] : []),
      ...(free
        ? [
            { label: t('designer.bringFront'), run: () => void setStyles({ 'z-index': '10' }) },
            { label: t('designer.sendBack'), run: () => void setStyles({ 'z-index': '0' }) },
            { label: t('designer.moveOutOfCanvas'), run: () => void moveOutOfFreeCanvas(element.id) }
          ]
        : []),
      'separator' as const,
      { label: t('designer.delete'), danger: true, run: () => void removeSelected() }
    ])
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

  return (
    <div className="designer-host" ref={host}>
      <div className="designer-stage" style={{ width, height, transform: `scale(${scale})` }}>
        <iframe ref={iframe} title={t('designer.canvasTitle')} sandbox="allow-same-origin" className="designer-frame" data-testid="designer-frame" />
        <div
          ref={overlay}
          className="designer-overlay"
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={cancelDrag}
          onPointerLeave={() => !drag.current && useDesigner.getState().setHover(null)}
          onDoubleClick={() => selected?.leafText && startEditing(selected)}
          onDragOver={onDragOver}
          onDragLeave={() => setIndicator(null)}
          onDrop={onDrop}
          onKeyDown={onKeyDown}
          onContextMenu={onContextMenu}
          onWheel={(event) => {
            const scroller = iframe.current?.contentDocument?.scrollingElement
            if (scroller) {
              scroller.scrollTop += event.deltaY
              scroller.scrollLeft += event.deltaX
            }
            // La pagina è scorsa sotto il puntatore: il bersaglio va ricalcolato subito.
            refreshFlow()
          }}
          data-testid="designer-overlay"
        >
          {hoverRect && <div className="dz-hover" style={boxStyle(hoverRect)} />}
          {selectedRect && selected && (
            <div className={`dz-selected${selectedFree ? ' free' : ''}`} style={boxStyle(selectedRect)} data-testid="designer-selection">
              <span className="dz-label">
                {selected.tag}
                {selected.attrs['id'] ? `#${selected.attrs['id']}` : ''}
                {selectedFree ? ` · ${t('designer.free')}` : ''}
              </span>
              {resizable && (selectedFree ? HANDLES : ['e', 's', 'se']).map((h) => <span key={h} className={`dz-handle h-${h}`} data-handle={h} />)}
            </div>
          )}
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
              // Il canvas è scalato: l'etichetta compensa per restare leggibile.
              style={{ left: Math.max(0, indicator.parent?.left ?? 0), top: Math.max(0, (indicator.parent?.top ?? 0) - 22 / scale), fontSize: 12 / scale, lineHeight: `${16 / scale}px`, padding: `${2 / scale}px ${8 / scale}px` }}
              data-testid="designer-drop-label"
            >
              {indicator.label}
            </div>
          )}
          {guides.x.map((gx) => (
            <div key={`x${gx}`} className="dz-guide v" style={{ left: gx }} />
          ))}
          {guides.y.map((gy) => (
            <div key={`y${gy}`} className="dz-guide h" style={{ top: gy }} />
          ))}
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
    </div>
  )
}

function handleChangesHeight(handle: string): boolean {
  return handle.includes('s') || handle.includes('n')
}

function boxStyle(rect: Rect): React.CSSProperties {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

export { keyOf }
