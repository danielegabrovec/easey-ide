// Modulo "Passo passo": esegue un file JS/TS una riga alla volta mostrando variabili e pila delle chiamate.
import { extensionOf } from '@shared/paths'
import { ide } from '../../ipc'
import { executeCommand, registerCommand } from '../../workbench/commands'
import { registerPanel, showPanel } from '../../workbench/layout'
import { notify, notifyError } from '../../workbench/notifications'
import { workbench } from '../../workbench/store'
import { t } from '../../i18n'
import { goTo, TracePanel, useTrace } from './TracePanel'

const TRACEABLE = new Set(['js', 'mjs', 'cjs', 'ts', 'mts', 'cts'])
const traceable = (path: string | null | undefined): path is string => !!path && TRACEABLE.has(extensionOf(path))

export function activateStepRun(): void {
  registerPanel('trace', TracePanel)
  registerCommand<{ path?: string }>({
    id: 'trace.run',
    title: t('cmd.traceRun'),
    category: t('category.run'),
    keybinding: 'Ctrl+F10',
    when: () => traceable(workbench().activeFile),
    run: async (args) => {
      const path = args?.path ?? workbench().activeFile
      if (!traceable(path)) {
        notify(t('trace.needScript'), 'error')
        return
      }
      await executeCommand('editor.saveAll')
      useTrace.getState().set({ running: true, result: null, index: 0 })
      showPanel({ id: 'trace', component: 'trace', title: t('panel.trace'), area: 'bottom' })
      try {
        const result = await ide.invoke('trace:run', path)
        useTrace.getState().set({ result, running: false, index: 0 })
        if (result.steps.length > 0) goTo(0)
        else if (result.error) notify(result.error.message, 'error')
      } catch (error) {
        useTrace.getState().set({ running: false })
        notifyError(error)
      }
    }
  })
}
