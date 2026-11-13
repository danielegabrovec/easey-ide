// Modulo Designer: progettazione visuale delle pagine HTML (stile Canva nelle tavole libere,
// stile Wix a sezioni), con modifiche chirurgiche al codice HTML/CSS dell'utente.
import { newPageHtml, pageFileName, pageFolder } from '@shared/designer/pages'
import { basenameOf, extensionOf, filePaths } from '@shared/paths'
import type * as Monaco from 'monaco-editor'
import { ide } from '../../ipc'
import { prompt } from '../../ui/dialogs'
import { executeCommand, registerCommand } from '../../workbench/commands'
import { on } from '../../workbench/events'
import { closePanel, registerPanel, showPanel } from '../../workbench/layout'
import { notify, notifyError } from '../../workbench/notifications'
import { workbench } from '../../workbench/store'
import { t } from '../../i18n'
import { DesignerPanel } from './DesignerPanel'
import { useDesigner } from './designer-store'

const isHtml = (path: string | null | undefined): path is string => !!path && ['html', 'htm'].includes(extensionOf(path))

export function openDesigner(path: string): void {
  // Un solo designer alla volta: se si cambia pagina, il pannello si riapre sulla nuova.
  if (useDesigner.getState().path && useDesigner.getState().path !== path) closePanel('designer')
  const panel = showPanel({ id: 'designer', component: 'designer', title: `${t('panel.designer')} · ${basenameOf(path)}`, area: 'center', params: { path }, renderer: 'always' })
  // Il designer ha bisogno di spazio: il suo gruppo si ingrandisce (il pulsante di dockview lo ripristina).
  if (panel && !panel.api.isMaximized()) panel.api.maximize()
}

export function activateDesigner(): void {
  registerPanel('designer', DesignerPanel)
  registerCommand<{ path?: string }>({
    id: 'designer.open',
    title: t('cmd.designerOpen'),
    category: t('category.design'),
    keybinding: 'Ctrl+Shift+G',
    when: () => workbench().project !== null,
    run: (args) => {
      const project = workbench().project
      const path = args?.path ?? (isHtml(workbench().activeFile) ? workbench().activeFile : project?.config.run.mode === 'web' ? project.config.run.entry : null)
      if (!isHtml(path)) {
        notify(t('designer.needHtml'), 'error')
        return
      }
      openDesigner(path)
    }
  })
  registerCommand({
    id: 'designer.newPage',
    title: t('cmd.designerNewPage'),
    category: t('category.design'),
    when: () => workbench().project !== null,
    run: () => newPage()
  })
  on('project:closed', () => {
    closePanel('designer')
    useDesigner.getState().setPage(null)
  })
  on('file:deleted', ({ path }) => {
    const current = useDesigner.getState().path
    if (current && (current === path || current.startsWith(`${path}/`))) closePanel('designer')
  })
}

/** Pagina nuova accanto a quella aperta nel designer (o alla pagina d'ingresso), poi aperta nel designer. */
async function newPage(): Promise<void> {
  const project = workbench().project
  if (!project) return
  const active = workbench().activeFile
  const from = useDesigner.getState().path ?? (isHtml(active) ? active : isHtml(project.config.run.entry) ? project.config.run.entry : null)
  const title = await prompt({ title: t('designer.newPageTitle'), label: t('designer.newPageLabel'), okLabel: t('designer.newPageCreate') })
  if (!title) return
  try {
    const path = pageFileName(title, filePaths(workbench().tree), pageFolder(from))
    // Si parte dal testo nell'editor (anche non ancora salvato), non dal disco.
    const model = from ? ((await executeCommand('editor.ensureModel', { path: from })) as Monaco.editor.ITextModel | null) : null
    const html = newPageHtml(model?.getValue() ?? null, title, { intro: t('designer.newPageIntro'), lang: workbench().settings.language })
    await ide.invoke('workspace:createFile', path, html)
    openDesigner(path)
    notify(t('designer.pageCreated', { path }), 'success')
  } catch (error) {
    notifyError(error)
  }
}
