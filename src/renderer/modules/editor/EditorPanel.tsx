// Un pannello = un file aperto in Monaco.
import { useEffect, useRef, useState } from 'react'
import type * as Monaco from 'monaco-editor'
import type { IDockviewPanelProps } from 'dockview'
import { useWorkbench, workbench } from '../../workbench/store'
import { rememberArea } from '../../workbench/layout'
import { emit } from '../../workbench/events'
import { t } from '../../i18n'
import { monaco } from './monaco-setup'
import { ensureModel } from './models'

const editors = new Map<string, Monaco.editor.IStandaloneCodeEditor>()
const waiters = new Map<string, ((editor: Monaco.editor.IStandaloneCodeEditor) => void)[]>()

/** Restituisce l'editor di un file appena il suo pannello è montato. */
export function editorFor(path: string, timeout = 2000): Promise<Monaco.editor.IStandaloneCodeEditor | null> {
  const existing = editors.get(path)
  if (existing) return Promise.resolve(existing)
  return new Promise((resolve) => {
    const list = waiters.get(path) ?? []
    let done = false
    const finish = (editor: Monaco.editor.IStandaloneCodeEditor | null) => {
      if (done) return
      done = true
      resolve(editor)
    }
    list.push(finish)
    waiters.set(path, list)
    setTimeout(() => finish(null), timeout)
  })
}

export function activeEditor(): Monaco.editor.IStandaloneCodeEditor | null {
  const path = workbench().activeFile
  return path ? (editors.get(path) ?? null) : null
}

export function EditorPanel({ params, api }: IDockviewPanelProps<{ path: string }>) {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const fontSize = useWorkbench((s) => s.settings.fontSize)
  const theme = useWorkbench((s) => s.settings.theme)
  const path = params.path

  useEffect(() => {
    let editor: Monaco.editor.IStandaloneCodeEditor | null = null
    let disposed = false
    const disposables: Monaco.IDisposable[] = []
    void ensureModel(path)
      .then((model) => {
        if (disposed || !host.current) return
        editor = monaco.editor.create(host.current, {
          model,
          automaticLayout: true,
          fontSize: workbench().settings.fontSize,
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
          linkedEditing: true,
          stickyScroll: { enabled: true },
          padding: { top: 8 },
          'semanticHighlighting.enabled': true
        })
        editors.set(path, editor)
        for (const resolve of waiters.get(path) ?? []) resolve(editor)
        waiters.delete(path)
        const reportCursor = () => {
          const position = editor?.getPosition()
          if (position && workbench().activeFile === path) workbench().setCursor({ line: position.lineNumber, column: position.column })
          const current = editor?.getModel()
          if (position && current && editor?.hasTextFocus()) emit('editor:cursor', { path, offset: current.getOffsetAt(position) })
        }
        disposables.push(
          editor.onDidFocusEditorText(() => {
            workbench().setActiveFile(path)
            reportCursor()
          }),
          editor.onDidChangeCursorPosition(reportCursor)
        )
        if (api.isActive) {
          workbench().setActiveFile(path)
          editor.focus()
        }
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))

    const activeSub = api.onDidActiveChange((event) => {
      if (event.isActive) {
        workbench().setActiveFile(path)
        rememberArea('center', api.group.id)
        editor?.focus()
      }
    })
    const groupSub = api.onDidGroupChange(() => rememberArea('center', api.group.id))
    return () => {
      disposed = true
      activeSub.dispose()
      groupSub.dispose()
      disposables.forEach((d) => d.dispose())
      editors.delete(path)
      editor?.dispose()
      if (workbench().activeFile === path) {
        workbench().setActiveFile(null)
        workbench().setCursor(null)
      }
    }
  }, [path, api])

  useEffect(() => {
    for (const editor of editors.values()) editor.updateOptions({ fontSize })
  }, [fontSize])

  useEffect(() => {
    monaco.editor.setTheme(theme === 'dark' ? 'lab-dark' : 'lab-light')
  }, [theme])

  if (error) return <div className="empty-state">{t('editor.cannotOpen', { path, error })}</div>
  return <div ref={host} className="editor-host" data-editor-path={path} />
}
