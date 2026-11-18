// Tasto destro dell'albero (1.6): traduce il menu puro di @shared/explorer-menu in voci con testo e comando.
// Le azioni che riguardano solo l'albero (espandi/comprimi) le passa il pannello in `local`.
import { treeMenu, type TreeMenuAction, type TreeMenuNode, type TreeMenuTarget } from '@shared/explorer-menu'
import { dirnameOf } from '@shared/paths'
import type { MenuItem } from '../../ui/ContextMenu'
import { executeCommand } from '../../workbench/commands'
import { workbench } from '../../workbench/store'
import { t } from '../../i18n'
import type { MessageKey } from '../../i18n/it'

export interface TreeMenuLocal {
  expandAll: (path: string) => void
  collapseAll: (path: string) => void
}

/** Apre il file e, appena è l'editor attivo, chiede all'AI (le azioni rapide lavorano sull'editor attivo). */
async function askAiAbout(path: string, command: string): Promise<void> {
  await executeCommand('editor.open', { path })
  for (let i = 0; i < 20 && workbench().activeFile !== path; i++) await new Promise((resolve) => setTimeout(resolve, 50))
  await executeCommand(command)
}

function run(action: TreeMenuAction, target: TreeMenuTarget, local: TreeMenuLocal): void {
  const { path, kind } = target
  // «Nuovo» e il terminale: nella cartella stessa, o in quella che contiene il file.
  const dir = kind === 'file' ? dirnameOf(path) : path
  const entryKind = kind === 'dir' ? 'dir' : 'file'
  const commands: Record<TreeMenuAction, () => unknown> = {
    open: () => executeCommand('editor.open', { path }),
    openBeside: () => executeCommand('editor.openBeside', { path }),
    openPreview: () => executeCommand('run.preview', { entry: path }),
    openDesigner: () => executeCommand('designer.open', { path }),
    openImage: () => executeCommand('editor.openImage', { path }),
    openDatabase: () => executeCommand('sql.openDatabase', { path }),
    runTerminal: () => executeCommand('run.fileInTerminal', { path }),
    runStep: () => executeCommand('trace.run', { path }),
    runSql: async () => {
      await executeCommand('editor.open', { path })
      await executeCommand('sql.runFile')
    },
    aiExplain: () => askAiAbout(path, 'ai.explain'),
    aiComment: () => askAiAbout(path, 'ai.comment'),
    aiTests: () => askAiAbout(path, 'ai.tests'),
    newFile: () => executeCommand('explorer.newFile', { dir }),
    newFolder: () => executeCommand('explorer.newFolder', { dir }),
    newPage: () => executeCommand('designer.newPage'),
    newBlocks: () => executeCommand('visual.newBlocks'),
    newNodes: () => executeCommand('visual.newNodes'),
    newDiagram: () => executeCommand('diagram.new'),
    newScene3D: () => executeCommand('studio3d.new', { dir: dir || 'scene' }),
    rename: () => executeCommand('explorer.rename', { path }),
    duplicate: () => executeCommand('explorer.duplicate', { path }),
    move: () => executeCommand('explorer.move', { path }),
    copyRelative: () => executeCommand('explorer.copyPath', { path, mode: 'relative' }),
    copyAbsolute: () => executeCommand('explorer.copyPath', { path, mode: 'absolute' }),
    copyName: () => executeCommand('explorer.copyPath', { path, mode: 'name' }),
    history: () => executeCommand('editor.history', { path }),
    reveal: () => executeCommand('explorer.reveal', { path }),
    terminalHere: () => executeCommand('terminal.new', { dir }),
    expandAll: () => local.expandAll(path),
    collapseAll: () => local.collapseAll(path),
    refresh: () => executeCommand('explorer.refresh'),
    delete: () => executeCommand('explorer.delete', { path, kind: entryKind })
  }
  void commands[action]()
}

function toItems(nodes: TreeMenuNode[], target: TreeMenuTarget, local: TreeMenuLocal): MenuItem[] {
  return nodes.map((node): MenuItem => {
    if (node === 'separator') return 'separator'
    if ('heading' in node) return { heading: node.heading }
    if ('submenu' in node) return { label: t(`treeMenu.sub.${node.submenu}` as MessageKey), items: toItems(node.items, target, local), testId: `tree-sub-${node.submenu}` }
    return {
      label: t(`treeMenu.${node.action}` as MessageKey),
      detail: node.shortcut,
      danger: node.danger,
      disabled: !!node.reason,
      title: node.reason ? t(`treeMenu.why.${node.reason}` as MessageKey) : undefined,
      testId: `tree-menu-${node.action}`,
      run: () => run(node.action, target, local)
    }
  })
}

export function treeMenuItems(target: TreeMenuTarget, local: TreeMenuLocal): MenuItem[] {
  return toItems(treeMenu(target), target, local)
}
