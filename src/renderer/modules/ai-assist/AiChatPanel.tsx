// Pannello dell'assistente AI: chat con contesto del file aperto, codice copiabile/inseribile/applicabile.
import { useEffect, useRef, useState } from 'react'
import { Bot, Copy, CornerDownLeft, FileCode2, GraduationCap, RefreshCw, Square, Trash2, Wand2 } from 'lucide-react'
import { pickChatModel } from '@shared/contracts/ai'
import type { EditorContext } from '@shared/contracts/editor'
import { executeCommand } from '../../workbench/commands'
import { notify } from '../../workbench/notifications'
import { useWorkbench } from '../../workbench/store'
import { updateSettings } from '../../workbench/workbench-commands'
import { openDialog } from '../../ui/dialogs'
import { useAi } from '../../services/ai-client'
import { t } from '../../i18n'
import { useChat, type ChatMessage } from './chat-store'
import { DiffDialog } from './DiffDialog'
import { Markdown } from '../../ui/Markdown'

function CodeBlock({ language, code, message }: { language: string; code: string; message: ChatMessage }) {
  return (
    <div className="ai-code">
      <div className="ai-code-bar">
        <span>{language}</span>
        <span style={{ flex: 1 }} />
        <button
          className="icon-btn"
          title={t('ai.copy')}
          onClick={() => {
            void navigator.clipboard.writeText(code)
            notify(t('ai.copied'), 'success')
          }}
        >
          <Copy size={13} />
        </button>
        <button className="icon-btn" title={t('ai.insert')} onClick={async () => !(await executeCommand('editor.insertText', { text: code })) && notify(t('ai.noEditor'), 'error')}>
          <CornerDownLeft size={13} />
        </button>
        {message.apply && !message.pending && (
          <button className="btn primary ai-apply" onClick={() => openDialog((close) => <DiffDialog target={message.apply!} proposed={code} close={close} />)} data-testid="ai-apply">
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

export function AiChatPanel() {
  const status = useAi((s) => s.status)
  const checking = useAi((s) => s.checking)
  const refresh = useAi((s) => s.refresh)
  const ai = useWorkbench((s) => s.settings.ai)
  const activeFile = useWorkbench((s) => s.activeFile)
  const messages = useChat((s) => s.messages)
  const streaming = useChat((s) => s.stream !== null)
  const send = useChat((s) => s.send)
  const stop = useChat((s) => s.stop)
  const reset = useChat((s) => s.reset)
  const [input, setInput] = useState('')
  const [withFile, setWithFile] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!status) void refresh()
  }, [status, refresh])

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages])

  const models = status?.models.filter((m) => m.capabilities.includes('completion') && !m.capabilities.includes('embedding')) ?? []
  const current = status ? pickChatModel(status.models, ai.chatModel) : null

  const submit = async () => {
    const question = input.trim()
    if (!question || !current) return
    setInput('')
    let content = question
    if (withFile && activeFile) {
      const context = (await executeCommand('editor.getContext')) as EditorContext | null
      if (context) {
        const code = context.selection?.text ?? context.text
        const label = context.selection ? t('ai.ctxSelection', { path: context.path }) : t('ai.ctxFile', { path: context.path })
        content = `${question}\n\n${label}\n\`\`\`${context.language}\n${code.slice(0, 12000)}\n\`\`\``
      }
    }
    await send(content, { display: question })
  }

  if (!ai.enabled) {
    return (
      <div className="panel">
        <div className="empty-state">
          <div>
            <p>{t('ai.disabled')}</p>
            <button className="btn" onClick={() => updateSettings({ ai: { ...ai, enabled: true } })}>
              {t('ai.enable')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (status && !status.available) {
    return (
      <div className="panel">
        <div className="empty-state">
          <div style={{ maxWidth: 360 }}>
            <p>
              <strong>{t('ai.unavailable')}</strong>
            </p>
            <p className="hint">{t('ai.unavailableHint', { endpoint: status.endpoint })}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn" onClick={() => refresh()} disabled={checking}>
                <RefreshCw size={13} /> {t('ai.retry')}
              </button>
              <button className="btn" onClick={() => executeCommand('app.openUrl', { url: 'https://ollama.com/download' })}>
                {t('ai.install')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="panel ai-panel">
      <div className="panel-toolbar">
        <select
          value={current ?? ''}
          onChange={(e) => updateSettings({ ai: { ...ai, chatModel: e.target.value } })}
          aria-label={t('ai.model')}
          style={{ maxWidth: 210 }}
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
          onClick={() => updateSettings({ ai: { ...ai, tutorMode: !ai.tutorMode } })}
          data-testid="ai-tutor"
        >
          <GraduationCap size={15} />
        </button>
        <span style={{ flex: 1 }} />
        <button className="icon-btn" title={t('ai.refresh')} onClick={() => refresh()} disabled={checking}>
          <RefreshCw size={13} />
        </button>
        <button className="icon-btn" title={t('ai.newChat')} onClick={reset} disabled={messages.length === 0}>
          <Trash2 size={14} />
        </button>
      </div>
      <div className="panel-body ai-messages" ref={listRef} data-testid="ai-messages">
        {messages.length === 0 && (
          <div className="ai-intro">
            <Bot size={22} />
            <p>{ai.tutorMode ? t('ai.introTutor') : t('ai.intro')}</p>
            <div className="ai-suggestions">
              {[t('ai.suggest1'), t('ai.suggest2'), t('ai.suggest3')].map((s) => (
                <button key={s} className="btn" onClick={() => setInput(s)}>
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
        <label className="ai-context-chip" title={t('ai.withFileHint')}>
          <input type="checkbox" checked={withFile} onChange={(e) => setWithFile(e.target.checked)} />
          <FileCode2 size={12} />
          {activeFile ? activeFile : t('ai.noFile')}
        </label>
        <div className="ai-input-row">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('ai.placeholder')}
            rows={2}
            data-testid="ai-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void submit()
              }
            }}
          />
          {streaming ? (
            <button className="btn" onClick={stop} title={t('ai.stop')}>
              <Square size={13} />
            </button>
          ) : (
            <button className="btn primary" onClick={() => void submit()} disabled={!input.trim() || !current} data-testid="ai-send">
              {t('ai.send')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
