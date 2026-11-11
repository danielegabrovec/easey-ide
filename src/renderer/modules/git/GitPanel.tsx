// Pannello Git: inizializza, file modificati (clic = differenze), commit e cronologia.
import { useEffect, useRef, useState } from 'react'
import { GitBranch, GitCommitHorizontal, RefreshCw, Undo2 } from 'lucide-react'
import { create } from 'zustand'
import * as monaco from 'monaco-editor'
import type { IDockviewPanelProps } from 'dockview'
import type { GitCommit, GitStatus } from '@shared/contracts/git'
import { extensionOf } from '@shared/paths'
import { ide } from '../../ipc'
import { executeCommand } from '../../workbench/commands'
import { showPanel } from '../../workbench/layout'
import { notify, notifyError } from '../../workbench/notifications'
import { useWorkbench, workbench } from '../../workbench/store'
import { confirm } from '../../ui/dialogs'
import { t } from '../../i18n'

interface GitState {
  status: GitStatus | null
  log: GitCommit[]
  busy: boolean
  refresh: () => Promise<void>
}

export const useGit = create<GitState>((set) => ({
  status: null,
  log: [],
  busy: false,
  refresh: async () => {
    if (!workbench().project) {
      set({ status: null, log: [] })
      return
    }
    try {
      const status = await ide.invoke('git:status')
      const log = status.repo ? await ide.invoke('git:log') : []
      set({ status, log })
    } catch (error) {
      notifyError(error)
    }
  }
}))

export function openDiff(path: string): void {
  showPanel({ id: `git-diff:${path}`, component: 'git-diff', title: `Δ ${path.slice(path.lastIndexOf('/') + 1)}`, area: 'center', params: { path } })
}

const when = (iso: string) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

export function GitPanel() {
  const project = useWorkbench((s) => s.project?.root)
  const status = useGit((s) => s.status)
  const log = useGit((s) => s.log)
  const busy = useGit((s) => s.busy)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void useGit.getState().refresh()
  }, [project])

  const commit = async () => {
    useGit.setState({ busy: true })
    try {
      const hash = await ide.invoke('git:commit', message)
      setMessage('')
      notify(t('git.committed', { hash }), 'success')
      await useGit.getState().refresh()
    } catch (error) {
      notifyError(error)
    } finally {
      useGit.setState({ busy: false })
    }
  }

  if (!project) return <div className="panel git-panel hint pad">{t('git.noProject')}</div>
  if (!status) return <div className="panel git-panel hint pad">{t('common.loading')}</div>
  if (!status.available)
    return (
      <div className="panel git-panel pad">
        <p className="hint">{t('git.notInstalled')}</p>
        <button className="btn" onClick={() => executeCommand('app.openUrl', { url: 'https://git-scm.com/downloads' })}>
          git-scm.com
        </button>
      </div>
    )
  if (!status.repo)
    return (
      <div className="panel git-panel pad" data-testid="git-panel">
        <p className="hint">{t('git.notRepo')}</p>
        <button
          className="btn primary"
          data-testid="git-init"
          onClick={async () => {
            try {
              await ide.invoke('git:init')
              await useGit.getState().refresh()
            } catch (error) {
              notifyError(error)
            }
          }}
        >
          <GitBranch size={14} /> {t('git.init')}
        </button>
      </div>
    )

  const changes = status.changes
  return (
    <div className="panel git-panel" data-testid="git-panel">
      <div className="git-head">
        <GitBranch size={14} />
        <strong data-testid="git-branch">{status.branch ?? t('git.detached')}</strong>
        <span className="hint">{t('git.changes', { n: changes.length })}</span>
        <button className="icon-btn" title={t('git.refresh')} onClick={() => useGit.getState().refresh()}>
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="git-commit">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t('git.messagePlaceholder')}
          rows={2}
          data-testid="git-message"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.ctrlKey && message.trim() && changes.length) void commit()
          }}
        />
        <button className="btn primary" disabled={busy || !message.trim() || changes.length === 0} onClick={commit} data-testid="git-commit" title="Ctrl+Invio">
          <GitCommitHorizontal size={14} /> {t('git.commit', { n: changes.length })}
        </button>
      </div>
      <div className="git-section">{t('git.changesTitle')}</div>
      {changes.length === 0 && <div className="hint pad-x">{t('git.clean')}</div>}
      <ul className="git-changes">
        {changes.map((change) => (
          <li key={change.path}>
            <button onClick={() => openDiff(change.path)} title={`${change.path} — ${change.status}`} data-git-file={change.path}>
              <span className={`git-letter git-${change.letter === '?' ? 'u' : change.letter.toLowerCase()}`}>{change.letter === '?' ? 'U' : change.letter}</span>
              <span className="git-path">{change.path}</span>
            </button>
            {change.letter !== '?' && change.letter !== 'A' && (
              <button
                className="icon-btn"
                title={t('git.discard')}
                onClick={async () => {
                  if (!(await confirm({ title: t('git.discard'), message: t('git.discardConfirm', { path: change.path }), confirmLabel: t('git.discard'), danger: true }))) return
                  try {
                    await ide.invoke('git:discard', change.path)
                    await useGit.getState().refresh()
                  } catch (error) {
                    notifyError(error)
                  }
                }}
              >
                <Undo2 size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="git-section">{t('git.history')}</div>
      {log.length === 0 && <div className="hint pad-x">{t('git.noCommits')}</div>}
      <ul className="git-log" data-testid="git-log">
        {log.map((c) => (
          <li key={c.hash} title={`${c.hash}\n${c.author}`}>
            <code>{c.short}</code>
            <span className="git-msg">{c.message}</span>
            <span className="hint">{when(c.date)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function languageFor(path: string): string | undefined {
  const ext = `.${extensionOf(path)}`
  return monaco.languages.getLanguages().find((l) => l.extensions?.includes(ext))?.id
}

/** Differenze fra l'ultimo commit (sinistra) e il file su disco (destra). */
export function GitDiffPanel({ params }: IDockviewPanelProps<{ path: string }>) {
  const host = useRef<HTMLDivElement>(null)
  const [info, setInfo] = useState('')
  useEffect(() => {
    if (!host.current) return
    let disposed = false
    const editor = monaco.editor.createDiffEditor(host.current, { readOnly: true, originalEditable: false, automaticLayout: true, renderSideBySide: true, minimap: { enabled: false }, scrollBeyondLastLine: false })
    const language = languageFor(params.path)
    const original = monaco.editor.createModel('', language)
    const modified = monaco.editor.createModel('', language)
    editor.setModel({ original, modified })
    void (async () => {
      const [before, after] = await Promise.all([ide.invoke('git:original', params.path).catch(() => null), ide.invoke('workspace:readFile', params.path).catch(() => null)])
      if (disposed) return
      original.setValue(before ?? '')
      modified.setValue(after ?? '')
      setInfo(before === null ? t('git.diffNew') : after === null ? t('git.diffDeleted') : t('git.diffInfo'))
    })()
    return () => {
      disposed = true
      editor.dispose()
      original.dispose()
      modified.dispose()
    }
  }, [params.path])
  return (
    <div className="panel git-diff" data-testid="git-diff">
      <div className="git-diff-bar hint">
        <code>{params.path}</code> · {info}
      </div>
      <div ref={host} className="git-diff-host" />
    </div>
  )
}
