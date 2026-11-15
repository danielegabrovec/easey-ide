// Suggerimento AI in grigio mentre si scrive (Tab accetta, Ctrl+→ una parola): UN solo motore per i file del
// progetto e per la Scrittura rapida. Chi lo registra dice quali modelli accetta, con che misura (livello di
// ASSIST_LEVELS) e se aggiungere contesto in testa (es. lo schema SQL). Quando chiedere, quale finestra mandare e
// come pulire la risposta: @shared/ai/inline (1.6, come Easey DB 1.1: riempimento al centro per i modelli da codice).
import * as monaco from 'monaco-editor'
import { ASSIST_LEVELS, fitSuggestion, type AssistLevel } from '@shared/contracts/quick'
import { planInline, typedThrough } from '@shared/ai/inline'
import { ide } from '../ipc'
import { workbench } from '../workbench/store'
import { activeModels, newRequestId } from './ai-client'

/** Tutti i linguaggi che l'IDE insegna, più i formati di testo in cui un suggerimento ha senso. */
export const INLINE_AI_LANGUAGES = ['javascript', 'typescript', 'html', 'css', 'scss', 'less', 'json', 'sql', 'markdown', 'python', 'c', 'cpp', 'csharp', 'java', 'rust', 'go', 'php']

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface InlineAiSource {
  /** Nome per le richieste (si vede nei registri). */
  id: string
  /** Il modello è di questa fonte e il suggerimento è acceso? */
  accepts: (model: monaco.editor.ITextModel) => boolean
  /** Misura del suggerimento. */
  level: () => AssistLevel
  /** Testo da mettere davanti al codice (es. le tabelle del database come commento SQL). */
  context?: (model: monaco.editor.ITextModel) => string
  /** Richieste in corso (+1 / -1), per un indicatore. */
  onBusy?: (delta: number, model: string) => void
}

const cache = new Map<string, string>()
/** Ultimo suggerimento mostrato per fonte: mentre lo si scrive lettera per lettera, il resto vale ancora. */
const lastShown = new Map<string, { prefix: string; completion: string }>()

export function registerInlineAi(source: InlineAiSource): monaco.IDisposable {
  return monaco.languages.registerInlineCompletionsProvider(INLINE_AI_LANGUAGES, {
    async provideInlineCompletions(model, position, _context, token) {
      if (!source.accepts(model)) return { items: [] }
      const settings = workbench().settings
      const level = source.level()
      const profile = ASSIST_LEVELS[level]
      if (!profile.ai || !settings.ai.enabled) return { items: [] }
      const completionModel = activeModels().completion
      if (!completionModel) return { items: [] }

      const offset = model.getOffsetAt(position)
      const plan = planInline({ text: model.getValue(), offset, language: model.getLanguageId(), prefixChars: profile.prefixChars, maxLines: profile.maxLines, midLine: profile.midLine })
      if (!plan) return { items: [] }
      const prefix = (source.context?.(model) ?? '') + plan.prefix
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, position.column)
      // Si sta scrivendo proprio il suggerimento: si mostra il resto, senza chiedere di nuovo.
      const rest = typedThrough(lastShown.get(source.id) ?? null, prefix)
      if (rest) return { items: [{ insertText: word.word + rest, range }] }

      const key = `${source.id}\u0000${level}\u0000${completionModel}\u0000${prefix.length}\u0000${plan.key}`
      let text = cache.get(key)
      if (text === undefined) {
        await sleep(profile.debounceMs)
        if (token.isCancellationRequested) return { items: [] }
        const requestId = newRequestId(source.id)
        const cancel = token.onCancellationRequested(() => void ide.invoke('ai:cancel', requestId))
        source.onBusy?.(1, completionModel)
        try {
          text = await ide.invoke('ai:complete', {
            requestId,
            model: completionModel,
            prefix,
            suffix: plan.suffix,
            language: model.getLanguageId(),
            maxTokens: profile.maxTokens,
            stop: plan.stop,
            blankStops: plan.blankStops
          })
        } catch {
          text = ''
        } finally {
          cancel.dispose()
          source.onBusy?.(-1, completionModel)
        }
        if (token.isCancellationRequested) return { items: [] }
        cache.set(key, text)
        if (cache.size > 80) cache.delete(cache.keys().next().value!)
      }
      const fitted = fitSuggestion(text, level)
      if (!fitted.trim()) return { items: [] }
      lastShown.set(source.id, { prefix, completion: fitted })
      // Dall'inizio della parola: così il testo grigio convive con l'elenco dei suggerimenti aperto
      // (Monaco lo mostra se "estende" la voce selezionata, es. ret|urn n * 2).
      return { items: [{ insertText: word.word + fitted, range }] }
    },
    freeInlineCompletions() {
      /* nessuna risorsa da liberare */
    }
  })
}
