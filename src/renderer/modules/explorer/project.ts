// Ciclo di vita del progetto lato interfaccia: apertura, chiusura, albero dei file.
import { ide } from '../../ipc'
import { emit } from '../../workbench/events'
import { executeCommand } from '../../workbench/commands'
import { notifyError } from '../../workbench/notifications'
import { workbench } from '../../workbench/store'
import { confirm } from '../../ui/dialogs'
import { t } from '../../i18n'

let treeTimer: ReturnType<typeof setTimeout> | null = null

export async function refreshTree(): Promise<void> {
  if (!workbench().project) {
    workbench().setTree([])
    return
  }
  try {
    workbench().setTree(await ide.invoke('workspace:tree'))
  } catch (error) {
    notifyError(error)
  }
}

export function scheduleTreeRefresh(): void {
  if (treeTimer) clearTimeout(treeTimer)
  treeTimer = setTimeout(() => void refreshTree(), 150)
}

async function leaveCurrentProject(): Promise<void> {
  if (!workbench().project) return
  await executeCommand('editor.saveAll')
  emit('project:closed')
}

/** Apre un progetto; con `quiet` un fallimento non mostra avvisi (es. ultimo progetto sparito all'avvio). */
export async function openProject(root: string, quiet = false): Promise<boolean> {
  try {
    await leaveCurrentProject()
    const info = await ide.invoke('workspace:open', root)
    workbench().setProject(info)
    workbench().setSettings(await ide.invoke('settings:get'))
    await refreshTree()
    void ide.invoke('app:setTitle', `${info.name} — Easey IDE`)
    emit('project:opened', info)
    return true
  } catch (error) {
    if (!quiet) notifyError(error)
    return false
  }
}

/** Toglie un progetto dall'elenco dei recenti (la cartella su disco non si tocca). */
export async function forgetRecent(root: string): Promise<void> {
  const recent = workbench().settings.recent.filter((item) => item.root !== root)
  await executeCommand('workbench.updateSettings', { recent })
}

/** Apre un progetto recente; se non si apre più (cartella spostata o eliminata) propone di toglierlo dall'elenco. */
export async function openRecent(root: string): Promise<void> {
  if (await openProject(root, true)) return
  const remove = await confirm({
    title: t('welcome.missingTitle'),
    message: t('welcome.missing', { root }),
    confirmLabel: t('welcome.removeRecent')
  })
  if (remove) await forgetRecent(root)
}

export async function createProject(templateId: string, name: string, location: string): Promise<boolean> {
  try {
    await leaveCurrentProject()
    const info = await ide.invoke('workspace:create', { templateId, name, location })
    workbench().setProject(info)
    workbench().setSettings(await ide.invoke('settings:get'))
    await refreshTree()
    void ide.invoke('app:setTitle', `${info.name} — Easey IDE`)
    emit('project:opened', info)
    return true
  } catch (error) {
    notifyError(error)
    return false
  }
}

export async function closeProject(): Promise<void> {
  await leaveCurrentProject()
  await ide.invoke('workspace:close')
  workbench().setProject(null)
  workbench().setTree([])
  void ide.invoke('app:setTitle', 'Easey IDE')
}

/** Ricarica easey.json dopo un salvataggio (modalità di esecuzione e file d'ingresso). */
export async function reloadProjectInfo(): Promise<void> {
  const info = await ide.invoke('workspace:current')
  if (info) workbench().setProject(info)
}

const INVALID_NAME = /[<>:"\\|?*\u0000-\u001f]/

export function validateName(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  if (INVALID_NAME.test(trimmed)) return t('explorer.invalidChars')
  if (trimmed.split('/').some((part) => part === '..' || part === '.')) return t('explorer.invalidName')
  return null
}
