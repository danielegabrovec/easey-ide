// Cronologia locale di un file: versioni salvate, anteprima e ripristino.
import { useEffect, useState } from 'react'
import type { HistoryEntry } from '@shared/contracts/workspace'
import { ide } from '../../ipc'
import { Modal } from '../../ui/dialogs'
import { notify, notifyError } from '../../workbench/notifications'
import { t } from '../../i18n'
import { ensureModel, replaceContent, save } from './models'

export function HistoryDialog({ path, close }: { path: string; close: () => void }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState('')

  useEffect(() => {
    void ide.invoke('workspace:historyList', path).then((list) => {
      setEntries(list)
      if (list[0]) setSelected(list[0].id)
    }, notifyError)
  }, [path])

  useEffect(() => {
    if (!selected) return
    void ide.invoke('workspace:historyRead', path, selected).then(setContent, notifyError)
  }, [path, selected])

  const restore = async () => {
    if (!selected) return
    const model = await ensureModel(path)
    replaceContent(model, content)
    await save(path)
    notify(t('history.restored'), 'success')
    close()
  }

  return (
    <Modal
      title={t('history.title', { path })}
      wide
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            {t('common.close')}
          </button>
          <button className="btn primary" disabled={!selected} onClick={restore}>
            {t('history.restore')}
          </button>
        </>
      }
    >
      {entries === null ? (
        <div className="hint">{t('common.loading')}</div>
      ) : entries.length === 0 ? (
        <div className="hint">{t('history.empty')}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12, minHeight: 300 }}>
          <ul className="history-list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <button className={entry.id === selected ? 'selected' : undefined} onClick={() => setSelected(entry.id)}>
                  {new Date(entry.at).toLocaleString('it-IT')}
                  <span className="hint">{entry.size} B</span>
                </button>
              </li>
            ))}
          </ul>
          <pre className="history-preview">{content}</pre>
        </div>
      )}
    </Modal>
  )
}
