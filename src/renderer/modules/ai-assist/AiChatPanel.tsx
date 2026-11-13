// Chat dell'assistente AI nel pannello laterale destro (come la chat di VS Code): legge il documento
// aperto (chip dal vivo: file, selezione, problemi), e ogni blocco di codice delle risposte si copia,
// si inserisce al cursore o si applica al documento dopo il confronto prima/dopo.
import { useEffect, useRef, useState } from 'react'
import * as monaco from 'monaco-editor'
import { Bot, Copy, CornerDownLeft, FileCode2, GraduationCap, Maximize2, Minimize2, Plus, RefreshCw, Sparkles, Square, TriangleAlert, Wand2, X } from 'lucide-react'
import { pickChatModel } from '@shared/contracts/ai'
import type { EditorContext } from '@shared/contracts/editor'
import { keepTrailingNewline, resolveApplyTarget, selectionLineSpan, type ChatContextSnapshot } from '@shared/ai/chat-context'
import { parseSlash, slashSuggestions } from '@shared/ai/slash'
import { basenameOf } from '@shared/paths'
import { executeCommand } from '../../workbench/commands'
import { notify } from '../../workbench/notifications'
import { useSidePanel } from '../../workbench/side-panel'
import { useWorkbench } from '../../workbench/store'
import { updateSettings } from '../../workbench/workbench-commands'
import { openDialog } from '../../ui/dialogs'
import { useAi } from '../../services/ai-client'
import { t } from '../../i18n'
import { useChat, type ChatMessage } from './chat-store'
import { DiffDialog } from './DiffDialog'
import { promptWithContext, QUICK_ACTION_LABEL, quickAction, snapshotOf } from './quick-actions'
import { Markdown } from '../../ui/Markdown'

/** Ultima richiesta di fuoco già servita (Ctrl+Shift+A): riaprire con Ctrl+Alt+B non ruba il fuoco. */
let handledFocusRequest = 0

/** «Applica al documento»: destinazione dal documento catturato all'invio, confronto, conferma. */
async function applyToDocument(code: string, message: ChatMessage): Promise<void> {
  let snapshot: ChatContextSnapshot | undefined = message.context
  if (!snapshot) {
    // Domanda inviata senza documento: si usa quello aperto adesso (selezione o file intero).
    const context = (await executeCommand('editor.getContext')) as EditorContext | null
    if (!context) {
      notify(t('ai.noEditor'), 'error')
      return
    }
    snapshot = snapshotOf(context)
  }
  const model = (await executeCommand('editor.ensureModel', { path: snapshot.path })) as { getValue: () => string } | undefined
  if (!model) return
  const target = resolveApplyTarget(snapshot, model.getValue())
  const proposed = keepTrailingNewline(target.original, code)
  const warning = target.status === 'moved' ? t('ai.fileMoved') : target.status === 'changed' ? t('ai.fileChanged') : undefined
  const language = snapshot.language
  const path = snapshot.path
  openDialog((close) => <DiffDialog target={{ path, range: target.range, original: target.original, language }} proposed={proposed} warning={warning} close={close} />)
}

