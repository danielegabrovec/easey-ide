// Pannello della Scrittura rapida: barra (linguaggio, titolo, livello di aiuto, Esegui, Salva…),
// raccolta dei salvataggi a sinistra, editor al centro, risultati a destra. Nessun progetto richiesto.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { IDockviewPanelProps } from 'dockview'
import * as monaco from 'monaco-editor'
import {
  Maximize2,
  Minimize2,
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  FilePlus2,
  FolderOpen,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RotateCcw,
  Save,
  Sparkles,
  Square,
  Timer,
  Trash2,
  X,
  Zap
} from 'lucide-react'
import type { CellValue, QueryOutcome } from '@shared/contracts/db'
import { ASSIST_LEVEL_ORDER, type AssistLevel, type QuickLanguage, type QuickRunEvent } from '@shared/contracts/quick'
import { SAMPLE_DATABASES } from '@shared/sql/samples'
import { ide } from '../../ipc'
import { executeCommand } from '../../workbench/commands'
import { dockApi } from '../../workbench/layout'
import { useWorkbench, workbench } from '../../workbench/store'
import { updateSettings } from '../../workbench/workbench-commands'
import { t } from '../../i18n'
import { copyQuick, deleteSnippet, exportQuick, newQuick, openSnippet, renameQuick, saveQuick, selectLanguage } from './actions'
import { useAssistBusy } from './assist'
import { cancelGeneration, generateWithAi } from './generate'
import { createQuickEditor, disposeQuickEditor, levelOptions, quickEditor, revealLine } from './quick-editor'
import { isDirty, quick, useQuick } from './quick-store'
import { loadSqlSchema, pageLoaded, resetSqlDatabase, runQuick, scheduleAutoRun, stopQuick } from './run'

const LANGUAGES: { id: QuickLanguage; label: string }[] = [
  { id: 'javascript', label: 'JS' },
  { id: 'typescript', label: 'TS' },
  { id: 'python', label: 'Python' },
  { id: 'sql', label: 'SQL' },
  { id: 'html', label: 'HTML' }
]

const BADGES: Record<QuickLanguage, string> = { javascript: 'JS', typescript: 'TS', python: 'PY', sql: 'SQL', html: 'HTML' }

const LEVEL_LABEL: Record<AssistLevel, () => string> = {
  off: () => t('quick.levelOff'),
  light: () => t('quick.levelLight'),
  medium: () => t('quick.levelMedium'),
  strong: () => t('quick.levelStrong')
}
const LEVEL_HINT: Record<AssistLevel, () => string> = {
  off: () => t('quick.levelOffHint'),
  light: () => t('quick.levelLightHint'),
  medium: () => t('quick.levelMediumHint'),
  strong: () => t('quick.levelStrongHint')
}

function readLocal(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* archiviazione non disponibile */
  }
}

function setQuickSettings(patch: Partial<ReturnType<typeof workbench>['settings']['quick']>): Promise<void> {
  return updateSettings({ quick: { ...workbench().settings.quick, ...patch } })
}

function relativeTime(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60000)
  if (minutes < 1) return t('quick.justNow')
  if (minutes < 60) return t('quick.minutesAgo', { n: minutes })
  const date = new Date(at)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return date.toLocaleDateString()
}

