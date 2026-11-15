// Menu contestuale (tasto destro) posizionato sotto il mouse, con i sottomenu (1.6, come in Easey DB): una voce con `items` apre un
// altro menu accanto (passando col mouse, con → o Invio); frecce ↑↓, Invio, Esc e ← da tastiera. Menu e sottomenu
// restano sempre dentro la finestra (posizioni in @shared/menu-position).
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { create } from 'zustand'
import { ChevronRight } from 'lucide-react'
import { nextMenuIndex, placeMenu, placeSubmenu } from '@shared/menu-position'

interface MenuCommon {
  label: string
  icon?: ReactNode
  detail?: string
  title?: string
  testId?: string
  /** Voce spenta: `title` dice perché (regola delle convenzioni: un pulsante spento dice perché). */
  disabled?: boolean
}

/**
 * Voce del menu. `detail` = testo in grigio a destra (es. il termine tecnico), `checked` = voce scelta,
 * `heading` = titolo di un gruppo (non si clicca), `testId` per i collaudi. Con `items` la voce apre un sottomenu.
 */
export type MenuItem =
  | (MenuCommon & {
      danger?: boolean
      checked?: boolean
      run: () => void
    })
  | (MenuCommon & { items: MenuItem[] })
  | { heading: string }
  | 'separator'

type ActionItem = Extract<MenuItem, { run: () => void }>
type SubmenuItem = Extract<MenuItem, { items: MenuItem[] }>

const isSubmenu = (item: MenuItem): item is SubmenuItem => typeof item === 'object' && 'items' in item
const isAction = (item: MenuItem): item is ActionItem => typeof item === 'object' && 'run' in item
const selectable = (item: MenuItem) => (isSubmenu(item) || isAction(item)) && !item.disabled

interface MenuState {
  menu: { x: number; y: number; items: MenuItem[]; keyboard: boolean } | null
  show: (x: number, y: number, items: MenuItem[], keyboard?: boolean) => void
  hide: () => void
}

const useMenu = create<MenuState>((set) => ({
  menu: null,
  show: (x, y, items, keyboard = false) => set({ menu: { x, y, items, keyboard } }),
  hide: () => set({ menu: null })
}))

export function showContextMenu(event: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation: () => void }, items: MenuItem[]): void {
  event.preventDefault()
  event.stopPropagation()
  useMenu.getState().show(event.clientX, event.clientY, items)
}

/** Menu aperto da tastiera (Maiusc+F10, tasto Menu) o da un comando: alle coordinate date, con la prima voce attiva. */
export function showContextMenuAt(x: number, y: number, items: MenuItem[], keyboard = true): void {
  useMenu.getState().show(x, y, items, keyboard)
}

/** Tasto Menu o Maiusc+F10: il menu contestuale da tastiera (come il tasto destro). */
export function isContextMenuKey(event: { key: string; shiftKey: boolean }): boolean {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)
}

/** Un livello aperto: le voci, la voce attiva (tastiera/mouse) e la posizione. */
interface Level {
  items: MenuItem[]
  active: number
}