function CodeBlock({ language, code, message }: { language: string; code: string; message: ChatMessage }) {
  return (
    <div className="ai-code">
      <div className="ai-code-bar">
        <span>{language}</span>
        <span style={{ flex: 1 }} />
        <button
          className="icon-btn"
          title={t('ai.copy')}
          aria-label={t('ai.copy')}
          onClick={() => {
            void navigator.clipboard.writeText(code)
            notify(t('ai.copied'), 'success')
          }}
          data-testid="ai-copy"
        >
          <Copy size={13} />
        </button>
        <button
          className="icon-btn"
          title={t('ai.insert')}
          aria-label={t('ai.insert')}
          onClick={async () => !(await executeCommand('editor.insertText', { text: code })) && notify(t('ai.noEditor'), 'error')}
          data-testid="ai-insert"
        >
          <CornerDownLeft size={13} />
        </button>
        {!message.pending && (
          <button className="btn primary ai-apply" title={t('ai.applyTitle')} onClick={() => void applyToDocument(code, message)} data-testid="ai-apply">
            <Wand2 size={13} /> {t('ai.apply')}
          </button>
        )}
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

function MessageView({ message }: { message: ChatMessage }) {
  const [showThinking, setShowThinking] = useState(false)
  if (message.role === 'user') {
    return (
      <div className="ai-msg user">
        <div className="ai-bubble">{message.display}</div>
      </div>
    )
  }
  return (
    <div className="ai-msg assistant" data-testid="ai-answer" data-pending={message.pending ? 'true' : 'false'}>
      <div className="ai-avatar">
        <Bot size={14} />
      </div>
      <div className="ai-body">
        {message.thinking && (
          <button className="ai-thinking-toggle" onClick={() => setShowThinking(!showThinking)}>
            {showThinking ? '▾' : '▸'} {t('ai.thinking')}
          </button>
        )}
        {showThinking && message.thinking && <div className="ai-thinking">{message.thinking}</div>}
        {message.display ? (
          <Markdown source={message.display} renderCode={({ language, code }) => <CodeBlock language={language} code={code} message={message} />} />
        ) : message.pending ? (
          <div className="ai-typing">
            <span />
            <span />
            <span />
          </div>
        ) : null}
        {message.error && <div className="error-text">{t('ai.error', { error: message.error })}</div>}
      </div>
    </div>
  )
}

/** Problemi (errori e avvisi) del file aperto, aggiornati quando cambiano i marcatori di Monaco. */
function useFileProblemCount(path: string | null): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!path) {
      setCount(0)
      return
    }
    let alive = true
    const update = async () => {
      const context = (await executeCommand('editor.getContext')) as EditorContext | null
      if (alive) setCount(context && context.path === path ? context.problems.filter((p) => p.severity !== 'info').length : 0)
    }
    void update()
    const sub = monaco.editor.onDidChangeMarkers(() => void update())
    return () => {
      alive = false
      sub.dispose()
    }
  }, [path])
  return count
}

