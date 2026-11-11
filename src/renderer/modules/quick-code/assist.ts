// Assistenza alla scrittura nella Scrittura rapida:
//  - suggerimento AI in grigio (Tab accetta, Ctrl+→ una parola) con misura secondo il livello:
//    leggero = una riga, intermedio = qualche riga, forte = blocchi interi anche a metà riga;
//  - suggerimenti SQL con le tabelle e le colonne del database in memoria (+ modelli rapidi).
// Vale solo per i modelli "quick:" (gli editor dei file hanno il loro autocompletamento).
import * as monaco from 'monaco-editor'
import { create } from 'zustand'
import { ASSIST_LEVELS, QUICK_LANGUAGES, fitSuggestion, type QuickLanguage } from '@shared/contracts/quick'
import { QUICK_KEYWORDS, QUICK_SNIPPETS } from '@shared/quick/snippets'
import { schemaComment, sqlSuggestions, type SqlSuggestionKind } from '@shared/sql/completion'
import { ide } from '../../ipc'
import { activeModels, newRequestId } from '../../services/ai-client'
import { workbench } from '../../workbench/store'
import { QUICK_SCHEME } from './quick-editor'
import { quick } from './quick-store'

const SUFFIX_CHARS = 1500
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Richieste AI in corso (per l'indicatore nella barra della Scrittura rapida). */
export const useAssistBusy = create<{ busy: number }>(() => ({ busy: 0 }))
const busy = (delta: number) => useAssistBusy.setState((s) => ({ busy: Math.max(0, s.busy + delta) }))

const cache = new Map<string, string>()

/** Il cursore è in un punto adatto a un suggerimento per questo livello? */
export function suggestionAllowed(lineAfter: string, prefix: string, midLine: boolean): boolean {
  if (!prefix.trim()) return false
  if (midLine) return !/^\w/.test(lineAfter)
  // Leggero/intermedio: solo a fine riga (dopo il cursore al massimo parentesi, virgolette, ; o ,).
  return /^[\s)\]}'"`;,]*$/.test(lineAfter)
}

function sqlContext(): string {
  const engine = workbench().settings.quick.sqlEngine
  return schemaComment(quick().schemas[engine])
}

function registerInline(): monaco.IDisposable {
  return monaco.languages.registerInlineCompletionsProvider(QUICK_LANGUAGES, {
    async provideInlineCompletions(model, position, _context, token) {
      if (model.uri.scheme !== QUICK_SCHEME) return { items: [] }
      const settings = workbench().settings
      const level = settings.quick.level
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
      if (model.getLanguageId() === 'sql') prefix = sqlContext() + prefix

      const key = `${level}\u0000${completionModel}\u0000${prefix.slice(-700)}\u0000${suffix.slice(0, 200)}`
      let text = cache.get(key)
      if (text === undefined) {
        await sleep(profile.debounceMs)
        if (token.isCancellationRequested) return { items: [] }
        const requestId = newRequestId('quick-fim')
        const cancel = token.onCancellationRequested(() => void ide.invoke('ai:cancel', requestId))
        busy(1)
        try {
          text = await ide.invoke('ai:complete', { requestId, model: completionModel, prefix, suffix, language: model.getLanguageId(), maxTokens: profile.maxTokens })
        } catch {
          text = ''
        } finally {
          cancel.dispose()
          busy(-1)
        }
        if (token.isCancellationRequested) return { items: [] }
        cache.set(key, text)
        if (cache.size > 60) cache.delete(cache.keys().next().value!)
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

const KINDS: Record<SqlSuggestionKind, monaco.languages.CompletionItemKind> = {
  table: monaco.languages.CompletionItemKind.Struct,
  view: monaco.languages.CompletionItemKind.Interface,
  column: monaco.languages.CompletionItemKind.Field,
  keyword: monaco.languages.CompletionItemKind.Keyword,
  snippet: monaco.languages.CompletionItemKind.Snippet
}

function registerSql(): monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.', ' '],
    provideCompletionItems(model, position) {
      if (model.uri.scheme !== QUICK_SCHEME) return { suggestions: [] }
      const settings = workbench().settings.quick
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
      const before = model.getValueInRange(new monaco.Range(position.lineNumber, 1, position.lineNumber, word.startColumn))
      const items = sqlSuggestions(before, model.getValue(), quick().schemas[settings.sqlEngine], { snippets: ASSIST_LEVELS[settings.level].snippets })
      return {
        suggestions: items.map((s) => ({
          label: s.label,
          kind: KINDS[s.kind],
          detail: s.detail,
          insertText: s.insertText,
          insertTextRules: s.snippet ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
          range,
          sortText: s.sortText
        }))
      }
    }
  })
}

/** Python, C, C++, C#, Java, Rust: parole chiave e modelli rapidi (Monaco per questi non ha suggerimenti). */
function registerKeywords(): monaco.IDisposable {
  const languages = Object.keys(QUICK_KEYWORDS)
  return monaco.languages.registerCompletionItemProvider(languages, {
    provideCompletionItems(model, position) {
      if (model.uri.scheme !== QUICK_SCHEME) return { suggestions: [] }
      const language = model.getLanguageId() as QuickLanguage
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
      const K = monaco.languages.CompletionItemKind
      const snippets = ASSIST_LEVELS[workbench().settings.quick.level].snippets ? (QUICK_SNIPPETS[language] ?? []) : []
      return {
        suggestions: [
          ...snippets.map((s) => ({
            label: s.label,
            kind: K.Snippet,
            detail: s.detail,
            insertText: s.body,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            sortText: `0${s.label}`
          })),
          ...(QUICK_KEYWORDS[language] ?? []).map((k) => ({ label: k, kind: K.Keyword, insertText: k, range, sortText: `1${k}` }))
        ]
      }
    }
  })
}

export function registerQuickAssist(): void {
  registerInline()
  registerSql()
  registerKeywords()
}
