// Codice generato mostrato accanto al programma visuale (Monaco in sola lettura), collegato al grafico:
// il nodo o blocco selezionato illumina le sue righe (sfondo che sfuma), un clic su una riga seleziona
// il suo nodo o blocco. Si mostra il codice pulito, senza le righe di servizio dei passi.
import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor'
import type { LineRange } from '@shared/visual/code-map'
import { useWorkbench } from '../../workbench/store'
import { t } from '../../i18n'

interface Props {
  code: string
  /** Righe dell'elemento selezionato nel grafico (o null). */
  highlight?: LineRange | null
  /** Clic su una riga (numero da 1). */
  onLineClick?: (line: number) => void
}

export function CodePreview({ code, highlight = null, onLineClick }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const flash = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)
  const clickRef = useRef(onLineClick)
  clickRef.current = onLineClick
  const fontSize = useWorkbench((s) => s.settings.fontSize)

  useEffect(() => {
    if (!host.current) return
    const instance = monaco.editor.create(host.current, {
      value: code,
      language: 'javascript',
      readOnly: true,
      readOnlyMessage: { value: t('split.readOnly') },
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: Math.max(11, fontSize - 1),
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      fontFamily: "'Cascadia Code', Consolas, monospace",
      renderLineHighlight: 'none',
      domReadOnly: true
    })
    editor.current = instance
    flash.current = instance.createDecorationsCollection()
    const sub = instance.onMouseDown((event) => {
      const line = event.target.position?.lineNumber
      if (line) clickRef.current?.(line)
    })
    return () => {
      sub.dispose()
      instance.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (editor.current && editor.current.getValue() !== code) editor.current.setValue(code)
  }, [code])

  // Grafica → codice: righe selezionate, portate al centro, illuminate con uno sfondo che sfuma.
  useEffect(() => {
    const instance = editor.current
    if (!instance || !flash.current) return
    if (!highlight) {
      flash.current.clear()
      return
    }
    const range = new monaco.Range(highlight.startLine, 1, highlight.endLine, instance.getModel()?.getLineMaxColumn(highlight.endLine) ?? 1)
    instance.setSelection(range)
    instance.revealRangeInCenterIfOutsideViewport(range, monaco.editor.ScrollType.Smooth)
    flash.current.set([{ range, options: { className: 'link-flash', isWholeLine: true } }])
    const timer = setTimeout(() => flash.current?.clear(), 1600)
    return () => clearTimeout(timer)
  }, [highlight])

  useEffect(() => editor.current?.updateOptions({ fontSize: Math.max(11, fontSize - 1) }), [fontSize])

  return (
    <div
      ref={host}
      className="visual-code-preview"
      data-testid="visual-generated"
      data-code={code}
      data-highlight={highlight ? `${highlight.startLine}-${highlight.endLine}` : ''}
      title={t('split.readOnly')}
    />
  )
}
