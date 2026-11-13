// Chiusura della finestra senza perdere il lavoro (il main trattiene la chiusura e chiede qui).
// Con il salvataggio automatico si salva tutto e si chiude; senza, si chiede cosa fare dei file modificati.
import { ide } from '../ipc'
import { Modal, openDialog } from '../ui/dialogs'
import { t } from '../i18n'
import { executeCommand } from './commands'
import { emit } from './events'
import { workbench } from './store'

type Choice = 'save' | 'discard' | 'cancel'

function askUnsaved(files: string[]): Promise<Choice> {
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
              <button className="btn primary" autoFocus onClick={() => done('save')} data-testid="close-save">
                {t('close.save')}
              </button>
            </>
          }
        >
          <p>{t('close.message', { count: files.length })}</p>
          <ul className="close-files">
            {shown.map((file) => (
              <li key={file}>
                <code>{file}</code>
              </li>
            ))}
            {files.length > shown.length && <li className="hint">{t('close.more', { count: files.length - shown.length })}</li>}
          </ul>
        </Modal>
      )
    })
  })
}

let asking = false

async function onCloseRequested(): Promise<void> {
  if (asking) return
  emit('app:closing')
  if (workbench().settings.autoSave) await executeCommand('editor.saveAll')
  if (workbench().dirty.length === 0) {
    await ide.invoke('app:closeReply', 'close')
    return
  }
  asking = true
  await ide.invoke('app:closeReply', 'wait')
  try {
    const choice = await askUnsaved([...workbench().dirty])
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
