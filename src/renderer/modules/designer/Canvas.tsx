// Canvas del designer: la pagina in un iframe senza script (stessa origine, quindi leggibile) e, sopra,
// un livello che gestisce tutte le interazioni. Nelle "tavole libere" gli elementi si spostano e si
// ridimensionano a mano libera con guide magnetiche (stile Canva); altrove si riordinano a flusso (stile Wix).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FREE_CANVAS_CLASS, hasClass, isFreeElement, type ElementInfo } from '@shared/designer/html-model'
import type { InsertPosition } from '@shared/designer/html-edit'
import { showContextMenu } from '../../ui/ContextMenu'
import { t } from '../../i18n'
import { notify } from '../../workbench/notifications'
import { copyStyle, duplicateSelected, endOfBody, insertBlock, moveSelectedTo, pasteStyle, removeSelected, setElementText, setFreeBox, setStyles } from './actions'
import { redo, undo } from './document'
import { keyOf, resolveSelection, useDesigner } from './designer-store'
import { registerFrame } from './frame-access'

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

type Drag =
  | { kind: 'pending'; startX: number; startY: number; id: number }
  | { kind: 'free-move'; startX: number; startY: number; id: number; origin: Rect; current: Rect }
  | { kind: 'free-resize'; startX: number; startY: number; id: number; handle: string; origin: Rect; current: Rect; free: boolean }
  | { kind: 'flow'; id: number; target: { id: number; where: InsertPosition } | null }

interface Indicator {
  rect: Rect
  where: InsertPosition | 'free'
}

const CONTAINERS = new Set(['body', 'main', 'section', 'div', 'article', 'header', 'footer', 'nav', 'form', 'ul', 'ol', 'aside', 'figure', 'blockquote'])
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const SNAP = 6

/**
 * Carica la pagina nel canvas con `srcdoc` (niente document.write né metodi della finestra: in un frame
 * senza script Chrome li segnala come "script bloccati"). Lo scorrimento si conserva via proprietà DOM.
 */
