// <aside> a destra della griglia dei pannelli: maniglia di ridimensionamento sul bordo sinistro
// (trascinamento, frecce, doppio clic per espandere/ridurre) e pulsante per riaprirlo quando è chiuso.
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { dragSideWidth, effectiveSideWidth, keySideWidth, maxSideWidth, SIDE_MIN_WIDTH } from '@shared/ai/side-panel'
import { sidePanelRegistration, useSidePanel } from './side-panel'
import { t } from '../i18n'

function useWindowWidth(): number {
  const [width, setWidth] = useState(window.innerWidth)
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}

export function SidePanelHost() {
  const registration = sidePanelRegistration()
  const open = useSidePanel((s) => s.open)
  const chosenWidth = useSidePanel((s) => s.width)
  const expanded = useSidePanel((s) => s.expanded)
  const state = { open, width: chosenWidth, expanded }
  const setOpen = useSidePanel((s) => s.setOpen)
  const setWidth = useSidePanel((s) => s.setWidth)
  const toggleExpanded = useSidePanel((s) => s.toggleExpanded)
  const windowWidth = useWindowWidth()
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const drag = useRef<{ x: number; width: number; pointer: number } | null>(null)

  if (!registration) return null
  if (!state.open) {
    return (
      <button className="side-reopen" onClick={() => setOpen(true, true)} title={registration.reopenTitle} aria-label={registration.reopenTitle} data-testid="side-reopen">
        {registration.reopenLabel}
      </button>
    )
  }

  const width = dragWidth ?? effectiveSideWidth(state, windowWidth)
  const Content = registration.component

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, width, pointer: event.pointerId }
    document.body.classList.add('side-resizing')
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointer !== event.pointerId) return
    setDragWidth(dragSideWidth(drag.current.width, drag.current.x, event.clientX, window.innerWidth))
  }
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointer !== event.pointerId) return
    const moved = event.clientX !== drag.current.x
    drag.current = null
    document.body.classList.remove('side-resizing')
    if (moved) setWidth(width)
    setDragWidth(null)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      toggleExpanded()
      return
    }
    const next = keySideWidth(width, event.key, window.innerWidth, event.shiftKey)
    if (next === null) return
    event.preventDefault()
    setWidth(next)
  }

  return (
    <aside className="side-panel" role="complementary" aria-label={registration.title} style={{ width }} data-testid="side-panel" data-expanded={state.expanded ? 'true' : 'false'}>
      <div
        className="side-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label={t('side.resize')}
        aria-valuenow={width}
        aria-valuemin={SIDE_MIN_WIDTH}
        aria-valuemax={maxSideWidth(windowWidth)}
        tabIndex={0}
        title={t('side.resizeHint')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={toggleExpanded}
        onKeyDown={onKeyDown}
        data-testid="side-resize"
      />
      <div className="side-content">
        <Content />
      </div>
    </aside>
  )
}
