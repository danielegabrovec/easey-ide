// Base comune per tutti gli editor a nodi e connettori (diagramma ER, costruttore di query,
// programmazione a nodi, diagrammi): React Flow con il tema dell'IDE. Un solo motore, molti usi.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, useReactFlow, useStoreApi, type ReactFlowProps, type Edge, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useWorkbench } from '../workbench/store'

export interface GraphCanvasProps<N extends Node, E extends Edge> extends ReactFlowProps<N, E> {
  minimap?: boolean
  /** Quando cambia, la vista si riadatta a tutti i nodi (es. numero di tabelle). */
  fitKey?: string | number
  children?: ReactNode
}

function FitOnChange({ fitKey }: { fitKey?: string | number }) {
  const flow = useReactFlow()
  const store = useStoreApi()
  useEffect(() => {
    if (fitKey === undefined) return
    let attempts = 0
    let timer: ReturnType<typeof setTimeout>
    const tryFit = () => {
      // Serve un grafo visibile (non 0×0) e nodi già misurati, altrimenti lo zoom diventa NaN.
      const { width, height } = store.getState()
      const nodes = flow.getNodes()
      const measured = nodes.length > 0 && nodes.every((n) => (n.measured?.width ?? 0) > 0 && (n.measured?.height ?? 0) > 0 && Number.isFinite(n.position.x) && Number.isFinite(n.position.y))
      if (width > 0 && height > 0 && measured) void flow.fitView({ duration: 200, maxZoom: 1 })
      else if (++attempts < 15) timer = setTimeout(tryFit, 80)
    }
    timer = setTimeout(tryFit, 60)
    return () => clearTimeout(timer)
  }, [fitKey, flow, store])
  return null
}

export function GraphCanvas<N extends Node = Node, E extends Edge = Edge>({ minimap = false, fitKey, children, ...props }: GraphCanvasProps<N, E>) {
  const theme = useWorkbench((s) => s.settings.theme)
  const host = useRef<HTMLDivElement>(null)
  // React Flow si monta solo quando il contenitore ha dimensioni reali: in un pannello nascosto (0×0)
  // calcolerebbe uno zoom NaN e lo sfondo a puntini produrrebbe errori SVG.
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const element = host.current
    if (!element) return
    const observer = new ResizeObserver(() => setVisible(element.clientWidth > 0 && element.clientHeight > 0))
    observer.observe(element)
    setVisible(element.clientWidth > 0 && element.clientHeight > 0)
    return () => observer.disconnect()
  }, [])
  return (
    <div className="graph-canvas" ref={host}>
      {visible && (
        <ReactFlow<N, E> colorMode={theme} fitView proOptions={{ hideAttribution: true }} deleteKeyCode={['Delete', 'Backspace']} minZoom={0.2} maxZoom={2.5} {...props}>
          <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} />
          <Controls showInteractive={false} />
          {minimap && <MiniMap pannable zoomable />}
          <FitOnChange fitKey={fitKey} />
          {children}
        </ReactFlow>
      )}
    </div>
  )
}

/** Disposizione automatica a griglia: abbastanza per partire, poi l'utente sposta e la posizione si ricorda. */
export function gridLayout<T>(items: T[], size: (item: T) => { width: number; height: number }, columns = 3, gap = 60): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = []
  const rowHeights: number[] = []
  const columnWidths: number[] = []
  items.forEach((item, index) => {
    const { width, height } = size(item)
    const row = Math.floor(index / columns)
    const column = index % columns
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, height)
    columnWidths[column] = Math.max(columnWidths[column] ?? 0, width)
  })
  items.forEach((_, index) => {
    const row = Math.floor(index / columns)
    const column = index % columns
    const x = columnWidths.slice(0, column).reduce((sum, w) => sum + w + gap, 0)
    const y = rowHeights.slice(0, row).reduce((sum, h) => sum + h + gap, 0)
    positions.push({ x, y })
  })
  return positions
}

/** Posizioni dei nodi ricordate per chiave (es. diagramma ER di un database). */
export function loadPositions(key: string): Record<string, { x: number; y: number }> {
  try {
    return JSON.parse(localStorage.getItem(`graph:${key}`) ?? '{}') as Record<string, { x: number; y: number }>
  } catch {
    return {}
  }
}

export function savePositions(key: string, positions: Record<string, { x: number; y: number }>): void {
  try {
    localStorage.setItem(`graph:${key}`, JSON.stringify(positions))
  } catch {
    /* archiviazione non disponibile */
  }
}
