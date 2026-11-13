// Menu dell'applicazione descritto qui (shell): le voci sono id di comando; testo e scorciatoia si
// prendono dal registro dei comandi, già tradotti nella lingua scelta. Il main costruisce il menu nativo.
import type { MenuEntry, MenuRole, MenuSection } from '@shared/contracts/menu'
import { ide } from '../ipc'
import { t } from '../i18n'
import type { MessageKey } from '../i18n/it'
import { listCommands } from './commands'

type Spec = { label: MessageKey; items: (string | '-' | { role: MenuRole; label: MessageKey; accelerator?: string })[] }

const SPEC: Spec[] = [
  {
    label: 'menu.file',
    items: [
      'workspace.newProject',
      'workspace.openFolder',
      'quick.open',
      'workspace.close',
      '-',
      'explorer.newFile',
      'workbench.quickOpen',
      'editor.save',
      'editor.saveAll',
      '-',
      'project.exportSite',
      'project.exportHtml',
      'project.exportZip',
      '-',
      'workbench.settings',
      { role: 'quit', label: 'menu.quit' }
    ]
  },
  {
    label: 'menu.edit',
    items: [
      { role: 'undo', label: 'menu.undo' },
      { role: 'redo', label: 'menu.redo' },
      '-',
      { role: 'cut', label: 'menu.cut' },
      { role: 'copy', label: 'menu.copy' },
      { role: 'paste', label: 'menu.paste' },
      { role: 'selectAll', label: 'menu.selectAll' }
    ]
  },
  {
    label: 'menu.create',
    items: ['designer.open', 'designer.newPage', '-', 'sql.show', '-', 'visual.newBlocks', 'visual.newNodes', 'diagram.new', '-', 'ai.chat']
  },
  {
    label: 'menu.run',
    items: ['run.project', 'run.fileInTerminal', 'run.preview', '-', 'trace.run', 'terminal.repl']
  },
  {
    label: 'menu.view',
    items: [
      'workbench.commandPalette',
      'terminal.new',
      'explorer.show',
      'run.showConsole',
      'editor.showProblems',
      'git.show',
      'learn.show',
      'ai.toggleChat',
      'workbench.resetLayout',
      '-',
      'workbench.toggleTheme',
      'workbench.zoomIn',
      'workbench.zoomOut',
      '-',
      { role: 'togglefullscreen', label: 'menu.fullscreen' },
      { role: 'toggleDevTools', label: 'menu.devTools', accelerator: 'Ctrl+Shift+I' }
    ]
  },
  {
    label: 'menu.help',
    items: ['workbench.welcome', 'workbench.shortcuts', 'workbench.about']
  }
]

/** Menu pronto per il main: i comandi non registrati si saltano, i separatori doppi o in cima si tolgono. */
export function menuSections(): MenuSection[] {
  const commands = new Map(listCommands().map((c) => [c.id, c]))
  return SPEC.map((section) => {
    const items: MenuEntry[] = []
    for (const entry of section.items) {
      if (entry === '-') {
        if (items.length && items[items.length - 1]!.kind !== 'separator') items.push({ kind: 'separator' })
      } else if (typeof entry === 'string') {
        const command = commands.get(entry)
        if (command) items.push({ kind: 'command', command: command.id, label: command.title, accelerator: command.keybinding })
      } else {
        items.push({ kind: 'role', role: entry.role, label: t(entry.label), accelerator: entry.accelerator })
      }
    }
    while (items.length && items[items.length - 1]!.kind === 'separator') items.pop()
    return { label: t(section.label), items }
  }).filter((section) => section.items.length > 0)
}

export function publishMenu(): void {
  void ide.invoke('app:setMenu', menuSections())
}
