// Menu contestuale (tasto destro) posizionato sotto il mouse.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { create } from 'zustand'

export type MenuItem = { label: string; icon?: ReactNode; danger?: boolean; run: () => void } | 'separator'

interface MenuState {
  menu: { x: number; y: number; items: MenuItem[] } | null
  show: (x: number, y: number, items: MenuItem[]) => void
  hide: () => void
}

const useMenu = create<MenuState>((set) => ({
  menu: null,
  show: (x, y, items) => set({ menu: { x, y, items } }),
  hide: () => set({ menu: null })
}))

export function showContextMenu(event: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation: () => void }, items: MenuItem[]): void {
  event.preventDefault()
  event.stopPropagation()
  useMenu.getState().show(event.clientX, event.clientY, items)
}

export function ContextMenuHost() {
  const menu = useMenu((s) => s.menu)
  const hide = useMenu((s) => s.hide)
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    if (!menu || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    setPosition({
      x: Math.min(menu.x, window.innerWidth - rect.width - 4),
      y: Math.min(menu.y, window.innerHeight - rect.height - 4)
    })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return
      if (event instanceof MouseEvent && ref.current?.contains(event.target as Node)) return
      hide()
    }
    window.addEventListener('mousedown', close, true)
    window.addEventListener('keydown', close, true)
    window.addEventListener('blur', hide)
    return () => {
      window.removeEventListener('mousedown', close, true)
      window.removeEventListener('keydown', close, true)
      window.removeEventListener('blur', hide)
    }
  }, [menu, hide])

  if (!menu) return null
  return (
    <div ref={ref} className="context-menu" style={{ left: position.x, top: position.y }} role="menu">
      {menu.items.map((item, index) =>
        item === 'separator' ? (
          <hr key={index} />
        ) : (
          <button
            key={index}
            role="menuitem"
            className={item.danger ? 'danger' : undefined}
            onClick={() => {
              hide()
              item.run()
            }}
          >
            {item.icon}
            {item.label}
          </button>
        )
      )}
    </div>
  )
}
