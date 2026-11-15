// Posizione dei menu contestuali e dei loro sottomenu (1.6, come in Easey DB): sempre dentro la finestra. Il sottomenu si apre a
// destra della voce che lo apre; se non ci sta, a sinistra; se non ci sta nemmeno lì, dal lato con più spazio,
// spostato quanto basta. Tastiera: la voce successiva/precedente che si può scegliere (le spente si saltano).
// Puro: niente DOM.

export interface MenuPoint {
  x: number
  y: number
}

export interface MenuSize {
  width: number
  height: number
}

export interface MenuRect extends MenuPoint, MenuSize {}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

/** Menu sotto il mouse (o accanto alla riga, da tastiera): spostato a sinistra/in alto se uscirebbe dalla finestra. */
export function placeMenu(at: MenuPoint, size: MenuSize, viewport: MenuSize, margin = 4): MenuPoint {
  return {
    x: clamp(at.x, margin, Math.max(margin, viewport.width - size.width - margin)),
    y: clamp(at.y, margin, Math.max(margin, viewport.height - size.height - margin))
  }
}

/**
 * Sottomenu accanto alla voce `parent` (rettangolo della voce nel menu padre): a destra se ci sta, altrimenti a
 * sinistra; la cima allineata alla voce, alzata se il sottomenu uscirebbe in basso.
 */
export function placeSubmenu(parent: MenuRect, size: MenuSize, viewport: MenuSize, margin = 4): MenuPoint & { side: 'right' | 'left' } {
  const overlap = 2
  const right = parent.x + parent.width - overlap
  const left = parent.x - size.width + overlap
  let side: 'right' | 'left'
  let x: number
  if (right + size.width + margin <= viewport.width) {
    side = 'right'
    x = right
  } else if (left >= margin) {
    side = 'left'
    x = left
  } else {
    // Non ci sta da nessuna parte: dal lato con più spazio, dentro la finestra (coprendo un po' il padre).
    side = viewport.width - (parent.x + parent.width) >= parent.x ? 'right' : 'left'
    x = clamp(side === 'right' ? right : left, margin, Math.max(margin, viewport.width - size.width - margin))
  }
  const y = clamp(parent.y - 4, margin, Math.max(margin, viewport.height - size.height - margin))
  return { x, y, side }
}

/**
 * Indice della prossima voce scelta con le frecce (`step` = 1 giù, -1 su), ciclico; le voci con `enabled: false`
 * (titoli, separatori, spente) si saltano. `from` = -1 parte dall'inizio (o dalla fine con step -1). -1 = nessuna.
 */
export function nextMenuIndex(items: { enabled: boolean }[], from: number, step: 1 | -1): number {
  const n = items.length
  if (n === 0) return -1
  let index = from
  for (let i = 0; i < n; i++) {
    index = index < 0 ? (step === 1 ? 0 : n - 1) : (index + step + n) % n
    if (items[index]!.enabled) return index
  }
  return -1
}
