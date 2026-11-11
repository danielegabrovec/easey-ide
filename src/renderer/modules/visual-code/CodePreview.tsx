// Codice generato mostrato accanto al programma visuale (Monaco in sola lettura).
import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor'
import { useWorkbench } from '../../workbench/store'

export function CodePreview({ code }: { code: string }) {
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const fontSize = useWorkbench((s) => s.settings.fontSize)

  useEffect(() => {
    if (!host.current) return
    editor.current = monaco.editor.create(host.current, {
      value: code,
      language: 'javascript',
      readOnly: true,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: Math.max(11, fontSize - 1),
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      fontFamily: "'Cascadia Code', Consolas, monospace",
      renderLineHighlight: 'none',
      domReadOnly: true
    })
    return () => editor.current?.dispose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (editor.current && editor.current.getValue() !== code) editor.current.setValue(code)
  }, [code])

  useEffect(() => editor.current?.updateOptions({ fontSize: Math.max(11, fontSize - 1) }), [fontSize])

  return <div ref={host} className="visual-code-preview" data-testid="visual-generated" data-code={code} />
}
