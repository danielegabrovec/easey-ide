// Modulo Editor: apertura file, salvataggio, problemi, cronologia locale.
import type * as Monaco from 'monaco-editor'
import type { EditorContext, ReplaceRangeArgs } from '@shared/contracts/editor'
import { basenameOf, isTextFile } from '@shared/paths'
import { openerFor, registerFileOpener } from '../../workbench/openers'
import { notify } from '../../workbench/notifications'
import { executeCommand, registerCommand } from '../../workbench/commands'
import { on } from '../../workbench/events'
import { closeBeside, closePanel, findPanels, registerPanel, showBeside, showPanel } from '../../workbench/layout'
import { workbench } from '../../workbench/store'
import { openDialog } from '../../ui/dialogs'
import { t } from '../../i18n'
import { EditorPanel, activeEditor, editorFor } from './EditorPanel'
import { HistoryDialog } from './HistoryDialog'
import { ImageViewer, isImageFile } from './ImageViewer'
import { ProblemsPanel, trackProblemCounts } from './ProblemsPanel'
import { loadNodeTypes, monaco, setupMonaco } from './monaco-setup'
import { disposeAll, disposeModel, ensureModel, getModel, loadProjectModels, modelPaths, save, saveAll, syncFromDisk } from './models'

const panelId = (path: string) => `editor:${path}`

export async function openEditor(path: string, inactive = false): Promise<void> {
  const opener = openerFor(path)
  if (opener) {
    await executeCommand(opener.command, { path })
    return
  }
  if (!isTextFile(path)) {
    notify(t('editor.notText', { path }), 'error')
    return
  }
  await ensureModel(path)
  showPanel({ id: panelId(path), component: 'editor', title: basenameOf(path), area: 'center', params: { path }, inactive })
}

function closeEditor(path: string): void {
  closePanel(panelId(path))
}

function closeEditorsUnder(prefix: string): string[] {
  const closed: string[] = []
  for (const panel of findPanels('editor:')) {
    const path = panel.id.slice('editor:'.length)
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      panel.api.close()
      closed.push(path)
    }
  }
  return closed
}

