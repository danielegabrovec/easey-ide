// Aprire ciò che arriva dalla riga di comando (1.6, per «Apri in Easey IDE» di Easey DB). Il main riconosce il
// percorso (@shared/launch-args); qui si decide dove va:
//   - una cartella → si apre come progetto (con la guardia sul lavoro non salvato di openProject);
//   - un file del progetto aperto → nell'editor;
//   - un file fuori dal progetto in un linguaggio della Scrittura rapida (.py, .js, .sql…) → nella Scrittura rapida;
//   - un altro file (.html, .css…) → si apre la sua cartella come progetto e poi il file.
import { quickLanguageOf } from '@shared/contracts/quick'
import { projectRelative, type LaunchTarget } from '@shared/launch-args'
import { ide } from '../ipc'
import { t } from '../i18n'
import { executeCommand } from './commands'
import { notify } from './notifications'
import { workbench } from './store'

const normal = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '')
const baseName = (path: string) => normal(path).split('/').pop() ?? path
const parentOf = (path: string) => normal(path).split('/').slice(0, -1).join('/')

export async function openLaunchTarget(target: LaunchTarget): Promise<void> {
  if (target.kind === 'folder') {
    await executeCommand('workspace.openPath', { root: target.path })
    return
  }
  const project = workbench().project
  const inside = project ? projectRelative(project.root, target.path) : null
  if (inside) {
    await executeCommand('editor.open', { path: inside })
    return
  }
  const language = quickLanguageOf(baseName(target.path))
  if (language && target.content !== undefined) {
    await executeCommand('quick.insertCode', { code: target.content, language })
    notify(t('launch.openedQuick', { name: baseName(target.path) }), 'info')
    return
  }
  // Un file che la Scrittura rapida non sa eseguire: la sua cartella come progetto, poi il file.
  const opened = await executeCommand('workspace.openPath', { root: parentOf(target.path) })
  if (opened) await executeCommand('editor.open', { path: baseName(target.path) })
}

/**
 * All'avvio: il percorso della riga di comando (se c'è) vince sull'ultimo progetto; poi ogni altro avvio con un
 * percorso mentre l'app è aperta (second-instance) arriva come evento.
 */
export async function startWithLaunchTarget(restoreLastProject: () => Promise<void>): Promise<void> {
  ide.on('app:openPath', (target) => void openLaunchTarget(target))
  const target = await ide.invoke('app:launchTarget').catch(() => null)
  if (target?.kind !== 'folder') await restoreLastProject()
  if (target) await openLaunchTarget(target)
}
