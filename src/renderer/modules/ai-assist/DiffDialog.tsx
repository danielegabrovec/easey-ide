// Confronto prima/dopo del codice proposto dall'AI: si applica solo se l'utente accetta.
import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor'
import { Modal } from '../../ui/dialogs'
import { executeCommand } from '../../workbench/commands'
import { notify } from '../../workbench/notifications'
import { useWorkbench } from '../../workbench/store'
import { t } from '../../i18n'
import type { ApplyTarget } from './chat-store'

/**
 * `onApply` sostituisce l'applicazione predefinita (`editor.replaceRange` sul file del progetto):
 * serve agli editor che non sono file, come la Scrittura rapida.
 */
export function DiffDialog({
  target,
  proposed,
  close,
  onApply
}: {
  target: ApplyTarget
  proposed: string
  close: () => void
  onApply?: (text: string) => void | Promise<void>
}) {
  const host = useRef<HTMLDivElement>(null)
  const theme = useWorkbench((s) => s.settings.theme)
  useEffect(() => {
    if (!host.current) return
    const original = monaco.editor.createModel(target.original, target.language)
    const modified = monaco.editor.createModel(proposed, target.language)
    const diff = monaco.editor.createDiffEditor(host.current, {
      automaticLayout: true,
      readOnly: true,
      renderSideBySide: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      theme: theme === 'dark' ? 'lab-dark' : 'lab-light'
    })
    diff.setModel({ original, modified })
    return () => {
      diff.dispose()
      original.dispose()
      modified.dispose()
    }
  }, [target, proposed, theme])

  const apply = async () => {
    if (onApply) await onApply(proposed)
    else await executeCommand('editor.replaceRange', { path: target.path, range: target.range, text: proposed })
    notify(t('ai.applied'), 'success')
    close()
  }

  return (
    <Modal
      title={t('ai.diffTitle', { path: target.path })}
      wide
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" onClick={apply} data-testid="ai-apply-confirm">
            {t('ai.applyConfirm')}
          </button>
        </>
      }
    >
      <div className="hint">{t('ai.diffHint')}</div>
      <div ref={host} style={{ height: 420, border: '1px solid var(--border)', borderRadius: 6 }} />
    </Modal>
  )
}
