// Albero dei file dell'Esplora: righe visibili, movimenti da tastiera (stile VS Code) e spostamenti
// con il trascinamento. Logica pura, senza DOM.
import type { FileEntry } from './contracts/workspace'
import { basenameOf, dirnameOf, joinRelative } from './paths'

export interface TreeRow {
  path: string
  kind: 'file' | 'dir'
  depth: number
  /** Cartella che contiene la riga ('' = radice del progetto). */
  parent: string
}

/** Righe nell'ordine in cui si vedono (le cartelle chiuse nascondono il loro contenuto). */
export function visibleRows(entries: FileEntry[], expanded: Set<string>, depth = 0, parent = ''): TreeRow[] {
  const rows: TreeRow[] = []
  for (const entry of entries) {
    rows.push({ path: entry.path, kind: entry.kind, depth, parent })
    if (entry.kind === 'dir' && expanded.has(entry.path) && entry.children) rows.push(...visibleRows(entry.children, expanded, depth + 1, entry.path))
  }
  return rows
}

export type TreeKeyResult =
  | { kind: 'focus'; path: string }
  | { kind: 'expand'; path: string }
  | { kind: 'collapse'; path: string }
  | { kind: 'open'; path: string }
  | { kind: 'toggle'; path: string }
  | { kind: 'rename'; path: string }
  | { kind: 'delete'; path: string; entry: 'file' | 'dir' }
  | null

/**
 * Cosa fa un tasto sulla riga col fuoco: frecce su/giù fra le righe, destra apre la cartella (o entra
 * nel primo figlio), sinistra la chiude (o sale alla cartella che la contiene), Home/Fine, Invio apre
 * il file o apre/chiude la cartella, F2 rinomina, Canc elimina (con conferma, nel comando).
 */
export function treeKey(rows: TreeRow[], current: string | null, key: string, expanded: Set<string>): TreeKeyResult {
  if (!rows.length) return null
  const index = current === null ? -1 : rows.findIndex((r) => r.path === current)
  const row = index >= 0 ? rows[index]! : null
  switch (key) {
    case 'ArrowDown':
      return { kind: 'focus', path: rows[Math.min(rows.length - 1, index + 1)]!.path }
    case 'ArrowUp':
      return { kind: 'focus', path: rows[Math.max(0, index - 1)]!.path }
    case 'Home':
      return { kind: 'focus', path: rows[0]!.path }
    case 'End':
      return { kind: 'focus', path: rows[rows.length - 1]!.path }
    case 'ArrowRight':
      if (!row) return { kind: 'focus', path: rows[0]!.path }
      if (row.kind !== 'dir') return null
      if (!expanded.has(row.path)) return { kind: 'expand', path: row.path }
      return rows[index + 1]?.parent === row.path ? { kind: 'focus', path: rows[index + 1]!.path } : null
    case 'ArrowLeft':
      if (!row) return null
      if (row.kind === 'dir' && expanded.has(row.path)) return { kind: 'collapse', path: row.path }
      return row.parent ? { kind: 'focus', path: row.parent } : null
    case 'Enter':
      if (!row) return null
      return row.kind === 'dir' ? { kind: 'toggle', path: row.path } : { kind: 'open', path: row.path }
    case 'F2':
      return row ? { kind: 'rename', path: row.path } : null
    case 'Delete':
      return row ? { kind: 'delete', path: row.path, entry: row.kind } : null
    default:
      return null
  }
}

/** Tutte le cartelle del progetto (per «Sposta in…»). */
export function folderPaths(entries: FileEntry[]): string[] {
  const out: string[] = []
  for (const entry of entries) {
    if (entry.kind !== 'dir') continue
    out.push(entry.path)
    if (entry.children) out.push(...folderPaths(entry.children))
  }
  return out
}

/**
 * Nuovo percorso di un file o una cartella spostati nella cartella `dir` ('' = radice), oppure null se
 * lo spostamento non ha senso (stessa cartella, cartella dentro sé stessa o un suo discendente).
 */
export function moveDestination(from: string, dir: string): string | null {
  const cleanDir = dir.replace(/^\/+|\/+$/g, '')
  if (dirnameOf(from) === cleanDir) return null
  if (cleanDir === from || cleanDir.startsWith(`${from}/`)) return null
  return joinRelative(cleanDir, basenameOf(from))
}