/** Tutta finestra ⇄ disposizione normale dei pannelli. */
function MaximizeToggle({ api }: { api: IDockviewPanelProps['api'] }) {
  const [maximized, setMaximized] = useState(() => api.isMaximized())
  useEffect(() => {
    const sub = dockApi()?.onDidMaximizedGroupChange(() => setMaximized(api.isMaximized()))
    setMaximized(api.isMaximized())
    return () => sub?.dispose()
  }, [api])
  return (
    <button
      className="icon-btn"
      onClick={() => (api.isMaximized() ? api.exitMaximized() : api.maximize())}
      title={maximized ? t('quick.restoreLayout') : t('quick.maximize')}
      data-testid="quick-maximize"
    >
      {maximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
    </button>
  )
}

function Toolbar({ api }: { api: IDockviewPanelProps['api'] }) {
  const language = useQuick((s) => s.language)
  const title = useQuick((s) => s.docs[s.language].title)
  const dirty = useQuick((s) => isDirty(s.docs[s.language], s.language))
  const saved = useQuick((s) => s.docs[s.language].snippetId !== null)
  const running = useQuick((s) => (s.language === 'sql' ? s.sqlRunning : s.language !== 'html' && s.runId !== null && s.summary === null))
  const generating = useQuick((s) => s.generating)
  const level = useWorkbench((s) => s.settings.quick.level)
  const autoRun = useWorkbench((s) => s.settings.quick.autoRun)
  const aiBusy = useAssistBusy((s) => s.busy > 0)
  const [draft, setDraft] = useState(title)
  useEffect(() => setDraft(title), [title, language])

  return (
    <div className="quick-toolbar">
      <span className="quick-brand">
        <Zap size={15} /> {t('quick.brand')}
      </span>
      <div className="segmented" role="tablist" aria-label={t('quick.language')}>
        {LANGUAGES.map((l) => (
          <button key={l.id} className={language === l.id ? 'active' : ''} onClick={() => void selectLanguage(l.id)} data-quick-language={l.id} role="tab" aria-selected={language === l.id}>
            {l.label}
          </button>
        ))}
      </div>
      <input
        className="quick-title"
        value={draft}
        placeholder={t('quick.untitled')}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void renameQuick(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            setDraft(title)
            quickEditor()?.focus()
          }
        }}
        spellCheck={false}
        data-testid="quick-title"
        title={saved ? t('quick.titleSavedHint') : t('quick.titleHint')}
      />
      {dirty && (
        <span className="quick-dirty" title={t('quick.unsaved')} data-testid="quick-dirty">
          ●
        </span>
      )}
      <span className="spacer" />
      <div className="segmented quick-levels" title={t('quick.levelTitle')} data-testid="quick-levels">
        {ASSIST_LEVEL_ORDER.map((l) => (
          <button key={l} className={level === l ? 'active' : ''} title={LEVEL_HINT[l]()} onClick={() => void setQuickSettings({ level: l })} data-level={l}>
            {LEVEL_LABEL[l]()}
          </button>
        ))}
      </div>
      {aiBusy && <Loader2 size={14} className="spin quick-ai-busy" aria-label={t('quick.aiThinking')} />}
      <button className="btn ghost" onClick={() => quick().setPromptOpen(true)} disabled={generating} title={`${t('quick.generate')} (Ctrl+I)`} data-testid="quick-generate">
        <Sparkles size={14} /> {t('quick.generateShort')}
      </button>
      <label className="quick-auto" title={t('quick.autoRunHint')}>
        <input type="checkbox" checked={autoRun} onChange={(e) => void setQuickSettings({ autoRun: e.target.checked })} data-testid="quick-autorun" />
        {t('quick.autoRun')}
      </label>
      {running ? (
        <button className="btn danger" onClick={() => stopQuick()} title={t('quick.stop')} data-testid="quick-stop" disabled={language === 'sql'}>
          <Square size={13} fill="currentColor" /> {t('quick.stop')}
        </button>
      ) : (
        <button className="btn run" onClick={() => void runQuick(false)} title={`${t('quick.run')} (Ctrl+Enter)`} data-testid="quick-run">
          <Play size={13} fill="currentColor" /> {t('quick.run')}
        </button>
      )}
      <button className="btn" onClick={() => void saveQuick(false)} title={`${t('quick.save')} (Ctrl+S)`} data-testid="quick-save">
        <Save size={14} /> {t('quick.save')}
      </button>
      <button className="icon-btn" onClick={() => void saveQuick(true)} title={t('quick.saveCopy')} data-testid="quick-save-copy">
        <Copy size={15} />
      </button>
      <button className="icon-btn" onClick={() => void exportQuick()} title={t('quick.export')}>
        <Download size={15} />
      </button>
      <MaximizeToggle api={api} />
    </div>
  )
}

