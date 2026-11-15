import { createRoot } from 'react-dom/client'
import 'dockview/dist/styles/dockview.css'
import '@xterm/xterm/css/xterm.css'
import './styles/app.css'
import './styles/modules.css'
import { ide } from './ipc'
import { setLanguage } from './i18n'
import { activateModules, restoreLastProject } from './modules'
import { executeCommand, installKeybindings } from './workbench/commands'
import { installCloseGuard } from './workbench/close-guard'
import { publishMenu } from './workbench/app-menu'
import { registerWorkbenchCommands } from './workbench/workbench-commands'
import { useWorkbench } from './workbench/store'
import { Workbench } from './workbench/Workbench'
import { ErrorBoundary } from './workbench/ErrorBoundary'
import { startWithLaunchTarget } from './workbench/launch'

// Monaco annulla operazioni interne (diff, suggerimenti) rifiutando con un errore "Canceled":
// è un annullamento voluto, non un problema, e non deve risultare come errore non gestito.
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason as { name?: string; message?: string } | undefined
  if (reason?.name === 'Canceled' || reason?.message === 'Canceled') event.preventDefault()
})

async function start(): Promise<void> {
  const settings = await ide.invoke('settings:get')
  setLanguage(settings.language)
  useWorkbench.getState().setSettings(settings)
  document.documentElement.dataset['theme'] = settings.theme

  registerWorkbenchCommands()
  activateModules()
  installKeybindings()
  ide.on('menu:command', (id) => void executeCommand(id))
  installCloseGuard()
  publishMenu()

  createRoot(document.getElementById('root')!).render(
    <ErrorBoundary name="Easey IDE" scope="app">
      <Workbench />
    </ErrorBoundary>
  )
  // Il layout dockview si costruisce al primo render: si riapre il progetto subito dopo.
  // Un file o una cartella passati sulla riga di comando (Easey DB: «Apri in Easey IDE») vincono sull'ultimo progetto.
  requestAnimationFrame(() => void startWithLaunchTarget(restoreLastProject))
}

void start()
