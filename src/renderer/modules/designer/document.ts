// Accesso ai file della pagina in progettazione (HTML + fogli di stile) tramite i modelli dell'editor:
// il designer modifica gli stessi modelli che vedi nel codice, quindi tutto resta sincronizzato e
// l'autosalvataggio funziona. Ogni azione del designer è un passo di annulla/ripeti.
import * as monaco from 'monaco-editor'
import { linkedStylesheets, type TextEdit } from '@shared/designer/html-edit'
import { parseHtml, type HtmlModel } from '@shared/designer/html-model'
import { resolveRelative } from '@shared/designer/canvas-document'
import { insertHtml } from '@shared/designer/html-edit'
import { ide } from '../../ipc'
import { executeCommand } from '../../workbench/commands'

type Model = monaco.editor.ITextModel

export async function modelFor(path: string): Promise<Model> {
  const model = (await executeCommand('editor.ensureModel', { path })) as Model | null
  if (!model) throw new Error(`Impossibile aprire ${path}`)
  return model
}

/** Sostituzione minima fra due testi (prefisso e suffisso comuni restano intatti). */
export function minimalEdit(before: string, after: string): TextEdit | null {
  if (before === after) return null
  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) start++
  let endBefore = before.length
  let endAfter = after.length
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--
    endAfter--
  }
  return { start, end: endBefore, text: after.slice(start, endAfter) }
}

function applyToModel(model: Model, edits: TextEdit[]): void {
  if (!edits.length) return
  const operations = [...edits]
    .sort((a, b) => b.start - a.start)
    .map((e) => ({ range: monaco.Range.fromPositions(model.getPositionAt(e.start), model.getPositionAt(e.end)), text: e.text }))
  model.pushEditOperations([], operations, () => null)
}

/** TextModel di Monaco ha undo/redo (servizio annulla/ripeti per URI), non dichiarati nei tipi pubblici. */
type UndoableModel = Model & { undo(): void | Promise<void>; redo(): void | Promise<void> }

interface HistoryEntry {
  models: Model[]
}

const undoStack: HistoryEntry[] = []
const redoStack: HistoryEntry[] = []

/** Raggruppa più modifiche (anche su file diversi) in un unico passo annullabile. */
export class Transaction {
  private readonly touched = new Set<Model>()

  html(model: Model, edits: TextEdit[]): void {
    if (!edits.length) return
    this.begin(model)
    applyToModel(model, edits)
  }

  replace(model: Model, next: string): void {
    const edit = minimalEdit(model.getValue(), next)
    if (!edit) return
    this.begin(model)
    applyToModel(model, [edit])
  }

  private begin(model: Model): void {
    if (!this.touched.has(model)) {
      model.pushStackElement()
      this.touched.add(model)
    }
  }

  commit(): void {
    if (!this.touched.size) return
    for (const model of this.touched) model.pushStackElement()
    undoStack.push({ models: [...this.touched] })
    redoStack.length = 0
    if (undoStack.length > 200) undoStack.shift()
  }
}

export function undo(): boolean {
  const entry = undoStack.pop()
  if (!entry) return false
  for (const model of [...entry.models].reverse()) if (!model.isDisposed()) void (model as UndoableModel).undo()
  redoStack.push(entry)
  return true
}

export function redo(): boolean {
  const entry = redoStack.pop()
  if (!entry) return false
  for (const model of entry.models) if (!model.isDisposed()) void (model as UndoableModel).redo()
  undoStack.push(entry)
  return true
}

export function canUndo(): boolean {
  return undoStack.length > 0
}

/**
 * Foglio di stile della pagina in cui il designer scrive. Se la pagina non ne ha, crea style.css
 * accanto alla pagina e aggiunge il <link> nel <head>.
 */
export async function stylesheetFor(htmlPath: string, html: HtmlModel, transaction: Transaction, htmlModel: Model): Promise<{ path: string; model: Model }> {
  const href = linkedStylesheets(html)[0]
  if (href) {
    const path = resolveRelative(htmlPath, href)
    if (path) {
      try {
        return { path, model: await modelFor(path) }
      } catch {
        await ide.invoke('workspace:createFile', path, '')
        return { path, model: await modelFor(path) }
      }
    }
  }
  const dir = htmlPath.includes('/') ? htmlPath.slice(0, htmlPath.lastIndexOf('/') + 1) : ''
  const path = `${dir}style.css`
  try {
    await ide.invoke('workspace:createFile', path, '/* Stili della pagina */\n')
  } catch {
    /* esiste già */
  }
  const link = '<link rel="stylesheet" href="style.css" />'
  transaction.html(htmlModel, html.head !== null ? insertHtml(html, html.head, 'inside-end', link) : insertHtml(html, null, 'before', link))
  return { path, model: await modelFor(path) }
}

export function parse(model: Model): HtmlModel {
  return parseHtml(model.getValue())
}
