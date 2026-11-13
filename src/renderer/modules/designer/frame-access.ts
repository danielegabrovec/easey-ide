// Accesso in sola lettura alla pagina mostrata nel canvas (stili calcolati), per l'ispettore.
let frame: HTMLIFrameElement | null = null

export function registerFrame(element: HTMLIFrameElement | null): void {
  frame = element
}

export function computedStyle(id: number | null | undefined): CSSStyleDeclaration | null {
  if (id === null || id === undefined || !frame?.contentDocument || !frame.contentWindow) return null
  const node = frame.contentDocument.querySelector(`[data-lab-id="${id}"]`)
  return node ? frame.contentWindow.getComputedStyle(node) : null
}

/**
 * Contenitore (non il body) che si vede al centro del canvas: lì va un elemento inserito con un clic
 * nella palette senza selezione. `accepts` dice se un elemento può ricevere figli.
 */
export function visibleContainer(accepts: (id: number) => boolean): number | null {
  const d = frame?.contentDocument
  const view = frame?.contentWindow
  if (!d || !view) return null
  const x = view.innerWidth / 2
  const y = view.innerHeight / 2
  for (const node of d.elementsFromPoint(x, y)) {
    let current = (node as HTMLElement).closest?.('[data-lab-id]') as HTMLElement | null
    while (current) {
      if (current.tagName === 'BODY' || current.tagName === 'HTML') return null
      const id = Number(current.dataset['labId'])
      if (accepts(id)) return id
      current = current.parentElement?.closest('[data-lab-id]') as HTMLElement | null
    }
  }
  return null
}

/** Colore calcolato in formato #rrggbb (per il selettore di colore). */
export function toHex(color: string): string {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color)
  if (!match) return /^#[0-9a-f]{6}$/i.test(color) ? color : '#000000'
  return `#${[match[1], match[2], match[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`
}
