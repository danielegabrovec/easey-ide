// Chiusura della finestra senza perdere il lavoro (il main trattiene la chiusura e chiede qui).
// Prima si mette al sicuro ciò che si può da soli (bozze, salvataggi rimandati, file col salvataggio
// automatico); poi, se resta qualcosa (file modificati, database in memoria, salvataggi non riusciti), si
// elenca tutto e si chiede cosa fare.
import { AlertTriangle } from 'lucide-react'
import { ide } from '../ipc'
import { Modal, openDialog } from '../ui/dialogs'
import { t } from '../i18n'
import { executeCommand } from './commands'
import { emit } from './events'
import { workbench } from './store'
import { collectUnsavedWork } from './unsaved'

type Choice = 'save' | 'discard' | 'cancel'

function askUnsaved(files: string[], others: string[]): Promise<Choice> {
  return new Promise((resolve) => {
    openDialog((close) => {
      const done = (choice: Choice) => {
        close()
        resolve(choice)
      }
      const shown = files.slice(0, 6)
      return (
        <Modal
          title={t('close.title')}
          onClose={() => done('cancel')}
          footer={
            <>
              <button className="btn" onClick={() => done('cancel')} data-testid="close-cancel">
                {t('common.cancel')}
              </button>
              <button className="btn danger" onClick={() => done('discard')} data-testid="close-discard">
                {t('close.discard')}
              </button>
              {files.length > 0 && (
                <button className="btn primary" autoFocus onClick={() => done('save')} data-testid="close-save">
                  {t('close.save')}
                </button>
              )}
            </>
          }
        >
          {files.length > 0 && (
            <>
              <p>{t('close.message', { count: files.length })}</p>
              <ul className="close-files">
                {shown.map((file) => (
                  <li key={file}>
                    <code>{file}</code>
                  </li>
                ))}
                {files.length > shown.length && <li className="hint">{t('close.more', { count: files.length - shown.length })}</li>}
              </ul>
            </>
          )}
          {others.length > 0 && (
            <div className="close-others" data-testid="close-others">
              <p>
                <AlertTriangle size={14} color="var(--warning)" /> {t('close.others')}
              </p>
              <ul>
                {others.map((text, index) => (
                  <li key={index}>{text}</li>
                ))}
              </ul>
            </div>
          )}
        </Modal>
      )
    })
  })
}

/**
 * Mette al sicuro ciò che si può senza chiedere e restituisce ciò che resta in pericolo: file modificati e
 * altro lavoro (descritto dai moduli). Lo usano la chiusura della finestra e il cambio di progetto.
 */
export async function secureWork(): Promise<{ files: string[]; others: string[] }> {
  emit('app:closing')
  const others = await collectUnsavedWork()
  if (workbench().settings.autoSave) await executeCommand('editor.saveAll')
  return { files: [...workbench().dirty], others }
}

let asking = false

async function onCloseRequested(): Promise<void> {
  if (asking) return
  asking = true
  try {
    // Il dialogo può restare aperto a lungo: il main non deve chiudere da solo dopo il tempo massimo.
    await ide.invoke('app:closeReply', 'wait')
    const { files, others } = await secureWork()
    if (files.length === 0 && others.length === 0) {
      await ide.invoke('app:closeReply', 'close')
      return
    }
    const choice = await askUnsaved(files, others)
    if (choice === 'save') await executeCommand('editor.saveAll')
    // Un salvataggio fallito (l'errore è già stato mostrato) non deve far perdere le modifiche.
    const ok = choice === 'discard' || (choice === 'save' && workbench().dirty.length === 0)
    await ide.invoke('app:closeReply', ok ? 'close' : 'cancel')
  } finally {
    asking = false
  }
}

export function installCloseGuard(): void {
  ide.on('app:closeRequested', () => void onCloseRequested())
}
