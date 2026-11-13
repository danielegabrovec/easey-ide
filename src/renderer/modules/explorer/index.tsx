// Modulo Esplora: progetti (nuovo, apri, chiudi, recenti), albero dei file e operazioni sui file.
import { ide } from '../../ipc'
import { registerCommand, executeCommand } from '../../workbench/commands'
import { emit } from '../../workbench/events'
import { registerPanel, showPanel } from '../../workbench/layout'
import { notifyError } from '../../workbench/notifications'
import { workbench } from '../../workbench/store'
import { confirm, openDialog, prompt } from '../../ui/dialogs'
import { notify } from '../../workbench/notifications'
import { joinRelative } from '@shared/paths'
import { LEGACY_PROJECT_CONFIG_FILE, PROJECT_CONFIG_FILE } from '@shared/contracts/workspace'
import { t } from '../../i18n'
import { ExplorerPanel } from './ExplorerPanel'
import { NewProjectDialog } from './NewProjectDialog'
import { WelcomePanel } from './WelcomePanel'
import { closeProject, openProject, refreshTree, reloadProjectInfo, scheduleTreeRefresh, validateName } from './project'
import { on } from '../../workbench/events'

const hasProject = () => workbench().project !== null

export function activateExplorer(): void {
  registerPanel('explorer', ExplorerPanel)
  registerPanel('welcome', WelcomePanel)

  const category = t('category.file')
  registerCommand<{ templateId?: string }>({
    id: 'workspace.newProject',
    title: t('cmd.newProject'),
    category,
    keybinding: 'Ctrl+Shift+N',
    run: (args) => openDialog((close) => <NewProjectDialog close={close} initialTemplate={args?.templateId} />)
  })
  registerCommand({
    id: 'workspace.openFolder',
    title: t('cmd.openFolder'),
    category,
    keybinding: 'Ctrl+O',
    run: async () => {
      const folder = await ide.invoke('workspace:pickFolder')
      if (folder) await openProject(folder)
    }
  })
  // Per gli altri moduli (es. didattica): apre una cartella nota come progetto. Restituisce true se aperta.
  registerCommand<{ root: string }>({ id: 'workspace.openPath', title: 'workspace.openPath', palette: false, run: (args) => (args ? openProject(args.root) : false) })
  const exportProject = async (kind: 'zip' | 'html') => {
    try {
      await executeCommand('editor.saveAll')
      const path = await ide.invoke('project:export', kind)
      if (path) notify(t('export.done', { path }), 'success')
    } catch (error) {
      notifyError(error)
    }
  }
  registerCommand({ id: 'project.exportZip', title: t('cmd.exportZip'), category, when: hasProject, run: () => exportProject('zip') })
  registerCommand({ id: 'project.exportHtml', title: t('cmd.exportHtml'), category, when: hasProject, run: () => exportProject('html') })
  registerCommand({ id: 'workspace.close', title: t('cmd.closeProject'), category, when: hasProject, run: () => closeProject() })
  registerCommand({ id: 'explorer.show', title: t('cmd.showExplorer'), category: t('category.view'), keybinding: 'Ctrl+Shift+E', run: () => showPanel({ id: 'explorer', component: 'explorer', title: t('panel.explorer'), area: 'left' }) })
  registerCommand({ id: 'workbench.welcome', title: t('cmd.welcome'), category: t('category.help'), run: () => showPanel({ id: 'welcome', component: 'welcome', title: t('panel.welcome'), area: 'center' }) })

  registerCommand<{ dir?: string }>({
    id: 'explorer.newFile',
    title: t('cmd.newFile'),
    category,
    keybinding: 'Ctrl+N',
    when: hasProject,
    run: async (args) => {
      const dir = args?.dir ?? ''
      const name = await prompt({
        title: t('explorer.newFile'),
        label: dir ? t('explorer.inFolder', { dir }) : t('explorer.fileNameHint'),
        value: '',
        validate: validateName
      })
      if (!name) return
      const path = joinRelative(dir, name)
      await ide.invoke('workspace:createFile', path, '')
      await refreshTree()
      await executeCommand('editor.open', { path })
    }
  })
  registerCommand<{ dir?: string }>({
    id: 'explorer.newFolder',
    title: t('cmd.newFolder'),
    category,
    when: hasProject,
    run: async (args) => {
      const dir = args?.dir ?? ''
      const name = await prompt({ title: t('explorer.newFolder'), label: t('explorer.folderName'), validate: validateName })
      if (!name) return
      await ide.invoke('workspace:createFolder', joinRelative(dir, name))
      await refreshTree()
    }
  })
  registerCommand<{ path: string }>({
    id: 'explorer.rename',
    title: t('explorer.rename'),
    palette: false,
    run: async (args) => {
      if (!args) return
      const current = args.path.slice(args.path.lastIndexOf('/') + 1)
      const dir = args.path.includes('/') ? args.path.slice(0, args.path.lastIndexOf('/')) : ''
      const name = await prompt({ title: t('explorer.rename'), label: t('explorer.newName'), value: current, validate: validateName, selectStem: true })
      if (!name || name === current) return
      const target = joinRelative(dir, name)
      await executeCommand('editor.saveAll')
      await ide.invoke('workspace:rename', args.path, target)
      emit('file:renamed', { from: args.path, to: target })
      await refreshTree()
    }
  })
  registerCommand<{ path: string; kind: 'file' | 'dir' }>({
    id: 'explorer.delete',
    title: t('explorer.delete'),
    palette: false,
    run: async (args) => {
      if (!args) return
      const ok = await confirm({
        title: t('explorer.delete'),
        message: args.kind === 'dir' ? t('explorer.confirmDeleteFolder', { path: args.path }) : t('explorer.confirmDeleteFile', { path: args.path }),
        confirmLabel: t('explorer.delete'),
        danger: true
      })
      if (!ok) return
      await ide.invoke('workspace:delete', args.path)
      emit('file:deleted', { path: args.path })
      await refreshTree()
    }
  })
  registerCommand<{ path: string }>({
    id: 'explorer.reveal',
    title: t('explorer.reveal'),
    palette: false,
    run: (args) => args && ide.invoke('workspace:reveal', args.path)
  })
  registerCommand({
    id: 'workspace.configure',
    title: t('cmd.configureRun'),
    category: t('category.run'),
    when: hasProject,
    run: () => executeCommand('editor.open', { path: PROJECT_CONFIG_FILE })
  })

  // Cambi su disco → albero aggiornato e avviso agli altri moduli.
  ide.on('workspace:changed', (change) => {
    scheduleTreeRefresh()
    if (change.paths.includes(PROJECT_CONFIG_FILE) || change.paths.includes(LEGACY_PROJECT_CONFIG_FILE)) void reloadProjectInfo()
    emit('files:changed', { paths: change.paths })
  })
  on('file:saved', ({ path }) => {
    if (path === PROJECT_CONFIG_FILE || path === LEGACY_PROJECT_CONFIG_FILE) void reloadProjectInfo()
  })
}

/** All'avvio riapre l'ultimo progetto, se esiste ancora. */
export async function restoreLastProject(): Promise<void> {
  try {
    const settings = await ide.invoke('settings:get')
    workbench().setSettings(settings)
    const last = settings.recent[0]
    // Se l'ultimo progetto non c'è più si parte dal Benvenuto, senza avvisi (resta nei recenti, da togliere lì).
    if (last) await openProject(last.root, true)
  } catch (error) {
    notifyError(error)
  }
}
