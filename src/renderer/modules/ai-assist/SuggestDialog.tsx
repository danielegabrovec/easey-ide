// «Chiedi suggerimento» (tasto destro nell'editor o Ctrl+Alt+I): scrivi cosa ti serve, scegli dove
// (al cursore, righe selezionate, tutto il file) e l'AI locale propone il codice. Si applica solo dopo
// il confronto prima/dopo (DiffDialog), come ogni proposta dell'AI.
// Vale per i file del progetto e, con `apply` e `loadContext`, per l'editor della Scrittura rapida.
import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { EditorContext } from '@shared/contracts/editor'
import type { DbSchema } from '@shared/contracts/db'
import { applySuggestion, buildSuggestMessages, codeFromAnswer, defaultScope, type SuggestScope } from '@shared/ai/suggest'
import { schemaComment } from '@shared/sql/completion'
import { activeModels, streamChat, type ChatStream } from '../../services/ai-client'
import { Modal, openDialog } from '../../ui/dialogs'
import { executeCommand } from '../../workbench/commands'
import { t } from '../../i18n'
import type { MessageKey } from '../../i18n/it'
import { DiffDialog } from './DiffDialog'

/** Argomenti di `ai.suggestFor`: editor che non sono file del progetto (es. Scrittura rapida). */
export interface SuggestRequest {
  context: EditorContext
  /** Applica il testo intero del file dopo il confronto. Senza, si usa `editor.replaceRange`. */
  apply?: (text: string) => void | Promise<void>
  /** Contesto in più per l'AI. Senza, per l'SQL si usa lo schema della connessione attiva. */
  loadContext?: () => Promise<string>
}

const SCOPES: { id: SuggestScope; label: MessageKey; hint: MessageKey }[] = [
  { id: 'cursor', label: 'suggest.scopeCursor', hint: 'suggest.scopeCursorHint' },
  { id: 'selection', label: 'suggest.scopeSelection', hint: 'suggest.scopeSelectionHint' },
  { id: 'file', label: 'suggest.scopeFile', hint: 'suggest.scopeFileHint' }
]

function wholeFileRange(text: string) {
  const lines = text.split('\n')
  return { startLine: 1, startColumn: 1, endLine: lines.length, endColumn: lines[lines.length - 1]!.length + 1 }
}

/** Per le query, lo schema del database attivo (solo nomi e tipi, mai i dati); per gli altri linguaggi niente. */
async function projectContext(language: string): Promise<string> {
  if (language !== 'sql') return ''
  const result = (await executeCommand('sql.activeSchema').catch(() => null)) as { schema: DbSchema | null } | null | undefined
  return schemaComment(result?.schema ?? null, 4000)
}

export function SuggestDialog({ context, close, apply, loadContext }: SuggestRequest & { close: () => void }) {
  const [request, setRequest] = useState('')
  const [scope, setScope] = useState<SuggestScope>(defaultScope(context.selection?.range ?? null))
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const stream = useRef<ChatStream | null>(null)
  const model = activeModels().chat

  useEffect(() => () => stream.current?.cancel(), [])

  const ask = async () => {
    if (!request.trim() || busy || !model) return
    setBusy(true)
    setError(null)
    setCode(null)
    setAnswer('')
    try {
      const extra = await (loadContext ? loadContext() : projectContext(context.language)).catch(() => '')
      const messages = buildSuggestMessages(
        {
          request,
          scope,
          language: context.language,
          path: context.path,
          text: context.text,
          cursor: context.cursor,
          selection: context.selection?.range ?? null,
          context: extra
        },
        t('suggest.system')
      )
      stream.current = streamChat(messages, (chunk) => chunk.content && setAnswer((text) => text + chunk.content))
      const full = await stream.current.done
      const proposed = codeFromAnswer(full)
      if (!proposed.trim()) setError(t('suggest.empty'))
      else setCode(proposed)
    } catch (failure) {
      if (!/abort/i.test(String(failure))) setError((failure as Error).message)
    } finally {
      stream.current = null
      setBusy(false)
    }
  }

  const review = () => {
    if (code === null) return
    const proposed = applySuggestion({ scope, text: context.text, cursor: context.cursor, selection: context.selection?.range ?? null }, code)
    close()
    openDialog((closeDiff) => (
      <DiffDialog
        target={{ path: context.path, range: wholeFileRange(context.text), original: context.text, language: context.language }}
        proposed={proposed}
        close={closeDiff}
        onApply={apply}
      />
    ))
  }

  return (
    <Modal
      title={t('suggest.title', { path: context.path })}
      onClose={close}
      wide
      footer={
        <>
          <span className="hint" style={{ marginRight: 'auto' }}>
            {model ? t('suggest.model', { model }) : t('ai.unavailable')}
          </span>
          <button className="btn" onClick={close}>
            {t('common.cancel')}
          </button>
          {code !== null ? (
            <button className="btn primary" onClick={review} data-testid="suggest-review">
              {t('suggest.review')}
            </button>
          ) : (
            <button className="btn primary" disabled={!request.trim() || busy || !model} onClick={ask} data-testid="suggest-ask">
              <Sparkles size={14} /> {busy ? t('suggest.thinking') : t('suggest.ask')}
            </button>
          )}
        </>
      }
    >
      <div className="field">
        <label htmlFor="suggest-request">{t('suggest.request')}</label>
        <textarea
          id="suggest-request"
          className="suggest-request"
          value={request}
          autoFocus
          rows={3}
          placeholder={t('suggest.placeholder')}
          onChange={(e) => {
            setRequest(e.target.value)
            setCode(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || !e.shiftKey)) {
              e.preventDefault()
              void ask()
            }
          }}
          data-testid="suggest-request"
        />
      </div>
      <div className="suggest-scopes" role="radiogroup" aria-label={t('suggest.where')}>
        {SCOPES.map((option) => {
          const disabled = option.id === 'selection' && !context.selection
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={scope === option.id}
              disabled={disabled}
              className={`suggest-scope${scope === option.id ? ' selected' : ''}`}
              onClick={() => {
                setScope(option.id)
                setCode(null)
              }}
              data-scope={option.id}
            >
              <strong>{t(option.label)}</strong>
              <span className="hint">{option.id === 'cursor' ? t(option.hint, { line: context.cursor.line, column: context.cursor.column }) : t(option.hint)}</span>
            </button>
          )
        })}
      </div>
      {(answer || error) && (
        <div className="suggest-answer" data-testid="suggest-answer">
          {error ? <div className="error-text">{error}</div> : <pre>{code ?? answer}</pre>}
        </div>
      )}
    </Modal>
  )
}
