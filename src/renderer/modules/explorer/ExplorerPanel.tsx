// Albero dei file del progetto, con menu contestuale e azioni rapide. Come in VS Code: si sposta un
// file trascinandolo su una cartella, e si usa da tastiera (frecce, Invio, F2, Canc).
// Le regole di tastiera e di spostamento sono in @shared/file-tree (pure e testate).
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, FilePlus2, FolderPlus, FolderOpen, RefreshCw, ChevronsDownUp, Folder } from 'lucide-react'
import type { FileEntry } from '@shared/contracts/workspace'
import { treeKey, visibleRows } from '@shared/file-tree'
import { dirnameOf, extensionOf, isScriptFile } from '@shared/paths'
import { executeCommand } from '../../workbench/commands'
import { useWorkbench } from '../../workbench/store'
import { showContextMenu } from '../../ui/ContextMenu'
import { t } from '../../i18n'
import { FileIcon } from './FileIcon'
import { refreshTree } from './project'

const storageKey = (root: string) => `explorer.expanded:${root}`
const PATH_MIME = 'text/x-easey-path'

function loadExpanded(root: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(root))
    return new Set(raw ? (JSON.parse(raw) as string[]) : ['src'])
  } catch {
    return new Set(['src'])
  }
}

function saveExpanded(root: string, expanded: Set<string>): void {
  try {
    localStorage.setItem(storageKey(root), JSON.stringify([...expanded]))
  } catch {
    /* archiviazione non disponibile */
  }
}

interface TreeContext {
  expanded: Set<string>
  toggle: (path: string) => void
  activeFile: string | null
  focused: string | null
  setFocused: (path: string) => void
  dropDir: string | null
  setDropDir: (dir: string | null) => void
}

/** Cartella che riceve un file lasciato sopra una riga: la cartella stessa, o quella che contiene il file. */
const dropDirOf = (entry: FileEntry) => (entry.kind === 'dir' ? entry.path : dirnameOf(entry.path))

