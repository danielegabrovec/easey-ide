// Pannello del designer visuale: palette/livelli a sinistra, canvas al centro, ispettore a destra.
// La pagina mostrata si ricostruisce a ogni modifica dell'HTML o del CSS (anche fatta a mano nel codice).
import { useEffect, useMemo, useState } from 'react'
import type * as Monaco from 'monaco-editor'
import type { IDockviewPanelProps } from 'dockview'
import { Code2, FilePlus2, Globe, Laptop, Monitor, Redo2, Smartphone, Tablet, Undo2 } from 'lucide-react'
import { buildCanvasDocument, resolveRelative } from '@shared/designer/canvas-document'
import type { Breakpoint } from '@shared/designer/css-edit'
import { linkedStylesheets } from '@shared/designer/html-edit'
import { elementAtOffset, parseHtml } from '@shared/designer/html-model'
import { htmlPages } from '@shared/designer/pages'
import { filePaths } from '@shared/paths'
import { executeCommand } from '../../workbench/commands'
import { on } from '../../workbench/events'
import { useWorkbench } from '../../workbench/store'
import { notifyError } from '../../workbench/notifications'
import { t } from '../../i18n'
import { Canvas } from './Canvas'
import { Inspector } from './Inspector'
import { Layers } from './Layers'
import { Palette } from './Palette'
import { modelFor, redo, undo } from './document'
import { resolveSelection, useDesigner } from './designer-store'

const WIDTHS: Record<Breakpoint, number> = { desktop: 1200, tablet: 820, phone: 390 }

let selectionFromEditor = false

function useCanvasDocument(path: string): string {
  const [html, setHtml] = useState('')
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let subscriptions: Monaco.IDisposable[] = []
    const rebuild = async () => {
      try {
        const htmlModel = await modelFor(path)
        const source = htmlModel.getValue()
        const parsed = parseHtml(source)
        const css: Record<string, string> = {}
        const models: Monaco.editor.ITextModel[] = [htmlModel]
        for (const href of linkedStylesheets(parsed)) {
          const sheet = resolveRelative(path, href)
          if (!sheet) continue
          try {
            const model = await modelFor(sheet)
            css[sheet] = model.getValue()
            models.push(model)
          } catch {
            /* foglio di stile mancante */
          }
        }
        if (disposed) return
        const first = linkedStylesheets(parsed).map((h) => resolveRelative(path, h)).find((p) => p && css[p] !== undefined) ?? null
        useDesigner.getState().setParsed(parsed, css, first)
        setHtml(buildCanvasDocument(source, { htmlPath: path, stylesheet: (p) => css[p] ?? null }))
        // Si ascoltano i modelli coinvolti (cambiano anche quando si aggiunge un foglio di stile).
        subscriptions.forEach((s) => s.dispose())
        subscriptions = models.map((model) => model.onDidChangeContent(schedule))
      } catch (error) {
        notifyError(error)
      }
    }
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void rebuild(), 60)
    }
    void rebuild()
    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
      subscriptions.forEach((s) => s.dispose())
    }
  }, [path])
  return html
}

/** Pagine del sito: si passa da una all'altra e se ne crea una nuova (con intestazione e piè di pagina comuni). */
function PagePicker({ path }: { path: string }) {
  const tree = useWorkbench((s) => s.tree)
  const pages = useMemo(() => {
    const found = htmlPages(filePaths(tree))
    return found.includes(path) ? found : [path, ...found]
  }, [tree, path])
  return (
    <div className="designer-pages">
      <select
        value={path}
        onChange={(e) => executeCommand('designer.open', { path: e.target.value })}
        aria-label={t('designer.page')}
        title={t('designer.page')}
        data-testid="designer-page"
      >
        {pages.map((page) => (
          <option key={page} value={page}>
            {page}
          </option>
        ))}
      </select>
      <button className="icon-btn" title={t('cmd.designerNewPage')} aria-label={t('cmd.designerNewPage')} onClick={() => executeCommand('designer.newPage')} data-testid="designer-new-page">
        <FilePlus2 size={14} />
      </button>
    </div>
  )
}

export function DesignerPanel({ params }: IDockviewPanelProps<{ path: string }>) {
  const path = params.path
  const breakpoint = useDesigner((s) => s.breakpoint)
  const leftTab = useDesigner((s) => s.leftTab)
  const canvasHtml = useCanvasDocument(path)

  useEffect(() => {
    useDesigner.getState().setPage(path)
  }, [path])

  // Selezione nel designer → evidenzia il tag nel codice (se il file è aperto).
  useEffect(
    () =>
      useDesigner.subscribe((state, previous) => {
        if (state.selection === previous.selection || selectionFromEditor) return
        const element = resolveSelection(state.html, state.selection)
        if (element) void executeCommand('editor.highlight', { path, start: element.start, end: element.startTagEnd })
      }),
    [path]
  )

  // Cursore nel codice → selezione nel designer.
  useEffect(
    () =>
      on('editor:cursor', ({ path: cursorPath, offset }) => {
        const html = useDesigner.getState().html
        if (cursorPath !== path || !html) return
        const element = elementAtOffset(html, offset)
        if (!element || ['html', 'head'].includes(element.tag)) return
        selectionFromEditor = true
        useDesigner.getState().selectElement(element)
        selectionFromEditor = false
      }),
    [path]
  )

  return (
    <div className="panel designer-panel" data-testid="designer">
      <div className="panel-toolbar">
        <span className="title">{t('designer.titleShort')}</span>
        <PagePicker path={path} />
        <div className="segmented" role="tablist" aria-label={t('designer.breakpoint')}>
          {(
            [
              ['desktop', <Monitor key="d" size={13} />, t('designer.bpDesktop')],
              ['tablet', <Tablet key="t" size={13} />, t('designer.bpTablet')],
              ['phone', <Smartphone key="p" size={13} />, t('designer.bpPhone')]
            ] as [Breakpoint, React.ReactNode, string][]
          ).map(([value, icon, label]) => (
            <button key={value} className={breakpoint === value ? 'active' : undefined} title={label} onClick={() => useDesigner.getState().setBreakpoint(value)} data-testid={`bp-${value}`}>
              {icon}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <button className="icon-btn" title={`${t('designer.undo')} (Ctrl+Z)`} onClick={() => undo()}>
          <Undo2 size={14} />
        </button>
        <button className="icon-btn" title={`${t('designer.redo')} (Ctrl+Y)`} onClick={() => redo()}>
          <Redo2 size={14} />
        </button>
        <button className="btn ghost" onClick={() => executeCommand('editor.open', { path })} title={t('designer.showCode')}>
          <Code2 size={14} /> {t('designer.code')}
        </button>
        <button className="btn ghost" onClick={() => executeCommand('run.preview', { entry: path })} title={t('designer.realPreview')}>
          <Globe size={14} /> {t('toolbar.preview')}
        </button>
      </div>
      <div className="designer-body">
        <div className="designer-left">
          <div className="insp-tabs">
            <button className={leftTab === 'palette' ? 'active' : undefined} onClick={() => useDesigner.getState().setLeftTab('palette')}>
              <Laptop size={12} /> {t('designer.elements')}
            </button>
            <button className={leftTab === 'layers' ? 'active' : undefined} onClick={() => useDesigner.getState().setLeftTab('layers')} data-testid="designer-layers-tab">
              {t('designer.layers')}
            </button>
          </div>
          {leftTab === 'palette' ? <Palette /> : <Layers />}
        </div>
        <Canvas html={canvasHtml} width={WIDTHS[breakpoint]} />
        <Inspector />
      </div>
    </div>
  )
}
