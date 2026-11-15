// Dove si apre un pannello «del centro» (file, designer, diagrammi, differenze di Git…). Logica pura, usata
// da src/renderer/workbench/layout.ts. Regola: MAI in una colonna laterale (Esplora a sinistra, anteprima a
// destra, console in basso), anche se è il gruppo attivo perché l'utente ci ha appena cliccato.

export interface SideGroups {
  left?: string
  right?: string
  bottom?: string
}

/** Il gruppo è una delle aree laterali? */
export function isSideGroup(groupId: string, sides: SideGroups): boolean {
  return groupId === sides.left || groupId === sides.right || groupId === sides.bottom
}

/**
 * Il gruppo del centro fra quelli aperti: quello ricordato se esiste ancora e non è laterale, altrimenti
 * l'attivo se non è laterale, altrimenti il primo non laterale; null = non c'è, va creato.
 */
export function chooseCenterGroup(groups: readonly string[], sides: SideGroups, remembered?: string, active?: string): string | null {
  const center = groups.filter((id) => !isSideGroup(id, sides))
  if (remembered && center.includes(remembered)) return remembered
  if (active && center.includes(active)) return active
  return center[0] ?? null
}

/**
 * Dove creare il gruppo del centro quando manca (es. chiusa la scheda Benvenuto): sopra la console, a
 * sinistra dell'anteprima o a destra dell'Esplora, nell'ordine; null = finestra vuota, va dove vuole dockview.
 */
export function newCenterPosition(sides: SideGroups): { referenceGroup: string; direction: 'above' | 'left' | 'right' } | null {
  if (sides.bottom) return { referenceGroup: sides.bottom, direction: 'above' }
  if (sides.right) return { referenceGroup: sides.right, direction: 'left' }
  if (sides.left) return { referenceGroup: sides.left, direction: 'right' }
  return null
}
