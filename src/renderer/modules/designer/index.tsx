// Modulo Designer: progettazione visuale delle pagine HTML (stile Canva nelle tavole libere,
// stile Wix a sezioni), con modifiche chirurgiche al codice HTML/CSS dell'utente.
import { basenameOf, extensionOf } from '@shared/paths'
import { registerCommand } from '../../workbench/commands'
import { on } from '../../workbench/events'
import { closePanel, registerPanel, showPanel } from '../../workbench/layout'
import { notify } from '../../workbench/notifications'
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
  on('project:closed', () => {
    closePanel('designer')
    useDesigner.getState().setPage(null)
  })
  on('file:deleted', ({ path }) => {
    const current = useDesigner.getState().path
    if (current && (current === path || current.startsWith(`${path}/`))) closePanel('designer')
  })
}
