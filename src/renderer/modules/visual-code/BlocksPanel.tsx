// Editor a blocchi (Blockly): i blocchi si incastrano, il codice JavaScript si genera accanto e si salva.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { IDockviewPanelProps } from 'dockview'
import { basenameOf } from '@shared/paths'
import { generatedHeader, STEP_HELPER, type BlocksProgram, type VisualProgram } from '@shared/visual/program'
import { on } from '../../workbench/events'
import { notifyError } from '../../workbench/notifications'
import { useWorkbench } from '../../workbench/store'
import { t } from '../../i18n'
import { Blockly, generateBlocksCode, setElementIds, setupBlockly, toolbox } from './blocks-setup'
import { CodePreview } from './CodePreview'
import { loadSymbols, readProgram, writeProgram } from './project-files'
import { VisualToolbar } from './VisualToolbar'

function fullCode(path: string, body: string, program: BlocksProgram, withSteps: boolean): string {
  const parts = [generatedHeader(basenameOf(path), 'blocchi').trimEnd()]
  if (withSteps && program.highlight && program.target === 'pagina') parts.push(STEP_HELPER.trimEnd())
  parts.push(body.trim() || '// Trascina dei blocchi nell’area di lavoro.')
  return `${parts.join('\n\n')}\n`
}

export function BlocksPanel({ params }: IDockviewPanelProps<{ path: string }>) {
  const path = params.path
  const host = useRef<HTMLDivElement>(null)
  const workspace = useRef<Blockly.WorkspaceSvg | null>(null)
  const [program, setProgram] = useState<BlocksProgram | null>(null)
  const [code, setCode] = useState('')
  const [cleanCode, setCleanCode] = useState('')
  const programRef = useRef<BlocksProgram | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const theme = useWorkbench((s) => s.settings.theme)

  const regenerate = useCallback(() => {
    const ws = workspace.current
    const current = programRef.current
    if (!ws || !current) return { program: current, code: '' }
    const next: BlocksProgram = { ...current, workspace: Blockly.serialization.workspaces.save(ws) }
    const withSteps = next.highlight && next.target === 'pagina'
    const generated = fullCode(path, generateBlocksCode(ws, withSteps), next, true)
    setCode(generated)
    setCleanCode(fullCode(path, generateBlocksCode(ws, false), next, false))
    programRef.current = next
    return { program: next, code: generated }
  }, [path])

  const flush = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const { program: next, code: generated } = regenerate()
    if (next) await writeProgram(path, next, generated).catch(notifyError)
  }, [path, regenerate])

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    regenerate()
    saveTimer.current = setTimeout(() => void flush(), 500)
  }, [flush, regenerate])

  // Caricamento del programma e creazione dell'area di lavoro.
  useEffect(() => {
    let disposed = false
    const B = setupBlockly()
    void (async () => {
      const [loaded, symbols] = await Promise.all([readProgram(path, 'blocchi'), loadSymbols()])
      if (disposed || !host.current) return
      setElementIds(symbols.ids)
      const initial = loaded as BlocksProgram
      programRef.current = initial
      setProgram(initial)
      const ws = B.inject(host.current, {
        toolbox: toolbox(initial.target),
        theme: useWorkbench.getState().settings.theme === 'dark' ? 'lab-dark' : 'lab-light',
        grid: { spacing: 22, length: 2, colour: '#3a415066', snap: true },
        zoom: { controls: true, wheel: true, startScale: 0.9, maxScale: 2, minScale: 0.4 },
        trashcan: true,
        sounds: false,
        renderer: 'zelos',
        move: { scrollbars: true, drag: true, wheel: false }
      })
      workspace.current = ws
      try {
        if (initial.workspace && Object.keys(initial.workspace as object).length) B.serialization.workspaces.load(initial.workspace as object, ws)
      } catch (error) {
        notifyError(error)
      }
      regenerate()
      ws.addChangeListener((event: Blockly.Events.Abstract) => {
        if (event.isUiEvent) return
        scheduleSave()
      })
    })()
    return () => {
      disposed = true
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        void flush()
      }
      workspace.current?.dispose()
      workspace.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  useEffect(() => {
    workspace.current?.setTheme(Blockly.registry.getObject(Blockly.registry.Type.THEME, theme === 'dark' ? 'lab-dark' : 'lab-light') as Blockly.Theme)
  }, [theme])

  // Evidenzia il blocco in esecuzione nell'anteprima.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    return on('preview:step', ({ id }) => {
      const ws = workspace.current
      if (!ws?.getBlockById(id)) return
      ws.highlightBlock(id)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => ws.highlightBlock(null), 900)
    })
  }, [])

  // Ridimensionamento del pannello → Blockly si adatta.
  useEffect(() => {
    const element = host.current
    if (!element) return
    const observer = new ResizeObserver(() => workspace.current && Blockly.svgResize(workspace.current))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const change = (next: VisualProgram) => {
    const blocks = next as BlocksProgram
    programRef.current = blocks
    setProgram(blocks)
    if (blocks.target !== program?.target) workspace.current?.updateToolbox(toolbox(blocks.target))
    scheduleSave()
  }

  return (
    <div className="panel visual-panel" data-testid="blocks-editor">
      {program && <VisualToolbar path={path} program={program} cleanCode={cleanCode} allowConsole onChange={change} flush={flush} />}
      <div className="visual-body">
        <div ref={host} className="blockly-host" />
        <div className="visual-side">
          <div className="panel-toolbar">
            <span className="title">{t('visual.generated')}</span>
          </div>
          <CodePreview code={code} />
        </div>
      </div>
    </div>
  )
}
