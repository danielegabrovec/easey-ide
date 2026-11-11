// L'editor Monaco della Scrittura rapida: un solo modello alla volta (quello del linguaggio scelto),
// opzioni secondo il livello di aiuto, risultati dell'esecuzione mostrati accanto alle righe.
// I modelli usano lo schema "quick:" e non "file:": non finiscono fra i Problemi del progetto né
// nell'autocompletamento AI dell'editor dei file (che vale solo per "file:").
import * as monaco from 'monaco-editor'
import type { QueryOutcome } from '@shared/contracts/db'
import { ASSIST_LEVELS, QUICK_EXTENSIONS, type AssistLevel, type QuickLanguage, type QuickRunEvent } from '@shared/contracts/quick'
import { splitStatements } from '@shared/sql/split'
import { t } from '../../i18n'

export const QUICK_SCHEME = 'quick'

let editor: monaco.editor.IStandaloneCodeEditor | null = null
let decorations: monaco.editor.IEditorDecorationsCollection | null = null

export function quickModelUri(language: QuickLanguage): monaco.Uri {
  return monaco.Uri.from({ scheme: QUICK_SCHEME, path: `/scrittura-rapida.${QUICK_EXTENSIONS[language]}` })
}

export function quickEditor(): monaco.editor.IStandaloneCodeEditor | null {
  return editor
}

export function levelOptions(level: AssistLevel): monaco.editor.IEditorOptions {
  const profile = ASSIST_LEVELS[level]
  const on = level !== 'off'
  return {
    quickSuggestions: profile.quickSuggestions ? { other: 'on', comments: 'off', strings: 'off' } : false,
    suggestOnTriggerCharacters: on,
    parameterHints: { enabled: on },
    snippetSuggestions: profile.snippets ? 'inline' : 'none',
    inlineSuggest: { enabled: profile.ai, mode: 'subwordSmart', showToolbar: 'onHover' },
    suggest: { preview: level === 'strong', showSnippets: profile.snippets, showWords: on },
    tabCompletion: level === 'strong' ? 'on' : 'off'
  }
}

export function createQuickEditor(host: HTMLElement, language: QuickLanguage, content: string, options: { fontSize: number; level: AssistLevel }): monaco.editor.IStandaloneCodeEditor {
  editor?.dispose()
  editor = monaco.editor.create(host, {
    model: modelFor(language, content),
    automaticLayout: true,
    fontSize: options.fontSize,
    fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
    fontLigatures: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    tabSize: 2,
    renderWhitespace: 'selection',
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true, indentation: true },
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    padding: { top: 8 },
    lineNumbersMinChars: 3,
    glyphMargin: false,
    fixedOverflowWidgets: true,
    ...levelOptions(options.level)
  })
  decorations = editor.createDecorationsCollection()
  return editor
}

export function disposeQuickEditor(): void {
  const model = editor?.getModel()
  editor?.dispose()
  model?.dispose()
  editor = null
  decorations = null
}

function modelFor(language: QuickLanguage, content: string): monaco.editor.ITextModel {
  const uri = quickModelUri(language)
  const existing = monaco.editor.getModel(uri)
  if (existing) {
    if (existing.getValue() !== content) existing.setValue(content)
    return existing
  }
  return monaco.editor.createModel(content, language, uri)
}

/** Cambia linguaggio: un solo modello vivo alla volta (il servizio TypeScript non vede bozze di altri linguaggi). */
export function switchLanguage(language: QuickLanguage, content: string): void {
  if (!editor) return
  const previous = editor.getModel()
  const next = modelFor(language, content)
  if (previous === next) return
  editor.setModel(next)
  decorations?.clear()
  previous?.dispose()
}

/** Sostituisce il testo mantenendo l'annullamento (Ctrl+Z). */
export function replaceAll(text: string): void {
  const model = editor?.getModel()
  if (!editor || !model || model.getValue() === text) return
  editor.pushUndoStop()
  editor.executeEdits('quick', [{ range: model.getFullModelRange(), text }])
  editor.pushUndoStop()
  decorations?.clear()
}

export function revealLine(line: number): void {
  if (!editor) return
  editor.revealLineInCenterIfOutsideViewport(line)
  editor.setPosition({ lineNumber: line, column: editor.getModel()?.getLineMaxColumn(line) ?? 1 })
  editor.focus()
}

export function clearRunDecorations(): void {
  decorations?.clear()
}

const MAX_INLINE = 90

