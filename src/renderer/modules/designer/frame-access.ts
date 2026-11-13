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

/** Porta in vista un elemento nel canvas (es. selezionato dal codice). */
export function revealElement(id: number): void {
  const node = frame?.contentDocument?.querySelector(`[data-lab-id="${id}"]`)
  node?.scrollIntoView({ block: 'nearest' })
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

/**
 * Sfondo che sta davvero dietro a un elemento: il primo antenato (o sé stesso) con un colore di sfondo
 * non trasparente. Con un gradiente o un'immagine si prende il primo colore del gradiente e `exact` è false.
 */
export function effectiveBackground(id: number | null | undefined): { color: string; exact: boolean } | null {
  if (id === null || id === undefined || !frame?.contentDocument || !frame.contentWindow) return null
  let node = frame.contentDocument.querySelector(`[data-lab-id="${id}"]`) as Element | null
  const view = frame.contentWindow
  while (node) {
    const style = view.getComputedStyle(node)
    if (style.backgroundImage && style.backgroundImage !== 'none') {
      const first = /rgba?\([^)]+\)/.exec(style.backgroundImage)?.[0]
      if (first) return { color: first, exact: false }
    }
    const color = style.backgroundColor
    if (color && !/rgba\(\d+,\s*\d+,\s*\d+,\s*0\)|transparent/.test(color)) return { color, exact: true }
    node = node.parentElement
  }
  return { color: 'rgb(255, 255, 255)', exact: true }
}

/** L'iframe del canvas (per i controlli di qualità, che misurano la pagina). */
export function canvasFrame(): HTMLIFrameElement | null {
  return frame
}
