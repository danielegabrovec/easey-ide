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

/** Colore calcolato in formato #rrggbb (per il selettore di colore). */
export function toHex(color: string): string {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color)
  if (!match) return /^#[0-9a-f]{6}$/i.test(color) ? color : '#000000'
  return `#${[match[1], match[2], match[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`
}
