// Menu dell'applicazione: la struttura e i testi (tradotti) arrivano dal renderer (`app:setMenu`),
// qui si controllano e si traducono nel menu nativo. Ogni voce invia un id di comando al renderer,
// che lo esegue col registro dei comandi del workbench (una sola fonte di verità per le azioni).
import { Menu, type MenuItemConstructorOptions } from 'electron'
import { isMenuAccelerator, MENU_ROLES, type MenuEntry, type MenuSection } from '@shared/contracts/menu'
import { broadcast } from './ipc/router'

const COMMAND_ID = /^[\w.-]{1,80}$/

function item(entry: MenuEntry): MenuItemConstructorOptions | null {
  if (!entry || typeof entry !== 'object') return null
  if (entry.kind === 'separator') return { type: 'separator' }
  const label = String(entry.label ?? '').slice(0, 120)
  // L'acceleratore è gestito dal renderer (registerAccelerator: false) per non duplicare le scorciatoie;
  // fanno eccezione gli strumenti per sviluppatori, che il renderer non conosce.
  const accelerator = isMenuAccelerator(entry.accelerator) ? entry.accelerator : undefined
  if (entry.kind === 'role') return MENU_ROLES.includes(entry.role) ? { role: entry.role, label, accelerator, registerAccelerator: entry.role === 'toggleDevTools' } : null
  if (entry.kind === 'command' && COMMAND_ID.test(String(entry.command))) {
    const command = entry.command
    return { label, accelerator, registerAccelerator: false, click: () => broadcast('menu:command', command) }
  }
  return null
}

/** Costruisce il menu nativo dalla descrizione del renderer (voci sconosciute scartate). */
export function buildMenu(sections: MenuSection[]): void {
  const template: MenuItemConstructorOptions[] = (Array.isArray(sections) ? sections : []).slice(0, 12).map((section) => ({
    label: String(section?.label ?? '').slice(0, 60),
    submenu: (Array.isArray(section?.items) ? section.items : []).slice(0, 60).map(item).filter((i): i is MenuItemConstructorOptions => i !== null)
  }))
  Menu.setApplicationMenu(template.length ? Menu.buildFromTemplate(template) : null)
}
