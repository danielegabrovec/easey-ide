// Tasto destro dell'albero dei file (1.6): quali voci, in quali gruppi e sottomenu, per un file, una cartella o lo
// spazio vuoto (la cartella principale). Puro: niente testi né comandi, solo «azioni» che il pannello Esplora
// traduce (etichetta `treeMenu.<azione>`, comando da eseguire). Le voci che non servono a quel file non compaiono;
// quelle che ci sono ma non si possono usare restano spente e dicono perché (`reason`).
import { basenameOf, extensionOf, isScriptFile, isTextFile } from './paths'

export type TreeMenuAction =
  | 'open'
  | 'openBeside'
  | 'openPreview'
  | 'openDesigner'
  | 'openImage'
  | 'openDatabase'
  | 'runTerminal'
  | 'runStep'
  | 'runSql'
  | 'aiExplain'
  | 'aiComment'
  | 'aiTests'
  | 'newFile'
  | 'newFolder'
  | 'newPage'
  | 'newBlocks'
  | 'newNodes'
  | 'newDiagram'
  | 'rename'
  | 'duplicate'
  | 'move'
  | 'copyRelative'
  | 'copyAbsolute'
  | 'copyName'
  | 'history'
  | 'reveal'
  | 'terminalHere'
  | 'expandAll'
  | 'collapseAll'
  | 'refresh'
  | 'delete'

export type TreeMenuSubmenu = 'openWith' | 'run' | 'ai' | 'new' | 'copy'
export type TreeMenuReason = 'folderDuplicate'

export type TreeMenuNode =
  | { action: TreeMenuAction; danger?: boolean; shortcut?: string; reason?: TreeMenuReason }
  | { submenu: TreeMenuSubmenu; items: TreeMenuNode[] }
  | { heading: string }
  | 'separator'

export interface TreeMenuTarget {
  /** Percorso nel progetto ('' = la cartella principale). */
  path: string
  kind: 'file' | 'dir' | 'root'
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'ico', 'bmp'])
const DATABASE_EXTENSIONS = new Set(['db', 'sqlite', 'sqlite3'])
/** File che «Esegui passo passo» sa seguire (come il modulo step-run). */
const TRACEABLE = new Set(['js', 'mjs', 'cjs', 'ts', 'mts', 'cts'])
const VISUAL_SUFFIXES = ['.blocchi.json', '.nodi.json', '.diagramma.json']

const isVisualDocument = (path: string) => VISUAL_SUFFIXES.some((suffix) => path.toLowerCase().endsWith(suffix))

/** Le voci di «Nuovo» (nella cartella del file, nella cartella stessa o nella principale). */
function newItems(): TreeMenuNode[] {
  return [{ action: 'newFile' }, { action: 'newFolder' }, 'separator', { action: 'newPage' }, { action: 'newBlocks' }, { action: 'newNodes' }, { action: 'newDiagram' }]
}

const copyMenu = (kind: TreeMenuTarget['kind']): TreeMenuNode =>
  kind === 'root' ? { action: 'copyAbsolute' } : { submenu: 'copy', items: [{ action: 'copyRelative' }, { action: 'copyAbsolute' }, { action: 'copyName' }] }

function fileMenu(path: string): TreeMenuNode[] {
  const ext = extensionOf(path)
  const openWith: TreeMenuNode[] = []
  if (ext === 'html' || ext === 'htm') openWith.push({ action: 'openPreview' }, { action: 'openDesigner' })
  if (IMAGE_EXTENSIONS.has(ext)) openWith.push({ action: 'openImage' })
  if (DATABASE_EXTENSIONS.has(ext)) openWith.push({ action: 'openDatabase' })
  const run: TreeMenuNode[] = []
  if (isScriptFile(path)) run.push({ action: 'runTerminal', shortcut: 'Ctrl+F5' })
  if (TRACEABLE.has(ext)) run.push({ action: 'runStep', shortcut: 'Ctrl+F10' })
  if (ext === 'sql') run.push({ action: 'runSql', shortcut: 'Ctrl+Shift+Invio' })
  // L'AI legge testo: niente immagini, database, documenti visuali (sono JSON, hanno il loro editor).
  const readable = isTextFile(path) && !IMAGE_EXTENSIONS.has(ext) && !DATABASE_EXTENSIONS.has(ext) && !isVisualDocument(path)

  const items: TreeMenuNode[] = [{ heading: basenameOf(path) }, { action: 'open', shortcut: 'Invio' }, { action: 'openBeside' }]
  if (openWith.length) items.push({ submenu: 'openWith', items: openWith })
  if (run.length) items.push({ submenu: 'run', items: run })
  if (readable) items.push({ submenu: 'ai', items: [{ action: 'aiExplain' }, { action: 'aiComment' }, { action: 'aiTests' }] })
  items.push(
    'separator',
    { submenu: 'new', items: newItems() },
    'separator',
    { action: 'rename', shortcut: 'F2' },
    { action: 'duplicate' },
    { action: 'move' },
    copyMenu('file'),
    'separator',
    { action: 'history' },
    { action: 'reveal' },
    { action: 'terminalHere' },
    'separator',
    { action: 'delete', danger: true, shortcut: 'Canc' }
  )
  return items
}

function folderMenu(path: string): TreeMenuNode[] {
  return [
    { heading: `${basenameOf(path)}/` },
    { submenu: 'new', items: newItems() },
    { action: 'terminalHere' },
    { action: 'expandAll' },
    { action: 'collapseAll' },
    'separator',
    { action: 'rename', shortcut: 'F2' },
    { action: 'duplicate', reason: 'folderDuplicate' },
    { action: 'move' },
    copyMenu('dir'),
    'separator',
    { action: 'reveal' },
    'separator',
    { action: 'delete', danger: true, shortcut: 'Canc' }
  ]
}

function rootMenu(): TreeMenuNode[] {
  return [...newItems(), 'separator', { action: 'terminalHere' }, { action: 'collapseAll' }, { action: 'refresh' }, 'separator', copyMenu('root'), { action: 'reveal' }]
}

export function treeMenu(target: TreeMenuTarget): TreeMenuNode[] {
  if (target.kind === 'root') return rootMenu()
  return target.kind === 'dir' ? folderMenu(target.path) : fileMenu(target.path)
}

/** Tutte le azioni di un menu (anche dentro i sottomenu), in ordine: per i collaudi e i controlli. */
export function treeMenuActions(nodes: TreeMenuNode[]): TreeMenuAction[] {
  return nodes.flatMap((node) => (node === 'separator' || 'heading' in node ? [] : 'submenu' in node ? treeMenuActions(node.items) : [node.action]))
}

/** Nome libero per la copia di un file: «pagina copia.html», poi «pagina copia 2.html»… nella stessa cartella. */
export function duplicateName(path: string, existing: Iterable<string>): string {
  const taken = new Set([...existing].map((p) => p.toLowerCase()))
  const slash = path.lastIndexOf('/')
  const dir = slash >= 0 ? path.slice(0, slash + 1) : ''
  const name = path.slice(slash + 1)
  // Le estensioni doppie dei documenti visuali (.blocchi.json) restano intere.
  const suffix = VISUAL_SUFFIXES.find((s) => name.toLowerCase().endsWith(s)) ?? (name.lastIndexOf('.') > 0 ? name.slice(name.lastIndexOf('.')) : '')
  const stem = suffix ? name.slice(0, name.length - suffix.length) : name
  for (let n = 1; ; n++) {
    const candidate = `${dir}${stem} copia${n > 1 ? ` ${n}` : ''}${suffix}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}
