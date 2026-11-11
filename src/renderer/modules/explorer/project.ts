// Ciclo di vita del progetto lato interfaccia: apertura, chiusura, albero dei file.
import { ide } from '../../ipc'
import { emit } from '../../workbench/events'
import { executeCommand } from '../../workbench/commands'
import { notifyError } from '../../workbench/notifications'
import { workbench } from '../../workbench/store'

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

export async function openProject(root: string): Promise<boolean> {
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
    notifyError(error)
    return false
  }
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
  if (INVALID_NAME.test(trimmed)) return 'Caratteri non ammessi: < > : " \\ | ? *'
  if (trimmed.split('/').some((part) => part === '..' || part === '.')) return 'Nome non valido'
  return null
}
