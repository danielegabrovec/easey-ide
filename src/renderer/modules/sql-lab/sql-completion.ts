// Completamento SQL nell'editor Monaco con le tabelle e le colonne vere del database attivo.
// La logica dei suggerimenti è condivisa (shared/sql/completion.ts); qui solo la traduzione per Monaco.
import * as monaco from 'monaco-editor'
import { sqlSuggestions, type SqlSuggestionKind } from '@shared/sql/completion'
import { useSql } from './sql-store'

const KINDS: Record<SqlSuggestionKind, monaco.languages.CompletionItemKind> = {
  table: monaco.languages.CompletionItemKind.Struct,
  view: monaco.languages.CompletionItemKind.Interface,
  column: monaco.languages.CompletionItemKind.Field,
  keyword: monaco.languages.CompletionItemKind.Keyword,
  snippet: monaco.languages.CompletionItemKind.Snippet
}

export function registerSqlCompletion(): monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.', ' '],
    provideCompletionItems(model, position) {
      // Solo i file del progetto: la Scrittura rapida ha il suo database e i suoi suggerimenti.
      if (model.uri.scheme !== 'file') return { suggestions: [] }
      const schema = useSql.getState().schemas[useSql.getState().activeId]
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
      const before = model.getValueInRange(new monaco.Range(position.lineNumber, 1, position.lineNumber, word.startColumn))
      return {
        suggestions: sqlSuggestions(before, model.getValue(), schema).map((s) => ({ label: s.label, kind: KINDS[s.kind], detail: s.detail, insertText: s.insertText, range, sortText: s.sortText }))
      }
    }
  })
}
