// Modulo Git: pannello del controllo versione, differenze, voce nella barra di stato.
import { registerCommand } from '../../workbench/commands'
import { on } from '../../workbench/events'
import { registerPanel, showPanel } from '../../workbench/layout'
import { workbench } from '../../workbench/store'
import { t } from '../../i18n'
import { GitDiffPanel, GitPanel, useGit } from './GitPanel'

function updateStatusItem(): void {
  const status = useGit.getState().status
  if (!status?.repo) {
    workbench().removeStatusItem('git')
    return
  }
  const n = status.changes.length
  workbench().setStatusItem({ id: 'git', text: `⎇ ${status.branch ?? '—'}${n ? ` · ${n}` : ''}`, title: t('git.statusTitle', { n }), command: 'git.show' })
}

export function activateGit(): void {
  registerPanel('git', GitPanel)
  registerPanel('git-diff', GitDiffPanel)
  const category = 'Git'
  const hasProject = () => workbench().project !== null
  registerCommand({ id: 'git.show', title: t('cmd.gitShow'), category, keybinding: 'Ctrl+Alt+G', when: hasProject, run: () => showPanel({ id: 'git', component: 'git', title: 'Git', area: 'left' }) })
  registerCommand({ id: 'git.refresh', title: t('git.refresh'), category, when: hasProject, run: () => useGit.getState().refresh() })

  useGit.subscribe(updateStatusItem)
  let timer: ReturnType<typeof setTimeout> | null = null
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void useGit.getState().refresh(), 700)
  }
  on('project:opened', () => void useGit.getState().refresh())
  on('project:closed', () => useGit.setState({ status: null, log: [] }))
  on('files:changed', schedule)
  on('file:saved', schedule)
}