export function writeCanvas(iframe: HTMLIFrameElement | null, html: string): void {
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

export function Canvas({ html: canvasHtml, width, onReady }: { html: string; width: number; onReady?: () => void }) {
  const page = useDesigner((s) => s.html)
  const selection = useDesigner((s) => s.selection)
  const hoverId = useDesigner((s) => s.hoverId)
  const iframe = useRef<HTMLIFrameElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
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

  // Scrive la pagina nell'iframe a ogni cambiamento del sorgente.
  useEffect(() => {
    writeCanvas(iframe.current, canvasHtml)
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

  const dropPlacement = (x: number, y: number, exclude?: number): { indicator: Indicator; target: { id: number; where: InsertPosition } | { freeIn: number; x: number; y: number } } | null => {
    const id = idAt(x, y, exclude)
    if (id === null || !page) return null
    const tavola = tavolaFor(id)
    if (tavola !== null && exclude === undefined) {
      const rect = rectOf(elementNode(tavola))!
      return { indicator: { rect, where: 'free' }, target: { freeIn: tavola, x: x - rect.left, y: y - rect.top } }
    }
    const info = page.elements[id]!
    const rect = rectOf(elementNode(id))
    if (!rect) return null
    const relative = rect.height ? (y - rect.top) / rect.height : 0.5
    let where: InsertPosition
    if (info.tag === 'body') where = 'inside-end'
    else if (CONTAINERS.has(info.tag) && relative > 0.25 && relative < 0.75 && info.endTagStart !== null) where = 'inside-end'
    else where = relative < 0.5 ? 'before' : 'after'
    return { indicator: { rect, where }, target: { id, where } }
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
      drag.current = { kind: 'pending', startX: x, startY: y, id: element.id }
      overlay.current?.setPointerCapture(event.pointerId)
    }
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const { x, y } = toDoc(event)
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
        drag.current = { kind: 'free-move', startX: current.startX, startY: current.startY, id: current.id, origin, current: origin }
      } else {
        drag.current = { kind: 'flow', id: current.id, target: null }
      }
      return
    }
    if (current.kind === 'flow') {
      const placement = dropPlacement(x, y, current.id)
      if (placement && 'id' in placement.target) {
        current.target = placement.target
        setIndicator(placement.indicator)
      }
      return
    }
    const node = elementNode(current.id)
    if (!node) return
    const dx = x - current.startX
    const dy = y - current.startY
    if (current.kind === 'free-move') {
      let left = current.origin.left + dx
      let top = current.origin.top + dy
      // Guide magnetiche: bordi e centri della tavola e degli altri elementi.
      const parent = node.parentElement!
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
      const parentRect = rectOf(parent)!
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
    overlay.current?.releasePointerCapture?.(event.pointerId)
    setGuides({ x: [], y: [] })
    setIndicator(null)
    if (!current) return
    if (current.kind === 'free-move') void setFreeBox({ left: current.current.left, top: current.current.top })
    else if (current.kind === 'free-resize') {
      const { left, top, width, height } = current.current
      if (current.free) void setFreeBox({ left, top, width, height })
      else void setStyles({ width: `${Math.round(width)}px`, height: handleChangesHeight(current.handle) ? `${Math.round(height)}px` : null })
    } else if (current.kind === 'flow' && current.target) void moveSelectedTo(current.target.id, current.target.where)
  }

  const onDragOver = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes('text/x-lab-block')) return
    event.preventDefault()
    const { x, y } = toDoc(event)
    const placement = dropPlacement(x, y)
    setIndicator(placement?.indicator ?? null)
  }

  const onDrop = (event: React.DragEvent) => {
    const blockId = event.dataTransfer.getData('text/x-lab-block')
    setIndicator(null)
    if (!blockId) return
    event.preventDefault()
    const { x, y } = toDoc(event)
    const placement = dropPlacement(x, y)
    if (!placement) return
    const target = placement.target
    // Una pagina intera va sempre in fondo alla pagina, anche se la si lascia sopra una tavola libera.
    if (blockId.startsWith('pagina-') && page) void insertBlock(blockId, endOfBody(page))
    else void insertBlock(blockId, 'freeIn' in target ? target : { targetId: target.id, where: target.where })
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (editing) return
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
      void setFreeBox({ left: node.offsetLeft + dx, top: node.offsetTop + dy })
    }
  }

  const onContextMenu = (event: React.MouseEvent) => {
    const { x, y } = toDoc(event)
    const id = idAt(x, y)
    const element = id !== null ? page?.elements[id] : null
    if (!element) return
    select(element)
    const parent = element.parent !== null ? page!.elements[element.parent] : null
    showContextMenu(event, [
      ...(element.leafText ? [{ label: t('designer.editText'), run: () => startEditing(element) }] : []),
      { label: t('designer.duplicate'), run: () => void duplicateSelected() },
      ...(parent && parent.tag !== 'html' ? [{ label: t('designer.selectParent'), run: () => select(parent) }] : []),
      'separator' as const,
      { label: t('designer.copyStyle'), run: () => copyStyleWithNotice(element) },
      ...(useDesigner.getState().styleClipboard > 0 ? [{ label: t('designer.pasteStyle'), run: () => void pasteStyle() }] : []),
      ...(isFreeElement(page!, element.id)
        ? [
            { label: t('designer.bringFront'), run: () => void setStyles({ 'z-index': '10' }) },
            { label: t('designer.sendBack'), run: () => void setStyles({ 'z-index': '0' }) }
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
  const hoverRect = hoverId !== null && hoverId !== selected?.id ? rectOf(elementNode(hoverId)) : null
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
          {indicator &&
            (indicator.where === 'before' || indicator.where === 'after' ? (
              <div className="dz-line" style={{ left: indicator.rect.left, width: indicator.rect.width, top: indicator.where === 'before' ? indicator.rect.top - 2 : indicator.rect.top + indicator.rect.height - 1 }} />
            ) : (
              <div className={`dz-inside${indicator.where === 'free' ? ' free' : ''}`} style={boxStyle(indicator.rect)} />
            ))}
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
