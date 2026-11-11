// Autocompletamento inline (testo grigio, Tab per accettare) con un modello "fill-in-the-middle" di Ollama.
import * as monaco from 'monaco-editor'
import { ide } from '../../ipc'
import { activeModels, newRequestId } from '../../services/ai-client'
import { workbench } from '../../workbench/store'

const LANGUAGES = ['typescript', 'javascript', 'html', 'css', 'scss', 'less', 'json', 'sql', 'markdown']
const DEBOUNCE_MS = 280
const PREFIX_CHARS = 4000
const SUFFIX_CHARS = 1500

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let busy = 0
function setBusy(delta: number, model: string): void {
  busy = Math.max(0, busy + delta)
  const store = workbench()
  const current = store.statusItems.find((i) => i.id === 'ai')
  if (!current) return
  store.setStatusItem({ ...current, tone: busy > 0 ? 'busy' : 'normal', text: busy > 0 ? `✦ ${model}…` : `✦ ${model}` })
}

/** Ultimi risultati, per non richiedere due volte la stessa cosa mentre si scorre fra i suggerimenti. */
const cache = new Map<string, string>()

export function registerInlineCompletion(): monaco.IDisposable {
  return monaco.languages.registerInlineCompletionsProvider(LANGUAGES, {
    async provideInlineCompletions(model, position, _context, token) {
      const ai = workbench().settings.ai
      if (!ai.enabled || !ai.inlineCompletion || model.uri.scheme !== 'file') return { items: [] }
      const completionModel = activeModels().completion
      if (!completionModel) return { items: [] }

      const full = model.getValue()
      const offset = model.getOffsetAt(position)
      const prefix = full.slice(Math.max(0, offset - PREFIX_CHARS), offset)
      const suffix = full.slice(offset, offset + SUFFIX_CHARS)
      // Niente suggerimenti in mezzo a una parola o su file vuoti.
      if (!prefix.trim() || /\w/.test(suffix.charAt(0))) return { items: [] }

      const key = `${completionModel}\u0000${prefix.slice(-600)}\u0000${suffix.slice(0, 200)}`
      let text = cache.get(key)
      if (text === undefined) {
        await sleep(DEBOUNCE_MS)
        if (token.isCancellationRequested) return { items: [] }
        const requestId = newRequestId('fim')
        const cancel = token.onCancellationRequested(() => void ide.invoke('ai:cancel', requestId))
        setBusy(1, completionModel)
        try {
          text = await ide.invoke('ai:complete', { requestId, model: completionModel, prefix, suffix, language: model.getLanguageId() })
        } catch {
          text = ''
        } finally {
          cancel.dispose()
          setBusy(-1, completionModel)
        }
        if (token.isCancellationRequested) return { items: [] }
        cache.set(key, text)
        if (cache.size > 50) cache.delete(cache.keys().next().value!)
      }
      if (!text.trim()) return { items: [] }
      return {
        items: [{ insertText: text, range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column) }]
      }
    },
    freeInlineCompletions() {
      /* nessuna risorsa da liberare */
    }
  })
}
