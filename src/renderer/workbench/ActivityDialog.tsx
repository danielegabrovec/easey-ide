// Registro delle attività: le ultime 200 notifiche con l'ora, dalla più recente, copiabili.
import { useEffect, useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Copy, Info } from 'lucide-react'
import { activityEntryText, activityText, formatActivityTime, type ActivityEntry, type ActivityKind } from '@shared/activity-log'
import { Modal } from '../ui/dialogs'
import { t } from '../i18n'
import type { MessageKey } from '../i18n/it'
import { useActivity } from './activity'

const KIND_LABEL: Record<ActivityKind, MessageKey> = { info: 'activity.kindInfo', success: 'activity.kindSuccess', warning: 'activity.kindWarning', error: 'activity.kindError' }

function KindIcon({ kind }: { kind: ActivityKind }) {
  if (kind === 'error') return <AlertCircle size={14} color="var(--danger)" />
  if (kind === 'warning') return <AlertTriangle size={14} color="var(--warning)" />
  if (kind === 'success') return <CheckCircle2 size={14} color="var(--success)" />
  return <Info size={14} color="var(--info)" />
}

const copy = (text: string) => void navigator.clipboard?.writeText(text).catch(() => undefined)

function Entry({ entry }: { entry: ActivityEntry }) {
  const [open, setOpen] = useState(false)
  const more = !!entry.details && entry.details !== entry.message
  return (
    <li className={`activity-entry ${entry.kind}`} data-testid="activity-entry" data-kind={entry.kind}>
      <div className="activity-head">
        <KindIcon kind={entry.kind} />
        <span className="activity-time">{formatActivityTime(entry.at).slice(11)}</span>
        <span className="activity-kind">{t(KIND_LABEL[entry.kind])}</span>
        {entry.source && <span className="activity-source">{entry.source}</span>}
        <span style={{ flex: 1 }} />
        {more && (
          <button className="icon-btn" title={open ? t('toast.hideDetails') : t('toast.details')} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
        <button className="icon-btn" title={t('toast.copy')} onClick={() => copy(activityEntryText(entry))}>
          <Copy size={13} />
        </button>
      </div>
      {entry.title && entry.title !== entry.message && <strong className="activity-title">{entry.title}</strong>}
      <div className="activity-message">{entry.message}</div>
      {open && entry.details && <pre className="activity-details">{entry.details}</pre>}
    </li>
  )
}

export function ActivityDialog({ close }: { close: () => void }) {
  const entries = useActivity((s) => s.entries)
  useEffect(() => {
    useActivity.getState().markSeen()
  }, [entries])
  const newestFirst = [...entries].reverse()
  return (
    <Modal
      title={t('activity.title')}
      onClose={close}
      wide
      footer={
        <>
          <button className="btn" disabled={!entries.length} onClick={() => useActivity.getState().clear()}>
            {t('activity.clear')}
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn" disabled={!entries.length} onClick={() => copy(activityText(entries))} data-testid="activity-copy-all">
            <Copy size={13} /> {t('activity.copyAll')}
          </button>
          <button className="btn primary" onClick={close}>
            {t('common.close')}
          </button>
        </>
      }
    >
      {newestFirst.length === 0 ? (
        <p className="hint">{t('activity.empty')}</p>
      ) : (
        <ul className="activity-list" data-testid="activity-list">
          {newestFirst.map((entry) => (
            <Entry key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </Modal>
  )
}