function Header() {
  const expanded = useSidePanel((s) => s.expanded)
  const toggleExpanded = useSidePanel((s) => s.toggleExpanded)
  const setOpen = useSidePanel((s) => s.setOpen)
  const reset = useChat((s) => s.reset)
  const empty = useChat((s) => s.messages.length === 0)
  return (
    <div className="ai-side-header">
      <Sparkles size={14} className="ai-side-mark" />
      <span className="ai-side-title">{t('ai.panelTitle')}</span>
      <span style={{ flex: 1 }} />
      <button className="icon-btn" title={t('ai.newChat')} aria-label={t('ai.newChat')} onClick={reset} disabled={empty} data-testid="ai-new">
        <Plus size={15} />
      </button>
      <button
        className="icon-btn"
        title={expanded ? t('ai.shrink') : t('ai.expand')}
        aria-label={expanded ? t('ai.shrink') : t('ai.expand')}
        aria-pressed={expanded}
        onClick={toggleExpanded}
        data-testid="ai-expand"
      >
        {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      </button>
      <button className="icon-btn" title={`${t('ai.closePanel')} (Ctrl+Alt+B)`} aria-label={t('ai.closePanel')} onClick={() => setOpen(false)} data-testid="ai-close">
        <X size={15} />
      </button>
    </div>
  )
}

/** Chip del documento aperto (file o «selezione righe a-b») e dei suoi problemi, staccabili con ×. */
function ContextChips({
  withFile,
  setWithFile,
  withProblems,
  setWithProblems
}: {
  withFile: boolean
  setWithFile: (value: boolean) => void
  withProblems: boolean
  setWithProblems: (value: boolean) => void
}) {
  const activeFile = useWorkbench((s) => s.activeFile)
  const selection = useWorkbench((s) => s.selection)
  const problems = useFileProblemCount(activeFile)
  if (!activeFile) {
    return (
      <div className="ai-chips">
        <span className="ai-chip off" data-testid="ai-chip-file">
          <FileCode2 size={12} /> {t('ai.noFile')}
        </span>
      </div>
    )
  }
  const name = basenameOf(activeFile)
  const span = selection ? selectionLineSpan(selection) : null
  const where = span ? (span.start === span.end ? t('ai.chipLine', { line: span.start }) : t('ai.chipLines', { start: span.start, end: span.end })) : t('ai.chipFile')
  const problemsLabel = t('ai.chipProblems', { count: problems })
  return (
    <div className="ai-chips">
      {withFile ? (
        <span className="ai-chip" title={`${activeFile} — ${t('ai.withFileHint')}`} data-testid="ai-chip-file">
          <FileCode2 size={12} />
          <span className="ai-chip-text">
            {name} · {where}
          </span>
          <button className="ai-chip-x" onClick={() => setWithFile(false)} title={t('ai.chipRemove', { name })} aria-label={t('ai.chipRemove', { name })} data-testid="ai-chip-file-remove">
            <X size={11} />
          </button>
        </span>
      ) : (
        <button className="ai-chip off" onClick={() => setWithFile(true)} title={t('ai.chipAdd', { name })} data-testid="ai-chip-file-add">
          <Plus size={11} /> {name}
        </button>
      )}
      {withFile &&
        problems > 0 &&
        (withProblems ? (
          <span className="ai-chip warn" data-testid="ai-chip-problems">
            <TriangleAlert size={12} />
            <span className="ai-chip-text">{problemsLabel}</span>
            <button className="ai-chip-x" onClick={() => setWithProblems(false)} title={t('ai.chipRemove', { name: problemsLabel })} aria-label={t('ai.chipRemove', { name: problemsLabel })}>
              <X size={11} />
            </button>
          </span>
        ) : (
          <button className="ai-chip off" onClick={() => setWithProblems(true)} title={t('ai.chipAdd', { name: problemsLabel })} data-testid="ai-chip-problems-add">
            <Plus size={11} /> {problemsLabel}
          </button>
        ))}
    </div>
  )
}

function ChatBody() {
  const status = useAi((s) => s.status)
  const checking = useAi((s) => s.checking)
  const refresh = useAi((s) => s.refresh)
  const ai = useWorkbench((s) => s.settings.ai)
  const language = useWorkbench((s) => s.settings.language)
  const activeFile = useWorkbench((s) => s.activeFile)
  const messages = useChat((s) => s.messages)
  const streaming = useChat((s) => s.stream !== null)
  const send = useChat((s) => s.send)
  const stop = useChat((s) => s.stop)
  const focusRequest = useSidePanel((s) => s.focusRequest)
  const [input, setInput] = useState('')
  const [withFile, setWithFile] = useState(true)
  const [withProblems, setWithProblems] = useState(true)
  const [slashIndex, setSlashIndex] = useState(0)
  const [slashClosed, setSlashClosed] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!status) void refresh()
  }, [status, refresh])

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages])

  useEffect(() => {
    if (focusRequest <= handledFocusRequest || !inputRef.current) return
    handledFocusRequest = focusRequest
    inputRef.current.focus()
  }, [focusRequest, status])

  const models = status?.models.filter((m) => m.capabilities.includes('completion') && !m.capabilities.includes('embedding')) ?? []
  const current = status ? pickChatModel(status.models, ai.chatModel) : null
  const suggestions = slashClosed ? [] : slashSuggestions(input, language)
  const highlighted = Math.min(slashIndex, Math.max(0, suggestions.length - 1))

  const changeInput = (value: string) => {
    setInput(value)
    setSlashIndex(0)
    setSlashClosed(false)
  }

  const pickSlash = (name: string) => {
    changeInput(`/${name} `)
    inputRef.current?.focus()
  }

  const submit = async () => {
    const question = input.trim()
    if (!question || !current) return
    const slash = parseSlash(question)
    setInput('')
    if (slash) {
      await quickAction(slash.action, slash.extra)
      return
    }
    let snapshot: ChatContextSnapshot | null = null
    if (withFile && activeFile) {
      const context = (await executeCommand('editor.getContext')) as EditorContext | null
      if (context) snapshot = snapshotOf(context, { problems: withProblems })
    }
    await send(promptWithContext(question, snapshot), { display: question, context: snapshot ?? undefined })
  }

  if (!ai.enabled) {
    return (
      <div className="empty-state">
        <div>
          <p>{t('ai.disabled')}</p>
          <button className="btn" onClick={() => updateSettings({ ai: { ...ai, enabled: true } })}>
            {t('ai.enable')}
          </button>
        </div>
      </div>
    )
  }

  if (status && !status.available) {
    return (
      <div className="empty-state">
        <div style={{ maxWidth: 360 }}>
          <p>
            <strong>{t('ai.unavailable')}</strong>
          </p>
          <p className="hint">{t('ai.unavailableHint', { endpoint: status.endpoint })}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => refresh()} disabled={checking}>
              <RefreshCw size={13} /> {t('ai.retry')}
            </button>
            <button className="btn" onClick={() => executeCommand('app.openUrl', { url: 'https://ollama.com/download' })}>
              {t('ai.install')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="panel-toolbar">
        <select
          value={current ?? ''}
          onChange={(e) => updateSettings({ ai: { ...ai, chatModel: e.target.value } })}
          aria-label={t('ai.model')}
          style={{ minWidth: 0, flex: 1, maxWidth: 260 }}
          data-testid="ai-model"
        >
          {models.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name} {m.size ? `· ${m.size}` : ''} {m.remote ? '· cloud' : ''}
            </option>
          ))}
        </select>
        <button
          className={`icon-btn${ai.tutorMode ? ' active' : ''}`}
          title={ai.tutorMode ? t('ai.tutorOn') : t('ai.tutorOff')}
          aria-label={ai.tutorMode ? t('ai.tutorOn') : t('ai.tutorOff')}
          onClick={() => updateSettings({ ai: { ...ai, tutorMode: !ai.tutorMode } })}
          data-testid="ai-tutor"
        >
          <GraduationCap size={15} />
        </button>
        <span style={{ flex: 1 }} />
        <button className="icon-btn" title={t('ai.refresh')} aria-label={t('ai.refresh')} onClick={() => refresh()} disabled={checking}>
          <RefreshCw size={13} />
        </button>
      </div>
      <div className="panel-body ai-messages" ref={listRef} data-testid="ai-messages">
        {messages.length === 0 && (
          <div className="ai-intro">
            <Bot size={22} />
            <p>{ai.tutorMode ? t('ai.introTutor') : t('ai.intro')}</p>
            <p className="hint">{t('ai.introSlash')}</p>
            <div className="ai-suggestions">
              {[t('ai.suggest1'), t('ai.suggest2'), t('ai.suggest3')].map((s) => (
                <button key={s} className="btn" onClick={() => changeInput(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message) => (
          <MessageView key={message.id} message={message} />
        ))}
      </div>
      <div className="ai-input">
        <ContextChips withFile={withFile} setWithFile={setWithFile} withProblems={withProblems} setWithProblems={setWithProblems} />
        {suggestions.length > 0 && (
          <div className="ai-slash-menu" role="listbox" aria-label={t('ai.slashTitle')} data-testid="ai-slash-menu">
            {suggestions.map((s, index) => (
              <div
                key={s.action}
                role="option"
                aria-selected={index === highlighted}
                className={`ai-slash-item${index === highlighted ? ' active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pickSlash(s.name)
                }}
                onMouseEnter={() => setSlashIndex(index)}
              >
                <span className="ai-slash-name">/{s.name}</span>
                <span className="ai-slash-desc">{t(QUICK_ACTION_LABEL[s.action])}</span>
              </div>
            ))}
          </div>
        )}
        <div className="ai-input-row">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => changeInput(e.target.value)}
            placeholder={t('ai.placeholder')}
            aria-label={t('ai.placeholder')}
            rows={2}
            data-testid="ai-input"
            onKeyDown={(e) => {
              if (suggestions.length > 0) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  const delta = e.key === 'ArrowDown' ? 1 : -1
                  setSlashIndex((highlighted + delta + suggestions.length) % suggestions.length)
                  return
                }
                if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                  e.preventDefault()
                  pickSlash(suggestions[highlighted]!.name)
                  return
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setSlashClosed(true)
                  return
                }
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                void executeCommand('editor.focus')
                return
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void submit()
              }
            }}
          />
          {streaming ? (
            <button className="btn" onClick={stop} title={t('ai.stop')} aria-label={t('ai.stop')}>
              <Square size={13} />
            </button>
          ) : (
            <button className="btn primary" onClick={() => void submit()} disabled={!input.trim() || !current} data-testid="ai-send">
              {t('ai.send')}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

/** Contenuto del pannello laterale destro (registrato nel guscio da activateAiAssist). */
export function AiChatPanel() {
  return (
    <div className="panel ai-panel" data-testid="ai-panel">
      <Header />
      <ChatBody />
    </div>
  )
}
