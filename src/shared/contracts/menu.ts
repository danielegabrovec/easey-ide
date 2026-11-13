// Menu dell'applicazione. Lo descrive il renderer (testi tradotti e scorciatoie presi dal registro dei
// comandi: una sola fonte); il main lo traduce nel menu nativo e rimanda i clic come `menu:command`.

/** Azioni native di Electron ammesse nel menu (whitelist controllata dal main). */
export const MENU_ROLES = ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll', 'quit', 'togglefullscreen', 'toggleDevTools'] as const
export type MenuRole = (typeof MENU_ROLES)[number]

export type MenuEntry =
  | { kind: 'command'; command: string; label: string; accelerator?: string }
  | { kind: 'role'; role: MenuRole; label: string; accelerator?: string }
  | { kind: 'separator' }

export interface MenuSection {
  label: string
  items: MenuEntry[]
}

/** Scorciatoie che il menu nativo sa mostrare (niente accordi tipo "Ctrl+K Ctrl+C"). */
export function isMenuAccelerator(value: string | undefined): value is string {
  return !!value && /^((Ctrl|Shift|Alt)\+)*([A-Za-z0-9]|F\d{1,2}|[`=\-,.;'/\\[\]]|Enter|Tab|Space|Delete|Backspace|Escape|Up|Down|Left|Right|Home|End|PageUp|PageDown)$/.test(value)
}
