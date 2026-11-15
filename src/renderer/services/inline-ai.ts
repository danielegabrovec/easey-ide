// Suggerimento AI in grigio mentre si scrive (Tab accetta, Ctrl+→ una parola): UN solo motore per i file del
// progetto e per la Scrittura rapida. Chi lo registra dice quali modelli accetta, con che misura (livello di
// ASSIST_LEVELS) e se aggiungere contesto in testa (es. lo schema SQL). Prima c'erano due copie, e quella dei
// file valeva solo per 9 linguaggi web, senza misura né inizio della parola.
import * as monaco from 'monaco-editor'
import { ASSIST_LEVELS, fitSuggestion, type AssistLevel } from '@shared/contracts/quick'
import { ide } from '../ipc'
import { workbench } from '../workbench/store'
import { activeModels, newRequestId } from './ai-client'

/** Tutti i linguaggi che l'IDE insegna, più i formati di testo in cui un suggerimento ha senso. */
export const INLINE_AI_LANGUAGES = ['javascript', 'typescript', 'html', 'css', 'scss', 'less', 'json', 'sql', 'markdown', 'python', 'c', 'cpp', 'csharp', 'java', 'rust', 'go', 'php']

const SUFFIX_CHARS = 1500
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Il cursore è in un punto adatto a un suggerimento? (a metà riga solo se il livello lo permette) */
export function suggestionAllowed(lineAfter: string, prefix: string, midLine: boolean): boolean {
  if (!prefix.trim()) return false
  if (midLine) return !/^\w/.test(lineAfter)
  // Leggero/intermedio: solo a fine riga (dopo il cursore al massimo parentesi, virgolette, ; o ,).
  return /^[\s)\]}'"`;,]*$/.test(lineAfter)
}

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

      const full = model.getValue()
      const offset = model.getOffsetAt(position)
      const lineAfter = model.getLineContent(position.lineNumber).slice(position.column - 1)
      let prefix = full.slice(Math.max(0, offset - profile.prefixChars), offset)
      const suffix = full.slice(offset, offset + SUFFIX_CHARS)
      if (!suggestionAllowed(lineAfter, prefix, profile.midLine)) return { items: [] }
      prefix = (source.context?.(model) ?? '') + prefix

      const key = `${source.id}\u0000${level}\u0000${completionModel}\u0000${prefix.slice(-700)}\u0000${suffix.slice(0, 200)}`
      let text = cache.get(key)
      if (text === undefined) {
        await sleep(profile.debounceMs)
        if (token.isCancellationRequested) return { items: [] }
        const requestId = newRequestId(source.id)
        const cancel = token.onCancellationRequested(() => void ide.invoke('ai:cancel', requestId))
        source.onBusy?.(1, completionModel)
        try {
          text = await ide.invoke('ai:complete', { requestId, model: completionModel, prefix, suffix, language: model.getLanguageId(), maxTokens: profile.maxTokens })
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
      // Dall'inizio della parola: così il testo grigio convive con l'elenco dei suggerimenti aperto
      // (Monaco lo mostra se "estende" la voce selezionata, es. ret|urn n * 2).
      const word = model.getWordUntilPosition(position)
      return {
        items: [{ insertText: word.word + fitted, range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, position.column) }]
      }
    },
    freeInlineCompletions() {
      /* nessuna risorsa da liberare */
    }
  })
}
