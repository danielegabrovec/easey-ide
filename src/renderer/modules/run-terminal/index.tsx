// Modulo Terminale: shell integrata, "Esegui nel terminale" per JS/TS, REPL JavaScript.
import { isScriptFile } from '@shared/paths'
import { executeCommand, registerCommand } from '../../workbench/commands'
import { on } from '../../workbench/events'
import { registerPanel, showPanel } from '../../workbench/layout'
import { notify } from '../../workbench/notifications'
import { workbench } from '../../workbench/store'
import { t } from '../../i18n'
import { TerminalPanel } from './TerminalPanel'
import { createSession, disposeAllSessions, installTerminalListeners } from './terminals'

function showTerminalPanel(): void {
  showPanel({ id: 'terminal', component: 'terminal', title: t('panel.terminal'), area: 'bottom', renderer: 'always' })
}

export function activateRunTerminal(): void {
  registerPanel('terminal', TerminalPanel)
  installTerminalListeners()

  const category = t('category.terminal')
  registerCommand({
    id: 'terminal.new',
    title: t('cmd.newTerminal'),
    category,
    keybinding: 'Ctrl+Shift+`',
    run: async () => {
      showTerminalPanel()
      await createSession({ kind: 'shell' })
    }
  })
  registerCommand({
    id: 'terminal.repl',
    title: t('cmd.repl'),
    category,
    run: async () => {
      showTerminalPanel()
      await createSession({ kind: 'repl' })
    }
  })
  registerCommand<{ path?: string }>({
    id: 'run.fileInTerminal',
    title: t('cmd.runFileInTerminal'),
    category: t('category.run'),
    keybinding: 'Ctrl+F5',
    when: () => workbench().project !== null,
    run: async (args) => {
      const project = workbench().project
      const active = workbench().activeFile
      const path = args?.path ?? (active && isScriptFile(active) ? active : project?.config.run.mode === 'terminal' ? project.config.run.entry : null)
      if (!path || !isScriptFile(path)) {
        notify(t('terminal.needScript'), 'error')
        return
      }
      await executeCommand('editor.saveAll')
      showTerminalPanel()
      await createSession({ kind: 'run', entry: path })
    }
  })

  on('project:closed', () => disposeAllSessions())
}
