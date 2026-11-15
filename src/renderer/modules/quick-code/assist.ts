// Assistenza alla scrittura nella Scrittura rapida:
//  - suggerimento AI in grigio (Tab accetta, Ctrl+→ una parola) con misura secondo il livello:
//    leggero = una riga, intermedio = qualche riga, forte = blocchi interi anche a metà riga;
//  - suggerimenti SQL con le tabelle e le colonne del database in memoria (+ modelli rapidi);
//  - parole chiave e modelli rapidi di Python, C, C++, C#, Java e Rust, anche nei file del progetto.
// Il motore del suggerimento AI è comune ai file del progetto (services/inline-ai.ts).
import * as monaco from 'monaco-editor'
import { create } from 'zustand'
import { ASSIST_LEVELS, type QuickLanguage } from '@shared/contracts/quick'
import { QUICK_KEYWORDS, QUICK_SNIPPETS } from '@shared/quick/snippets'
import { schemaComment, sqlSuggestions, type SqlSuggestionKind } from '@shared/sql/completion'
import { registerInlineAi } from '../../services/inline-ai'
import { workbench } from '../../workbench/store'
import { QUICK_SCHEME } from './quick-editor'
import { quick } from './quick-store'

/** Richieste AI in corso (per l'indicatore nella barra della Scrittura rapida). */
export const useAssistBusy = create<{ busy: number }>(() => ({ busy: 0 }))

function sqlContext(): string {
  const engine = workbench().settings.quick.sqlEngine
  return schemaComment(quick().schemas[engine])
}

/** Suggerimento AI in grigio con la misura del livello scelto (motore comune: services/inline-ai.ts). */
function registerInline(): monaco.IDisposable {
  return registerInlineAi({
    id: 'quick-fim',
    accepts: (model) => model.uri.scheme === QUICK_SCHEME,
    level: () => workbench().settings.quick.level,
    context: (model) => (model.getLanguageId() === 'sql' ? sqlContext() : ''),
    onBusy: (delta) => useAssistBusy.setState((s) => ({ busy: Math.max(0, s.busy + delta) }))
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

/**
 * Python, C, C++, C#, Java, Rust: parole chiave e modelli rapidi (Monaco per questi non ha suggerimenti), nella
 * Scrittura rapida secondo il livello scelto e anche nei file del progetto (sempre, con i modelli rapidi).
 */
function registerKeywords(): monaco.IDisposable {
  const languages = Object.keys(QUICK_KEYWORDS)
  return monaco.languages.registerCompletionItemProvider(languages, {
    provideCompletionItems(model, position) {
      const inQuick = model.uri.scheme === QUICK_SCHEME
      if (!inQuick && model.uri.scheme !== 'file') return { suggestions: [] }
      const language = model.getLanguageId() as QuickLanguage
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
      const K = monaco.languages.CompletionItemKind
      const snippetsOn = inQuick ? ASSIST_LEVELS[workbench().settings.quick.level].snippets : true
      const snippets = snippetsOn ? (QUICK_SNIPPETS[language] ?? []) : []
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