function TreeNode({ entry, depth, context }: { entry: FileEntry; depth: number; context: TreeContext }) {
  const { expanded, toggle, activeFile, focused, setFocused, dropDir, setDropDir } = context
  const isDir = entry.kind === 'dir'
  const open = isDir && expanded.has(entry.path)

  const onContext = (event: React.MouseEvent) => {
    const parent = isDir ? entry.path : entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : ''
    const items: Parameters<typeof showContextMenu>[1] = []
    if (!isDir) items.push({ label: t('explorer.open'), run: () => executeCommand('editor.open', { path: entry.path }) })
    if (!isDir && ['html', 'htm'].includes(extensionOf(entry.path))) items.push({ label: t('explorer.openPreview'), run: () => executeCommand('run.preview', { entry: entry.path }) }, { label: t('explorer.openDesigner'), run: () => executeCommand('designer.open', { path: entry.path }) })
    if (!isDir && isScriptFile(entry.path)) items.push({ label: t('explorer.runInTerminal'), run: () => executeCommand('run.fileInTerminal', { path: entry.path }) })
    if (!isDir) items.push({ label: t('explorer.history'), run: () => executeCommand('editor.history', { path: entry.path }) })
    if (items.length) items.push('separator')
    items.push(
      { label: t('explorer.newFile'), run: () => executeCommand('explorer.newFile', { dir: parent }) },
      { label: t('explorer.newFolder'), run: () => executeCommand('explorer.newFolder', { dir: parent }) },
      { label: t('visual.newBlocks'), run: () => executeCommand('visual.newBlocks') },
      { label: t('visual.newNodes'), run: () => executeCommand('visual.newNodes') },
      { label: t('diagram.newTitle'), run: () => executeCommand('diagram.new') },
      'separator',
      { label: `${t('explorer.rename')} (F2)`, run: () => executeCommand('explorer.rename', { path: entry.path }) },
      { label: t('explorer.move'), run: () => executeCommand('explorer.move', { path: entry.path }) },
      { label: t('explorer.copyPath'), run: () => executeCommand('explorer.copyPath', { path: entry.path }) },
      { label: t('explorer.reveal'), run: () => executeCommand('explorer.reveal', { path: entry.path }) },
      'separator',
      { label: `${t('explorer.delete')} (Canc)`, danger: true, run: () => executeCommand('explorer.delete', { path: entry.path, kind: entry.kind }) }
    )
    showContextMenu(event, items)
  }

  return (
    <>
      <div
        className={`tree-row${!isDir && activeFile === entry.path ? ' active' : ''}${isDir && dropDir === entry.path ? ' drop-into' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => {
          setFocused(entry.path)
          if (isDir) toggle(entry.path)
          else void executeCommand('editor.open', { path: entry.path })
        }}
        onContextMenu={(event) => {
          setFocused(entry.path)
          onContext(event)
        }}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(PATH_MIME, entry.path)
          event.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(PATH_MIME)) return
          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = 'move'
          if (dropDir !== dropDirOf(entry)) setDropDir(dropDirOf(entry))
        }}
        onDrop={(event) => {
          const from = event.dataTransfer.getData(PATH_MIME)
          setDropDir(null)
          if (!from) return
          event.preventDefault()
          event.stopPropagation()
          // La cartella che lo riceve si apre: il file spostato resta in vista.
          if (isDir && !open && from !== entry.path) toggle(entry.path)
          void executeCommand('explorer.move', { path: from, dir: dropDirOf(entry) })
        }}
        onDragEnd={() => setDropDir(null)}
        title={entry.path}
        data-path={entry.path}
        role="treeitem"
        aria-level={depth + 1}
        aria-selected={focused === entry.path}
        aria-expanded={isDir ? open : undefined}
        tabIndex={focused === entry.path ? 0 : -1}
      >
        {isDir ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span style={{ width: 14, flexShrink: 0 }} />}
        {isDir ? <Folder size={14} color="var(--text-muted)" /> : <FileIcon path={entry.path} />}
        <span className="tree-name">{entry.name}</span>
      </div>
      {open && entry.children?.map((child) => <TreeNode key={child.path} entry={child} depth={depth + 1} context={context} />)}
    </>
  )
}

export function ExplorerPanel() {
  const project = useWorkbench((s) => s.project)
  const tree = useWorkbench((s) => s.tree)
  const activeFile = useWorkbench((s) => s.activeFile)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [focused, setFocused] = useState<string | null>(null)
  const [dropDir, setDropDir] = useState<string | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)
  const rows = useMemo(() => visibleRows(tree, expanded), [tree, expanded])

  useEffect(() => {
    if (project) setExpanded(loadExpanded(project.root))
  }, [project?.root])

  // Quando si apre un file in una sottocartella, le cartelle che lo contengono si espandono.
  useEffect(() => {
    if (!activeFile || !activeFile.includes('/') || !project) return
    const parts = activeFile.split('/').slice(0, -1)
    setExpanded((current) => {
      const next = new Set(current)
      let changed = false
      parts.forEach((_, index) => {
        const dir = parts.slice(0, index + 1).join('/')
        if (!next.has(dir)) {
          next.add(dir)
          changed = true
        }
      })
      if (!changed) return current
      saveExpanded(project.root, next)
      return next
    })
  }, [activeFile, project])

  const setOpen = (path: string, open: boolean | null) => {
    setExpanded((current) => {
      const next = new Set(current)
      const value = open ?? !next.has(path)
      if (value) next.add(path)
      else next.delete(path)
      if (project) saveExpanded(project.root, next)
      return next
    })
  }
  const toggle = (path: string) => setOpen(path, null)

  // Il fuoco da tastiera segue la riga scelta (tabindex «a rotazione»: una sola riga è raggiungibile col Tab).
  const moveFocus = (path: string) => {
    setFocused(path)
    const row = () => treeRef.current?.querySelector(`[data-path="${CSS.escape(path)}"]`) as HTMLElement | null
    const now = row()
    if (now) now.focus()
    else requestAnimationFrame(() => row()?.focus())
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if ((event.target as HTMLElement).getAttribute('role') !== 'treeitem') return
    const result = treeKey(rows, focused && rows.some((r) => r.path === focused) ? focused : null, event.key, expanded)
    if (!result) return
    event.preventDefault()
    event.stopPropagation()
    if (result.kind === 'focus') moveFocus(result.path)
    else if (result.kind === 'expand') setOpen(result.path, true)
    else if (result.kind === 'collapse') setOpen(result.path, false)
    else if (result.kind === 'toggle') toggle(result.path)
    else if (result.kind === 'open') void executeCommand('editor.open', { path: result.path })
    else if (result.kind === 'rename') void executeCommand('explorer.rename', { path: result.path })
    else if (result.kind === 'delete') void executeCommand('explorer.delete', { path: result.path, kind: result.entry })
  }

  if (!project) {
    return (
      <div className="panel">
        <div className="empty-state">
          <div>
            <p>{t('explorer.noProject')}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn primary" onClick={() => executeCommand('workspace.newProject')}>
                {t('welcome.newProject')}
              </button>
              <button className="btn" onClick={() => executeCommand('workspace.openFolder')}>
                <FolderOpen size={14} /> {t('welcome.openFolder')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Se nessuna riga ha il fuoco, la prima resta raggiungibile col Tab.
  const tabbable = focused && rows.some((r) => r.path === focused) ? focused : (rows[0]?.path ?? null)
  const context: TreeContext = { expanded, toggle, activeFile, focused: tabbable, setFocused, dropDir, setDropDir }

  return (
    <div className="panel">
      <div className="panel-toolbar">
        <span className="title" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={project.root}>
          {project.name}
        </span>
        <button className="icon-btn" title={t('explorer.newFile')} onClick={() => executeCommand('explorer.newFile', { dir: '' })} data-testid="explorer-new-file">
          <FilePlus2 size={15} />
        </button>
        <button className="icon-btn" title={t('explorer.newFolder')} onClick={() => executeCommand('explorer.newFolder', { dir: '' })}>
          <FolderPlus size={15} />
        </button>
        <button className="icon-btn" title={t('explorer.refresh')} onClick={() => refreshTree()}>
          <RefreshCw size={14} />
        </button>
        <button
          className="icon-btn"
          title={t('explorer.collapse')}
          onClick={() => {
            const empty = new Set<string>()
            setExpanded(empty)
            saveExpanded(project.root, empty)
          }}
        >
          <ChevronsDownUp size={15} />
        </button>
      </div>
      <div
        ref={treeRef}
        className={`panel-body tree${dropDir === '' ? ' drop-root' : ''}`}
        role="tree"
        aria-label={t('explorer.treeLabel')}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          const path = (event.target as HTMLElement).dataset['path']
          if (path && path !== focused) setFocused(path)
        }}
        // Lasciato nello spazio vuoto sotto le righe: nella cartella principale.
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(PATH_MIME)) return
          event.preventDefault()
          if (dropDir !== '') setDropDir('')
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropDir(null)
        }}
        onDrop={(event) => {
          const from = event.dataTransfer.getData(PATH_MIME)
          setDropDir(null)
          if (!from) return
          event.preventDefault()
          void executeCommand('explorer.move', { path: from, dir: '' })
        }}
        onContextMenu={(event) =>
          showContextMenu(event, [
            { label: t('explorer.newFile'), run: () => executeCommand('explorer.newFile', { dir: '' }) },
            { label: t('explorer.newFolder'), run: () => executeCommand('explorer.newFolder', { dir: '' }) }
          ])
        }
        data-testid="explorer-tree"
      >
        {tree.map((entry) => (
          <TreeNode key={entry.path} entry={entry} depth={0} context={context} />
        ))}
      </div>
    </div>
  )
}
