// Nuovo database del progetto: motore, nome, dati d'esempio.
import { useEffect, useState } from 'react'
import type { DbEngine } from '@shared/contracts/db'
import { ide } from '../../ipc'
import { Modal } from '../../ui/dialogs'
import { notify, notifyError } from '../../workbench/notifications'
import { t } from '../../i18n'
import { useSql } from './sql-store'

export function NewDatabaseDialog({ close }: { close: () => void }) {
  const [engine, setEngine] = useState<DbEngine>('sqlite')
  const [name, setName] = useState('negozio')
  const [sample, setSample] = useState<string>('negozio')
  const [samples, setSamples] = useState<{ id: string; title: string; description: string }[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void ide.invoke('db:samples').then(setSamples)
  }, [])

  const create = async () => {
    setBusy(true)
    try {
      const info = await ide.invoke('db:create', { engine, name, sample: sample || null })
      await useSql.getState().refresh()
      useSql.getState().setActive(info.id)
      notify(t('sql.dbCreated', { name: info.name }), 'success')
      close()
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('sql.newDbTitle')}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" disabled={busy || !name.trim()} onClick={create} data-testid="db-create">
            {busy ? t('common.loading') : t('sql.createDb')}
          </button>
        </>
      }
    >
      <div className="field">
        <label>{t('sql.engine')}</label>
        <div className="template-grid" role="radiogroup">
          {(['sqlite', 'postgres'] as const).map((value) => (
            <button key={value} role="radio" aria-checked={engine === value} className={`template-card${engine === value ? ' selected' : ''}`} onClick={() => setEngine(value)} data-engine={value}>
              <span>
                <strong>{value === 'sqlite' ? 'SQLite' : 'PostgreSQL'}</strong>
                <span className="hint" style={{ display: 'block', marginTop: 3 }}>
                  {value === 'sqlite' ? t('sql.sqliteHint') : t('sql.postgresHint')}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>{t('sql.dbName')}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} data-testid="db-name" />
      </div>
      <div className="field">
        <label>{t('sql.sample')}</label>
        <select value={sample} onChange={(e) => setSample(e.target.value)} data-testid="db-sample">
          <option value="">{t('sql.sampleNone')}</option>
          {samples.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title} — {s.description}
            </option>
          ))}
        </select>
      </div>
    </Modal>
  )
}