export function activateEditor(): void {
  setupMonaco()
  trackProblemCounts()
  registerPanel('editor', EditorPanel)
  registerPanel('problems', ProblemsPanel)
  registerPanel('image', ImageViewer)
  // Le immagini del progetto si guardano (stesso id di pannello degli editor: rinomina ed eliminazione valgono anche qui).
  registerFileOpener({ id: 'image', matches: isImageFile, command: 'editor.openImage' })
  registerCommand<{ path: string }>({
    id: 'editor.openImage',
    title: 'editor.openImage',
    palette: false,
    run: (args) => args && showPanel({ id: panelId(args.path), component: 'image', title: basenameOf(args.path), area: 'center', params: { path: args.path } })
  })

  const category = t('category.edit')
  registerCommand<{ path: string }>({
    id: 'editor.open',
    title: t('cmd.openFile'),
    palette: false,
    run: (args) => args && openEditor(args.path)
  })
  registerCommand<{ path: string; line: number; column?: number }>({
    id: 'editor.reveal',
    title: t('cmd.revealPosition'),
    palette: false,
    run: async (args) => {
      if (!args) return
      await openEditor(args.path)
      const editor = await editorFor(args.path)
      if (!editor) return
      const position = { lineNumber: args.line, column: args.column ?? 1 }
      editor.setPosition(position)
      editor.revealPositionInCenter(position)
      editor.focus()
    }
  })
  // Evidenzia una riga (esecuzione passo-passo); line null toglie l'evidenziazione.
  const highlights = new Map<string, { editor: Monaco.editor.IStandaloneCodeEditor; collection: Monaco.editor.IEditorDecorationsCollection }>()
  registerCommand<{ path: string; line: number | null }>({
    id: 'editor.highlightLine',
    title: 'editor.highlightLine',
    palette: false,
    run: async (args) => {
      if (!args) return
      for (const [path, entry] of highlights) if (path !== args.path || args.line === null) entry.collection.clear()
      if (args.line === null) return
      await openEditor(args.path)
      const editor = await editorFor(args.path)
      if (!editor) return
      let entry = highlights.get(args.path)
      if (!entry || entry.editor !== editor) {
        entry = { editor, collection: editor.createDecorationsCollection() }
        highlights.set(args.path, entry)
      }
      entry.collection.set([{ range: new monaco.Range(args.line, 1, args.line, 1), options: { isWholeLine: true, className: 'trace-line', glyphMarginClassName: 'trace-glyph', overviewRuler: { color: '#f59e0b', position: monaco.editor.OverviewRulerLane.Full } } }])
      editor.revealLineInCenterIfOutsideViewport(args.line)
    }
  })
  registerCommand({
    id: 'editor.save',
    title: t('cmd.save'),
    category,
    keybinding: 'Ctrl+S',
    run: async () => {
      const path = workbench().activeFile
      if (path) await save(path)
    }
  })
  registerCommand({ id: 'editor.saveAll', title: t('cmd.saveAll'), category, keybinding: 'Ctrl+Alt+S', run: () => saveAll() })
  registerCommand({
    id: 'editor.format',
    title: t('cmd.format'),
    category,
    keybinding: 'Alt+Shift+F',
    when: () => activeEditor() !== null,
    run: () => activeEditor()?.getAction('editor.action.formatDocument')?.run()
  })
  // Comandi per gli altri moduli (AI, didattica…): leggono e modificano l'editor senza importarlo.
  registerCommand({
    id: 'editor.getContext',
    title: 'editor.getContext',
    palette: false,
    run: (): EditorContext | null => {
      const editor = activeEditor()
      const model = editor?.getModel()
      const path = workbench().activeFile
      if (!editor || !model || !path) return null
      const selection = editor.getSelection()
      const position = editor.getPosition()
      const hasSelection = !!selection && !selection.isEmpty()
      return {
        path,
        language: model.getLanguageId(),
        text: model.getValue(),
        selection: hasSelection
          ? {
              text: model.getValueInRange(selection),
              range: { startLine: selection.startLineNumber, startColumn: selection.startColumn, endLine: selection.endLineNumber, endColumn: selection.endColumn }
            }
          : null,
        cursor: { line: position?.lineNumber ?? 1, column: position?.column ?? 1 },
        problems: monaco.editor
          .getModelMarkers({ resource: model.uri })
          .filter((m) => m.severity >= monaco.MarkerSeverity.Info)
          .map((m) => ({
            line: m.startLineNumber,
            column: m.startColumn,
            message: m.message,
            severity: m.severity === monaco.MarkerSeverity.Error ? 'error' : m.severity === monaco.MarkerSeverity.Warning ? 'warning' : 'info'
          }))
      }
    }
  })
  registerCommand<ReplaceRangeArgs>({
    id: 'editor.replaceRange',
    title: 'editor.replaceRange',
    palette: false,
    run: async (args) => {
      if (!args) return
      await openEditor(args.path)
      const model = await ensureModel(args.path)
      const { startLine, startColumn, endLine, endColumn } = args.range
      const range = new monaco.Range(startLine, startColumn, endLine, endColumn)
      const editor = await editorFor(args.path)
      if (editor) {
        editor.pushUndoStop()
        editor.executeEdits('laboratorio', [{ range, text: args.text, forceMoveMarkers: true }])
        editor.pushUndoStop()
        editor.focus()
      } else {
        model.pushEditOperations([], [{ range, text: args.text }], () => null)
      }
    }
  })
  registerCommand<{ path: string }>({
    id: 'editor.ensureModel',
    title: 'editor.ensureModel',
    palette: false,
    run: (args) => (args ? ensureModel(args.path) : null)
  })
  // Grafica → codice (vista affiancata): seleziona l'intervallo, lo porta al centro e lo evidenzia con
  // uno sfondo che sfuma, SENZA prendere il fuoco. Niente cicli: l'editor segnala il cursore
  // (editor:cursor) solo quando ha il fuoco, e qui il fuoco resta alla grafica.
  const flashes = new Map<Monaco.editor.IStandaloneCodeEditor, { collection: Monaco.editor.IEditorDecorationsCollection; timer: ReturnType<typeof setTimeout> | null }>()
  registerCommand<{ path: string; start: number; end: number }>({
    id: 'editor.highlight',
    title: 'editor.highlight',
    palette: false,
    run: async (args) => {
      if (!args) return
      const editor = await editorFor(args.path, 0)
      const model = editor?.getModel()
      if (!editor || !model) return
      const range = monaco.Range.fromPositions(model.getPositionAt(args.start), model.getPositionAt(args.end))
      editor.setSelection(range)
      editor.revealRangeInCenterIfOutsideViewport(range, monaco.editor.ScrollType.Smooth)
      let flash = flashes.get(editor)
      if (!flash) {
        flash = { collection: editor.createDecorationsCollection(), timer: null }
        flashes.set(editor, flash)
        editor.onDidDispose(() => flashes.delete(editor))
      }
      flash.collection.set([{ range, options: { className: 'link-flash', isWholeLine: false } }])
      if (flash.timer) clearTimeout(flash.timer)
      const current = flash
      current.timer = setTimeout(() => current.collection.clear(), 1600)
    }
  })
  // Apre un file in un gruppo accanto (a destra) a un pannello grafico, senza prendergli il fuoco.
  registerCommand<{ path: string; beside: string }>({
    id: 'editor.openBeside',
    title: 'editor.openBeside',
    palette: false,
    run: async (args) => {
      if (!args) return
      await ensureModel(args.path)
      showBeside({ id: panelId(args.path), component: 'editor', title: basenameOf(args.path), area: 'center', params: { path: args.path } }, args.beside)
    }
  })
  registerCommand<{ path: string }>({ id: 'editor.closeBeside', title: 'editor.closeBeside', palette: false, run: (args) => args && closeBeside(panelId(args.path)) })
  registerCommand<{ text: string }>({
    id: 'editor.insertText',
    title: 'editor.insertText',
    palette: false,
    run: (args) => {
      const editor = activeEditor()
      const selection = editor?.getSelection()
      if (!args || !editor || !selection) return false
      editor.pushUndoStop()
      editor.executeEdits('laboratorio', [{ range: selection, text: args.text, forceMoveMarkers: true }])
      editor.pushUndoStop()
      editor.focus()
      return true
    }
  })
  // Riporta il fuoco all'editor attivo (es. Esc nella casella della chat AI). true se c'era un editor.
  registerCommand({
    id: 'editor.focus',
    title: 'editor.focus',
    palette: false,
    run: () => {
      const editor = activeEditor()
      editor?.focus()
      return !!editor
    }
  })
  registerCommand({
    id: 'editor.showProblems',
    title: t('cmd.showProblems'),
    category: t('category.view'),
    keybinding: 'Ctrl+Shift+M',
    run: () => showPanel({ id: 'problems', component: 'problems', title: t('panel.problems'), area: 'bottom' })
  })
  registerCommand<{ path?: string }>({
    id: 'editor.history',
    title: t('cmd.history'),
    category,
    when: () => workbench().project !== null,
    run: (args) => {
      const path = args?.path ?? workbench().activeFile
      if (path) openDialog((close) => <HistoryDialog path={path} close={close} />)
    }
  })

  on('project:opened', async (project) => {
    await loadProjectModels()
    if (project.config.run.mode === 'terminal' || modelPaths().some((p) => /\.(ts|mts)$/.test(p))) void loadNodeTypes()
    const toOpen = [project.config.run.entry]
    if (project.config.run.mode === 'web') toOpen.push(...['src/main.ts', 'script.js', 'main.js'].filter((p) => getModel(p)))
    for (const [index, path] of toOpen.entries()) {
      if (getModel(path)) await openEditor(path, index > 0)
    }
  })
  on('project:closed', () => {
    for (const panel of findPanels('editor:')) panel.api.close()
    disposeAll()
  })
  on('files:changed', ({ paths }) => void syncFromDisk(paths, closeEditor))
  on('file:renamed', async ({ from, to }) => {
    const reopen = closeEditorsUnder(from)
    for (const path of modelPaths()) if (path === from || path.startsWith(`${from}/`)) disposeModel(path)
    for (const path of reopen) await openEditor(to + path.slice(from.length))
  })
  on('file:deleted', ({ path }) => {
    closeEditorsUnder(path)
    for (const model of modelPaths()) if (model === path || model.startsWith(`${path}/`)) disposeModel(model)
  })
}
