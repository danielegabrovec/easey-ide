// Albero dei file del progetto, con menu contestuale e azioni rapide.
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, FilePlus2, FolderPlus, FolderOpen, RefreshCw, ChevronsDownUp, Folder } from 'lucide-react'
import type { FileEntry } from '@shared/contracts/workspace'
import { extensionOf, isScriptFile } from '@shared/paths'
import { executeCommand } from '../../workbench/commands'
import { useWorkbench } from '../../workbench/store'
import { showContextMenu } from '../../ui/ContextMenu'
import { t } from '../../i18n'
import { FileIcon } from './FileIcon'
import { refreshTree } from './project'

const storageKey = (root: string) => `explorer.expanded:${root}`

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

function TreeNode({ entry, depth, expanded, toggle, activeFile }: { entry: FileEntry; depth: number; expanded: Set<string>; toggle: (path: string) => void; activeFile: string | null }) {
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
      { label: t('explorer.rename'), run: () => executeCommand('explorer.rename', { path: entry.path }) },
      { label: t('explorer.reveal'), run: () => executeCommand('explorer.reveal', { path: entry.path }) },
      'separator',
      { label: t('explorer.delete'), danger: true, run: () => executeCommand('explorer.delete', { path: entry.path, kind: entry.kind }) }
    )
    showContextMenu(event, items)
  }

  return (
    <>
      <div
        className={`tree-row${!isDir && activeFile === entry.path ? ' active' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => (isDir ? toggle(entry.path) : executeCommand('editor.open', { path: entry.path }))}
        onContextMenu={onContext}
        title={entry.path}
        data-path={entry.path}
        role="treeitem"
        aria-expanded={isDir ? open : undefined}
      >
        {isDir ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span style={{ width: 14, flexShrink: 0 }} />}
        {isDir ? <Folder size={14} color="var(--text-muted)" /> : <FileIcon path={entry.path} />}
        <span className="tree-name">{entry.name}</span>
      </div>
      {open && entry.children?.map((child) => <TreeNode key={child.path} entry={child} depth={depth + 1} expanded={expanded} toggle={toggle} activeFile={activeFile} />)}
    </>
  )
}

export function ExplorerPanel() {
  const project = useWorkbench((s) => s.project)
  const tree = useWorkbench((s) => s.tree)
  const activeFile = useWorkbench((s) => s.activeFile)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

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

  const toggle = (path: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      if (project) saveExpanded(project.root, next)
      return next
    })
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
        className="panel-body tree"
        role="tree"
        onContextMenu={(event) =>
          showContextMenu(event, [
            { label: t('explorer.newFile'), run: () => executeCommand('explorer.newFile', { dir: '' }) },
            { label: t('explorer.newFolder'), run: () => executeCommand('explorer.newFolder', { dir: '' }) }
          ])
        }
      >
        {tree.map((entry) => (
          <TreeNode key={entry.path} entry={entry} depth={0} expanded={expanded} toggle={toggle} activeFile={activeFile} />
        ))}
      </div>
    </div>
  )
}