export function ContextMenuHost() {
  const menu = useMenu((s) => s.menu)
  const hide = useMenu((s) => s.hide)
  const host = useRef<HTMLDivElement>(null)
  // levels[0] = menu principale; levels[i+1] = sottomenu aperto dalla voce levels[i].active.
  const [levels, setLevels] = useState<Level[]>([])
  const [positions, setPositions] = useState<{ x: number; y: number }[]>([])
  const levelsRef = useRef(levels)
  levelsRef.current = levels

  useEffect(() => {
    if (!menu) {
      setLevels([])
      setPositions([])
      return
    }
    const start = menu.keyboard ? nextMenuIndex(menu.items.map((i) => ({ enabled: selectable(i) })), -1, 1) : -1
    setLevels([{ items: menu.items, active: start }])
    setPositions([{ x: menu.x, y: menu.y }])
  }, [menu])

  // Posizioni dentro la finestra: il menu principale sotto il punto, ogni sottomenu accanto alla sua voce.
  useLayoutEffect(() => {
    if (!menu || !host.current) return
    const boxes = [...host.current.querySelectorAll<HTMLElement>(':scope > .context-menu')]
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const next: { x: number; y: number }[] = []
    boxes.forEach((box, depth) => {
      const size = { width: box.offsetWidth, height: box.offsetHeight }
      if (depth === 0) {
        next.push(placeMenu({ x: menu.x, y: menu.y }, size, viewport))
        return
      }
      const parentBox = boxes[depth - 1]!
      const trigger = parentBox.querySelector<HTMLElement>(`[data-menu-index="${levels[depth - 1]?.active}"]`)
      const rect = trigger?.getBoundingClientRect()
      const parent = rect ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : { x: next[depth - 1]!.x, y: next[depth - 1]!.y, width: parentBox.offsetWidth, height: 20 }
      // La voce si misura dove sta ora: se il padre si è appena spostato, si corregge con la differenza.
      const shiftX = rect ? next[depth - 1]!.x - parentBox.getBoundingClientRect().left : 0
      const shiftY = rect ? next[depth - 1]!.y - parentBox.getBoundingClientRect().top : 0
      const place = placeSubmenu({ ...parent, x: parent.x + shiftX, y: parent.y + shiftY }, size, viewport)
      next.push({ x: place.x, y: place.y })
    })
    if (next.length && next.some((p, i) => p.x !== positions[i]?.x || p.y !== positions[i]?.y || positions.length !== next.length)) setPositions(next)
  }, [menu, levels]) // eslint-disable-line react-hooks/exhaustive-deps

  // La voce attiva prende il fuoco (tastiera e lettori di schermo); il fuoco di prima torna alla chiusura.
  useEffect(() => {
    if (!menu || !host.current) return
    const depth = levels.length - 1
    const level = levels[depth]
    if (!level || level.active < 0) return
    const element = host.current.querySelectorAll<HTMLElement>(':scope > .context-menu')[depth]?.querySelector<HTMLElement>(`[data-menu-index="${level.active}"]`)
    if (element && document.activeElement !== element) element.focus({ preventScroll: true })
  }, [menu, levels])

  useEffect(() => {
    if (!menu) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onMouseDown = (event: MouseEvent) => {
      if (host.current?.contains(event.target as Node)) return
      hide()
    }
    const onKey = (event: KeyboardEvent) => {
      const current = levelsRef.current
      const depth = current.length - 1
      const level = current[depth]
      if (!level) return
      const enabled = level.items.map((i) => ({ enabled: selectable(i) }))
      const handled = () => {
        event.preventDefault()
        event.stopPropagation()
      }
      switch (event.key) {
        case 'Escape':
          handled()
          if (depth > 0) setLevels(current.slice(0, depth))
          else hide()
          return
        case 'ArrowDown':
        case 'ArrowUp': {
          handled()
          const active = nextMenuIndex(enabled, level.active, event.key === 'ArrowDown' ? 1 : -1)
          setLevels([...current.slice(0, depth), { ...level, active }])
          return
        }
        case 'Home':
        case 'End': {
          handled()
          const active = nextMenuIndex(enabled, -1, event.key === 'Home' ? 1 : -1)
          setLevels([...current.slice(0, depth), { ...level, active }])
          return
        }
        case 'ArrowLeft':
          if (depth > 0) {
            handled()
            setLevels(current.slice(0, depth))
          }
          return
        case 'ArrowRight':
        case 'Enter':
        case ' ': {
          const item = level.items[level.active]
          if (!item) {
            if (event.key !== 'ArrowRight') handled()
            return
          }
          if (isSubmenu(item) && !item.disabled) {
            handled()
            const first = nextMenuIndex(item.items.map((i) => ({ enabled: selectable(i) })), -1, 1)
            setLevels([...current, { items: item.items, active: first }])
            return
          }
          if (event.key !== 'ArrowRight' && isAction(item)) {
            handled()
            if (item.disabled) return
            hide()
            item.run()
          }
          return
        }
        case 'Tab':
          handled()
          return
      }
    }
    window.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', hide)
    return () => {
      window.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', hide)
      // Il fuoco torna dove era (riga dell'albero, editor…) se il menu lo aveva preso.
      // Solo se nessun altro l'ha preso nel frattempo (un dialogo aperto dalla voce scelta tiene il suo).
      const now = document.activeElement
      const free = !now || now === document.body || !!host.current?.contains(now)
      if (previous && free && document.contains(previous)) previous.focus({ preventScroll: true })
    }
  }, [menu, hide])

  if (!menu || levels.length === 0) return null

  const openSubmenu = (depth: number, index: number, item: SubmenuItem, focusFirst: boolean) => {
    const first = focusFirst ? nextMenuIndex(item.items.map((i) => ({ enabled: selectable(i) })), -1, 1) : -1
    setLevels((current) => [...current.slice(0, depth), { ...current[depth]!, active: index }, { items: item.items, active: first }])
  }
  const activate = (depth: number, index: number) =>
    setLevels((current) => (current[depth]?.active === index && current.length === depth + 1 ? current : [...current.slice(0, depth), { ...current[depth]!, active: index }]))

  return (
    <div ref={host} className="context-menu-host" style={{ display: 'contents' }}>
      {levels.map((level, depth) => (
        <div
          key={depth}
          className={`context-menu${depth > 0 ? ' context-submenu' : ''}`}
          style={{ left: positions[depth]?.x ?? -9999, top: positions[depth]?.y ?? -9999 }}
          role="menu"
          data-menu-depth={depth}
        >
          {level.items.map((item, index) =>
            item === 'separator' ? (
              <hr key={index} />
            ) : 'heading' in item ? (
              <div key={index} className="context-menu-heading" role="presentation">
                {item.heading}
              </div>
            ) : isSubmenu(item) ? (
              <button
                key={index}
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={levels[depth + 1] !== undefined && level.active === index}
                className={['submenu', level.active === index ? 'active' : '', item.disabled ? 'disabled' : ''].filter(Boolean).join(' ')}
                title={item.title}
                data-testid={item.testId}
                data-menu-index={index}
                aria-disabled={item.disabled || undefined}
                tabIndex={-1}
                onMouseEnter={() => !item.disabled && openSubmenu(depth, index, item, false)}
                onClick={() => !item.disabled && openSubmenu(depth, index, item, true)}
              >
                {item.icon}
                {item.label}
                {item.detail && <span className="context-menu-detail">{item.detail}</span>}
                <ChevronRight size={13} className="context-menu-chevron" />
              </button>
            ) : (
              <button
                key={index}
                role="menuitem"
                className={[item.danger ? 'danger' : '', item.checked ? 'checked' : '', item.disabled ? 'disabled' : '', level.active === index ? 'active' : ''].filter(Boolean).join(' ') || undefined}
                title={item.title}
                data-testid={item.testId}
                data-menu-index={index}
                aria-disabled={item.disabled || undefined}
                tabIndex={-1}
                onMouseEnter={() => activate(depth, index)}
                onClick={() => {
                  // Una voce spenta resta cliccabile per leggere il perché nel suggerimento, ma non fa niente.
                  if (item.disabled) return
                  hide()
                  item.run()
                }}
              >
                {item.icon}
                {item.label}
                {item.detail && <span className="context-menu-detail">{item.detail}</span>}
              </button>
            )
          )}
        </div>
      ))}
    </div>
  )
}
