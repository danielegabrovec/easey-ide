// "Apri con": i moduli dichiarano come aprire i file che non sono testo (es. .db → SQL Lab).
// L'editor consulta questo registro prima di aprire un file in Monaco.

export interface FileOpener {
  id: string
  matches: (path: string) => boolean
  /** Comando eseguito con { path }. */
  command: string
}

const openers: FileOpener[] = []

export function registerFileOpener(opener: FileOpener): void {
  const index = openers.findIndex((o) => o.id === opener.id)
  if (index >= 0) openers[index] = opener
  else openers.push(opener)
}

export function openerFor(path: string): FileOpener | undefined {
  return openers.find((o) => o.matches(path))
}