function PromptBar() {
  const open = useQuick((s) => s.promptOpen)
  const generating = useQuick((s) => s.generating)
  const language = useQuick((s) => s.language)
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])
  if (!open) return null
  const close = () => {
    if (generating) cancelGeneration()
    quick().setPromptOpen(false)
    quickEditor()?.focus()
  }
  const submit = async () => {
    if (!text.trim() || generating) return
    const ok = await generateWithAi(text)
    if (ok) {
      setText('')
      quick().setPromptOpen(false)
    }
  }
  return (
    <div className="quick-prompt">
      <Sparkles size={15} />
      <input
        ref={input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit()
          if (e.key === 'Escape') close()
        }}
        placeholder={t(language === 'sql' ? 'quick.promptPlaceholderSql' : 'quick.promptPlaceholder')}
        disabled={generating}
        spellCheck={false}
        data-testid="quick-prompt"
      />
      {generating ? (
        <span className="hint">
          <Loader2 size={13} className="spin" /> {t('quick.generating')}
        </span>
      ) : (
        <button className="btn primary" onClick={() => void submit()} disabled={!text.trim()}>
          {t('quick.generateGo')}
        </button>
      )}
      <button className="icon-btn" onClick={close} title={t('common.cancel')}>
        <X size={15} />
      </button>
    </div>
  )
}

function SqlBar() {
  const settings = useWorkbench((s) => s.settings.quick)
  const schema = useQuick((s) => s.schemas[settings.sqlEngine])
  return (
    <div className="quick-sqlbar">
      <label>
        {t('quick.sqlEngine')}
        <select
          value={settings.sqlEngine}
          onChange={async (e) => {
            await setQuickSettings({ sqlEngine: e.target.value as 'sqlite' | 'postgres' })
            await loadSqlSchema()
          }}
          data-testid="quick-sql-engine"
        >
          <option value="sqlite">SQLite</option>
          <option value="postgres">PostgreSQL (PGlite)</option>
        </select>
      </label>
      <label>
        {t('quick.sqlSample')}
        <select
          value={settings.sqlSample ?? ''}
          onChange={async (e) => {
            await setQuickSettings({ sqlSample: e.target.value || null })
            await resetSqlDatabase()
          }}
          data-testid="quick-sql-sample"
        >
          <option value="">{t('quick.sqlNoSample')}</option>
          {SAMPLE_DATABASES.map((s) => (
            <option key={s.id} value={s.id} title={s.description}>
              {s.title}
            </option>
          ))}
        </select>
      </label>
      <label className="quick-check" title={t('quick.sqlFreshHint')}>
        <input type="checkbox" checked={settings.sqlFresh} onChange={(e) => void setQuickSettings({ sqlFresh: e.target.checked })} data-testid="quick-sql-fresh" />
        {t('quick.sqlFresh')}
      </label>
      <button className="btn ghost" onClick={() => void resetSqlDatabase()} title={t('quick.sqlResetHint')}>
        <RotateCcw size={13} /> {t('quick.sqlReset')}
      </button>
      <div className="quick-tables" data-testid="quick-sql-tables">
        {(schema?.tables ?? []).map((table) => (
          <span key={table.name} className="quick-table-chip" title={table.columns.map((c) => `${c.name} ${c.type}`).join('\n')}>
            {table.name}
            <small>{table.rowCount ?? ''}</small>
          </span>
        ))}
        {schema && schema.tables.length === 0 && <span className="hint">{t('quick.sqlEmpty')}</span>}
      </div>
    </div>
  )
}