function compact(text: string): string {
  const single = text.replace(/\s+/g, ' ').trim()
  return single.length > MAX_INLINE ? `${single.slice(0, MAX_INLINE - 1)}…` : single
}

interface LineInfo {
  values: string[]
  logs: string[]
  error?: string
}

/** Valori, stampe ed errori dell'esecuzione accanto alle righe che li hanno prodotti. */
export function showRunDecorations(events: QuickRunEvent[], showSyntaxErrors: boolean): void {
  const model = editor?.getModel()
  if (!editor || !decorations || !model) return
  const lines = new Map<number, LineInfo>()
  const info = (line: number) => {
    let found = lines.get(line)
    if (!found) {
      found = { values: [], logs: [] }
      lines.set(line, found)
    }
    return found
  }
  for (const event of events) {
    if (event.kind === 'value') {
      const entry = info(event.line)
      const text = event.name ? `${event.name} = ${event.text}` : event.text
      // Una Promise che si risolve sostituisce il suo "in attesa".
      if (event.text.startsWith('Promise ') && entry.values.at(-1)?.startsWith('Promise {')) entry.values[entry.values.length - 1] = text
      else entry.values.push(text)
    } else if (event.kind === 'log' && event.line) info(event.line).logs.push(event.text)
    else if (event.kind === 'error' && event.line && (event.phase === 'runtime' || showSyntaxErrors)) info(event.line).error = event.message
  }
  const lineCount = model.getLineCount()
  const items: monaco.editor.IModelDeltaDecoration[] = []
  for (const [line, entry] of lines) {
    if (line < 1 || line > lineCount) continue
    const end = model.getLineMaxColumn(line)
    // Intervallo = riga intera (il testo "after" va in fondo); showIfCollapsed per le righe vuote.
    const range = new monaco.Range(line, 1, line, end)
    if (entry.error) {
      items.push({ range: new monaco.Range(line, 1, line, end), options: { isWholeLine: true, className: 'quick-error-line', overviewRuler: { color: '#ef6464', position: monaco.editor.OverviewRulerLane.Full } } })
      items.push({ range, options: { showIfCollapsed: true, after: { content: `  ✖ ${compact(entry.error)}`, inlineClassName: 'quick-inline-error' } } })
      continue
    }
    const parts: string[] = []
    if (entry.values.length) parts.push(`→ ${compact(entry.values.slice(-3).join(' · '))}`)
    if (entry.logs.length) {
      const shown = entry.logs.slice(-3).map(compact).join(' · ')
      parts.push(`▸ ${entry.logs.length > 3 ? `… ${shown} (${entry.logs.length}×)` : shown}`)
    }
    if (parts.length) items.push({ range, options: { showIfCollapsed: true, after: { content: `  ${parts.join('   ')}`, inlineClassName: entry.values.length ? 'quick-inline-value' : 'quick-inline-log' } } })
  }
  decorations.set(items)
}

/** SQL: righe d'inizio delle istruzioni eseguite, con l'esito (righe restituite o errore). */
export function showSqlDecorations(sql: string, outcomes: QueryOutcome[], offset = 0): void {
  const model = editor?.getModel()
  if (!editor || !decorations || !model) return
  const statements = splitStatements(sql)
  const items: monaco.editor.IModelDeltaDecoration[] = []
  outcomes.forEach((outcome, index) => {
    const statement = statements[index]
    if (!statement) return
    const endPosition = model.getPositionAt(offset + statement.end)
    const line = Math.min(endPosition.lineNumber, model.getLineCount())
    const end = model.getLineMaxColumn(line)
    const range = new monaco.Range(line, 1, line, end)
    if (outcome.kind === 'error') {
      const start = model.getPositionAt(offset + statement.start).lineNumber
      items.push({ range: new monaco.Range(start, 1, line, end), options: { isWholeLine: true, className: 'quick-error-line' } })
      items.push({ range, options: { showIfCollapsed: true, after: { content: `  ✖ ${compact(outcome.message)}`, inlineClassName: 'quick-inline-error' } } })
    } else {
      const text = outcome.columns.length ? t('quick.inlineRows', { count: `${outcome.rows.length}${outcome.truncated ? '+' : ''}` }) : t('quick.inlineChanges', { count: outcome.changes })
      items.push({ range, options: { showIfCollapsed: true, after: { content: `  ${text}`, inlineClassName: 'quick-inline-value' } } })
    }
  })
  decorations.set(items)
}
