// Modulo Esegui web: anteprima della pagina, console, esecuzione del progetto (F5).
import { extensionOf } from '@shared/paths'
import { executeCommand, registerCommand } from '../../workbench/commands'
import { on } from '../../workbench/events'
import { registerPanel, showPanel } from '../../workbench/layout'
import { workbench } from '../../workbench/store'
import { t } from '../../i18n'
import { ConsolePanel } from './ConsolePanel'
import { PreviewPanel } from './PreviewPanel'
import { handlePreviewMessage, isPreviewMessage, useConsole } from './console-store'
import { currentFrameWindow, usePreview } from './preview-state'

const isHtml = (path: string | null | undefined): path is string => !!path && ['html', 'htm'].includes(extensionOf(path))

function pickEntry(explicit?: string): string {
  if (explicit) return explicit
  const active = workbench().activeFile
  if (isHtml(active)) return active
  const project = workbench().project
  if (project?.config.run.mode === 'web') return project.config.run.entry
  return 'index.html'
}

async function runPreview(entry?: string): Promise<void> {
  await executeCommand('editor.saveAll')
  showPanel({ id: 'preview', component: 'preview', title: t('panel.preview'), area: 'right', renderer: 'always' })
  showPanel({ id: 'console', component: 'console', title: t('panel.console'), area: 'bottom', renderer: 'always', inactive: true })
  await usePreview.getState().load(pickEntry(entry))
}

export function activateRunWeb(): void {
  registerPanel('preview', PreviewPanel)
  registerPanel('console', ConsolePanel)

  const category = t('category.run')
  const hasProject = () => workbench().project !== null
  registerCommand({
    id: 'run.project',
    title: t('cmd.runProject'),
    category,
    keybinding: 'F5',
    when: hasProject,
    run: async () => {
      const project = workbench().project
      if (!project) return
      if (project.config.run.mode === 'terminal') {
        await executeCommand('run.fileInTerminal', { path: project.config.run.entry })
        return
      }
      await runPreview()
    }
  })
  registerCommand<{ entry?: string }>({
    id: 'run.preview',
    title: t('cmd.openPreview'),
    category,
    when: hasProject,
    run: (args) => runPreview(args?.entry ?? usePreview.getState().entry ?? undefined)
  })
  registerCommand({
    id: 'run.showConsole',
    title: t('cmd.showConsole'),
    category: t('category.view'),
    run: () => showPanel({ id: 'console', component: 'console', title: t('panel.console'), area: 'bottom', renderer: 'always' })
  })
  registerCommand({ id: 'run.clearConsole', title: t('console.clear'), category, run: () => useConsole.getState().clear() })

  window.addEventListener('message', (event) => {
    const frame = currentFrameWindow()
    if (!frame || event.source !== frame) return
    if (isPreviewMessage(event.data)) handlePreviewMessage(event.data)
  })

  // Anteprima "dal vivo": ogni salvataggio ricarica la pagina.
  let reloadTimer: ReturnType<typeof setTimeout> | null = null
  on('file:saved', () => {
    const { entry } = usePreview.getState()
    if (!entry || !workbench().settings.autoRun) return
    if (reloadTimer) clearTimeout(reloadTimer)
    reloadTimer = setTimeout(() => void usePreview.getState().load(entry), 250)
  })
  on('project:opened', (project) => {
    usePreview.getState().reset()
    useConsole.getState().clear()
    if (project.config.run.mode === 'web') void usePreview.getState().load(project.config.run.entry)
  })
  on('project:closed', () => {
    usePreview.getState().reset()
    useConsole.getState().clear()
  })
}