function Collection({ onCollapse }: { onCollapse: () => void }) {
  const snippets = useQuick((s) => s.snippets)
  const currentId = useQuick((s) => s.docs[s.language].snippetId)
  const [filter, setFilter] = useState('')
  const shown = useMemo(() => snippets.filter((s) => s.title.toLowerCase().includes(filter.trim().toLowerCase())), [snippets, filter])
  return (
    <aside className="quick-collection" data-testid="quick-collection">
      <header>
        <span>{t('quick.collection')}</span>
        <button className="icon-btn" onClick={() => void newQuick()} title={t('quick.new')} data-testid="quick-new">
          <FilePlus2 size={15} />
        </button>
        <button className="icon-btn" onClick={() => void ide.invoke('quick:revealFolder')} title={t('quick.openFolder')}>
          <FolderOpen size={15} />
        </button>
        <button className="icon-btn" onClick={onCollapse} title={t('quick.hideCollection')}>
          <PanelLeftClose size={15} />
        </button>
      </header>
      {snippets.length > 4 && <input className="quick-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('quick.filter')} spellCheck={false} />}
      <ul>
        {shown.map((snippet) => (
          <li key={snippet.id} className={snippet.id === currentId ? 'active' : ''}>
            <button className="quick-snippet" onClick={() => void openSnippet(snippet.id)} title={snippet.id} data-snippet={snippet.id}>
              <span className={`quick-lang-badge ${snippet.language}`}>{BADGES[snippet.language]}</span>
              <span className="name">{snippet.title}</span>
              <span className="when">{relativeTime(snippet.updatedAt)}</span>
            </button>
            <button className="icon-btn quick-delete" onClick={() => void deleteSnippet(snippet.id)} title={t('quick.delete')} data-delete-snippet={snippet.id}>
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>
      {snippets.length === 0 && <p className="hint quick-collection-empty">{t('quick.collectionEmpty')}</p>}
    </aside>
  )
}

function LineBadge({ line }: { line?: number }) {
  if (!line) return <span className="quick-line" />
  return (
    <button className="quick-line" onClick={() => revealLine(line)} title={t('quick.goToLine', { line })}>
      {line}
    </button>
  )
}

function askAiAboutError(message: string, line?: number): void {
  const code = quickEditor()?.getValue() ?? ''
  const language = quick().language
  void executeCommand('ai.ask', {
    prompt: `${t('quick.askError', { message, line: line ?? '?' })}\n\n\`\`\`${language}\n${code.slice(0, 10000)}\n\`\`\``,
    display: t('quick.askErrorDisplay', { message: message.slice(0, 80) })
  })
}

function EventRow({ event }: { event: QuickRunEvent }) {
  if (event.kind === 'log') {
    return (
      <div className={`quick-out log level-${event.level}`}>
        <LineBadge line={event.line} />
        <pre>{event.text}</pre>
      </div>
    )
  }
  if (event.kind === 'value') {
    return (
      <div className="quick-out value">
        <LineBadge line={event.line} />
        <pre>
          {event.name && <span className="quick-name">{event.name} = </span>}
          {event.text}
        </pre>
      </div>
    )
  }
  if (event.kind === 'error') {
    return (
      <div className="quick-out error" data-testid="quick-error">
        <LineBadge line={event.line} />
        <div>
          <pre>
            {event.phase === 'syntax' && <strong>{t('quick.syntaxError')} </strong>}
            {event.message}
          </pre>
          <button className="btn ghost small" onClick={() => askAiAboutError(event.message, event.line)}>
            <Sparkles size={12} /> {t('quick.askAi')}
          </button>
        </div>
      </div>
    )
  }
  return null
}

function Summary() {
  const summary = useQuick((s) => s.summary)
  const runId = useQuick((s) => s.runId)
  const timeoutMs = useWorkbench((s) => s.settings.quick.timeoutMs)
  if (!runId) return null
  if (!summary)
    return (
      <span className="quick-status running" data-testid="quick-status" data-status="running">
        <Loader2 size={13} className="spin" /> {t('quick.running')}
      </span>
    )
  const text: Record<string, ReactNode> = {
    ok: (
      <>
        <CheckCircle2 size={13} /> {t('quick.statusOk', { ms: summary.durationMs.toFixed(0) })}
      </>
    ),
    error: (
      <>
        <AlertCircle size={13} /> {t('quick.statusError')}
      </>
    ),
    timeout: (
      <>
        <Timer size={13} /> {t('quick.statusTimeout', { s: (timeoutMs / 1000).toString() })}
      </>
    ),
    stopped: (
      <>
        <Square size={11} /> {t('quick.statusStopped')}
      </>
    )
  }
  return (
    <span className={`quick-status ${summary.status}`} data-testid="quick-status" data-status={summary.status}>
      {text[summary.status]}
    </span>
  )
}

function CodeOutput() {
  const events = useQuick((s) => s.events)
  const summary = useQuick((s) => s.summary)
  const auto = useQuick((s) => s.runAuto)
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [events.length])
  // In esecuzione automatica un errore di sintassi è "sto ancora scrivendo": si mostra smorzato.
  const softSyntax = auto && events.length === 1 && events[0]!.kind === 'error' && events[0]!.phase === 'syntax'
  return (
    <div className={`quick-output-list${softSyntax ? ' soft' : ''}`} ref={list} data-testid="quick-output">
      {events.length === 0 && !summary && <p className="hint quick-empty">{t('quick.outputEmpty')}</p>}
      {events.length === 0 && summary?.status === 'ok' && <p className="hint quick-empty">{t('quick.outputNothing')}</p>}
      {events.map((event, index) => (
        <EventRow key={index} event={event} />
      ))}
      {summary?.status === 'timeout' && <p className="quick-out error">{t('quick.timeoutExplain')}</p>}
      {summary?.truncated && <p className="hint">{t('quick.truncated')}</p>}
    </div>
  )
}

/** HTML: la pagina viva (origine ide-preview://quick, separata dall'IDE) e, sotto, la sua console. */
function PageOutput() {
  const url = useQuick((s) => s.pageUrl)
  return (
    <div className="quick-page-wrap">
      {url ? (
        <iframe
          className="quick-page"
          data-testid="quick-page"
          src={url}
          title={t('quick.pageTitle')}
          sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
          onLoad={() => pageLoaded()}
        />
      ) : (
        <p className="hint quick-empty">{t('quick.outputEmpty')}</p>
      )}
      <div className="quick-page-console">
        <CodeOutput />
      </div>
    </div>
  )
}

function Cell({ value }: { value: CellValue }) {
  if (value === null) return <td className="null">NULL</td>
  if (typeof value === 'number') return <td className="num">{value}</td>
  if (typeof value === 'boolean') return <td className="num">{value ? 'true' : 'false'}</td>
  return <td title={value.length > 60 ? value : undefined}>{value}</td>
}

function SqlOutcome({ outcome }: { outcome: QueryOutcome }) {
  const statement = outcome.statement.replace(/\s+/g, ' ').trim()
  return (
    <section className="quick-sql-outcome">
      <header title={outcome.statement}>{statement.length > 90 ? `${statement.slice(0, 89)}…` : statement}</header>
      {outcome.kind === 'error' ? (
        <div className="sql-error" data-testid="quick-sql-error">
          <AlertCircle size={15} />
          <div>
            <strong>{outcome.message}</strong>
            <button className="btn ghost small" onClick={() => askAiAboutError(outcome.message)}>
              <Sparkles size={12} /> {t('quick.askAi')}
            </button>
          </div>
        </div>
      ) : outcome.columns.length === 0 ? (
        <div className="sql-message">
          <CheckCircle2 size={15} color="var(--success)" />
          {t('sql.done', { changes: outcome.changes, ms: outcome.durationMs.toFixed(1) })}
        </div>
      ) : (
        <div className="sql-grid-wrap">
          <table className="sql-grid" data-testid="quick-sql-grid">
            <thead>
              <tr>
                <th className="rownum">#</th>
                {outcome.columns.map((c, i) => (
                  <th key={i}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {outcome.rows.slice(0, 500).map((row, r) => (
                <tr key={r}>
                  <td className="rownum">{r + 1}</td>
                  {row.map((v, c) => (
                    <Cell key={c} value={v} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {outcome.rows.length === 0 && <div className="hint quick-empty">{t('sql.noRows')}</div>}
          {outcome.rows.length > 500 && <div className="hint quick-empty">{t('quick.sqlMoreRows', { count: outcome.rows.length })}</div>}
        </div>
      )}
    </section>
  )
}

function SqlOutput() {
  const sql = useQuick((s) => s.sql)
  const running = useQuick((s) => s.sqlRunning)
  // Le istruzioni senza righe (CREATE, INSERT…) si riassumono; si mostrano per intero le SELECT e gli errori.
  const outcomes = sql?.outcomes ?? []
  const silent = outcomes.filter((o) => o.kind === 'result' && o.columns.length === 0)
  const shown = outcomes.filter((o) => o.kind === 'error' || o.columns.length > 0)
  return (
    <div className="quick-output-list" data-testid="quick-output">
      {running && (
        <p className="hint">
          <Loader2 size={13} className="spin" /> {t('quick.running')}
        </p>
      )}
      {!sql && !running && <p className="hint quick-empty">{t('quick.outputEmptySql')}</p>}
      {silent.length > 0 && <p className="hint quick-sql-silent">{t('quick.sqlSilent', { count: silent.length, changes: silent.reduce((n, o) => n + (o.kind === 'result' ? o.changes : 0), 0) })}</p>}
      {[...shown].reverse().map((outcome, index) => (
        <SqlOutcome key={index} outcome={outcome} />
      ))}
    </div>
  )
}

function SqlSummary() {
  const sql = useQuick((s) => s.sql)
  if (!sql) return null
  const failed = sql.outcomes.some((o) => o.kind === 'error')
  return (
    <span className={`quick-status ${failed ? 'error' : 'ok'}`} data-testid="quick-status" data-status={failed ? 'error' : 'ok'}>
      {failed ? <AlertCircle size={13} /> : <CheckCircle2 size={13} />} {failed ? t('quick.statusError') : t('quick.statusOk', { ms: sql.durationMs.toFixed(0) })}
    </span>
  )
}

export function QuickPanel({ api }: IDockviewPanelProps) {
  const host = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const language = useQuick((s) => s.language)
  const fontSize = useWorkbench((s) => s.settings.fontSize)
  const theme = useWorkbench((s) => s.settings.theme)
  const level = useWorkbench((s) => s.settings.quick.level)
  const [showCollection, setShowCollection] = useState(() => readLocal('easey.quick.collection', '1') === '1')
  const [split, setSplit] = useState(() => Number(readLocal('easey.quick.split', '42')) || 42)

  useEffect(() => {
    if (!host.current) return
    const state = quick()
    const editor = createQuickEditor(host.current, state.language, state.docs[state.language].content, { fontSize: workbench().settings.fontSize, level: workbench().settings.quick.level })
    const changes = editor.onDidChangeModelContent(() => {
      const model = editor.getModel()
      if (!model) return
      quick().setContent(model.getLanguageId() as QuickLanguage, model.getValue())
      scheduleAutoRun()
    })
    void quick().refreshSnippets()
    if (state.language === 'sql') void loadSqlSchema()
    if (state.language === 'python') void ide.invoke('quick:prepare', 'python')
    editor.focus()
    // Prima esecuzione: si vede subito che cosa fa il codice.
    void runQuick(true)
    const active = api.onDidActiveChange((event) => {
      if (event.isActive) setTimeout(() => quickEditor()?.focus(), 0)
    })
    return () => {
      changes.dispose()
      active.dispose()
      disposeQuickEditor()
    }
  }, [api])

  useEffect(() => {
    quickEditor()?.updateOptions({ fontSize })
  }, [fontSize])

  // Senza progetto non c'è nessun editor dei file che imposti il tema di Monaco: lo si fa qui.
  useEffect(() => {
    monaco.editor.setTheme(theme === 'dark' ? 'lab-dark' : 'lab-light')
  }, [theme])

  useEffect(() => {
    quickEditor()?.updateOptions(levelOptions(level))
  }, [level])

  const startDrag = (event: React.MouseEvent) => {
    event.preventDefault()
    const rect = body.current?.getBoundingClientRect()
    if (!rect) return
    const move = (e: MouseEvent) => {
      const percent = Math.min(70, Math.max(20, ((rect.right - e.clientX) / rect.width) * 100))
      setSplit(percent)
    }
    const up = (e: MouseEvent) => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      writeLocal('easey.quick.split', String(Math.round(Math.min(70, Math.max(20, ((rect.right - e.clientX) / rect.width) * 100)))))
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const toggleCollection = (show: boolean) => {
    setShowCollection(show)
    writeLocal('easey.quick.collection', show ? '1' : '0')
  }

  return (
    <div className="panel quick-panel" data-testid="quick-panel" data-language={language} data-level={level}>
      <Toolbar api={api} />
      <PromptBar />
      {language === 'sql' && <SqlBar />}
      <div className="quick-body" ref={body}>
        {showCollection ? (
          <Collection onCollapse={() => toggleCollection(false)} />
        ) : (
          <button className="quick-collection-open icon-btn" onClick={() => toggleCollection(true)} title={t('quick.showCollection')}>
            <PanelLeftOpen size={15} />
          </button>
        )}
        <div className="quick-editor" ref={host} data-testid="quick-editor" />
        <div className="quick-splitter" onMouseDown={startDrag} role="separator" aria-orientation="vertical" />
        <div className="quick-output" style={{ width: `${split}%` }}>
          <header>
            <span>{t('quick.output')}</span>
            {language === 'sql' ? <SqlSummary /> : <Summary />}
            <span className="spacer" />
            <button className="icon-btn" onClick={() => void copyQuick()} title={t('quick.copy')}>
              <Copy size={14} />
            </button>
          </header>
          {language === 'sql' ? <SqlOutput /> : language === 'html' ? <PageOutput /> : <CodeOutput />}
        </div>
      </div>
    </div>
  )
}
