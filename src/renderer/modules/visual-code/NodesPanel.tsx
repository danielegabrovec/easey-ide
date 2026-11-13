// Editor a nodi: eventi, azioni e valori collegati da fili. Il flusso (filo bianco, "poi") decide
// l'ordine delle azioni; i dati (fili colorati) portano valori nei parametri. Il codice si genera accanto.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { IDockviewPanelProps } from 'dockview'
import { Handle, MarkerType, Position, ReactFlowProvider, useEdges, useEdgesState, useNodesState, useReactFlow, type Connection, type Edge, type FinalConnectionState, type Node, type NodeProps } from '@xyflow/react'
import { basenameOf } from '@shared/paths'
import { compatibleNodes, connectWire, History, reconnectWire, wireId } from '@shared/visual/graph-edit'
import { idAtLine, mapSteps } from '@shared/visual/code-map'
import { useCodeSideOpen } from './code-side'
import { generateNodesCode, NODE_SPECS, specOf, type NodeCategory, type NodeSpec } from '@shared/visual/nodes'
import { showContextMenu } from '../../ui/ContextMenu'
import { generatedPath, type ExportedFunction, type NodesProgram, type VisualProgram } from '@shared/visual/program'
import { GraphCanvas } from '../../graph-canvas/GraphCanvas'
import { on } from '../../workbench/events'
import { notifyError } from '../../workbench/notifications'
import { t } from '../../i18n'
import { CodePreview } from './CodePreview'
import { loadSymbols, readProgram, writeProgram, type ProjectSymbols } from './project-files'
import { VisualToolbar } from './VisualToolbar'

type FlowNode = Node<{ type: string; values: Record<string, string>; active?: boolean }, 'visual'>
interface Snapshot {
  nodes: FlowNode[]
  edges: Edge[]
}

const CATEGORY_LABEL: Record<NodeCategory, string> = { evento: 'Eventi', azione: 'Azioni', controllo: 'Controllo', valore: 'Valori' }

interface NodeContext {
  symbols: ProjectSymbols
  update: (id: string, name: string, value: string) => void
}
const Ctx = createContext<NodeContext>({ symbols: { ids: [], functions: [] }, update: () => undefined })

function FieldInput({ nodeId, spec, field, value, connected }: { nodeId: string; spec: NodeSpec; field: NodeSpec['fields'][number]; value: string; connected: boolean }) {
  const { symbols, update } = useContext(Ctx)
  if (connected) return <span className="vn-connected">{t('visual.fromLink')}</span>
  const set = (v: string) => update(nodeId, field.name, v)
  if (field.kind === 'elemento') {
    return (
      <select className="nodrag" value={value} onChange={(e) => set(e.target.value)} data-field={field.name}>
        <option value="">—</option>
        {[...new Set([...symbols.ids, ...(value ? [value.replace(/^#/, '')] : [])])].map((id) => (
          <option key={id} value={id}>
            #{id}
          </option>
        ))}
      </select>
    )
  }
  if (field.kind === 'evento' || field.kind === 'scelta') {
    return (
      <select className="nodrag" value={value || field.default || ''} onChange={(e) => set(e.target.value)} data-field={field.name}>
        {(field.options ?? []).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    )
  }
  if (field.kind === 'funzione') {
    return (
      <select className="nodrag" value={value} onChange={(e) => set(e.target.value)} data-field={field.name}>
        <option value="">—</option>
        {symbols.functions.map((fn: ExportedFunction) => (
          <option key={`${fn.path}#${fn.name}`} value={`${fn.path}#${fn.name}`}>
            {fn.name}({fn.params.join(', ')}) · {fn.path}
          </option>
        ))}
      </select>
    )
  }
  void spec
  return <input className="nodrag" value={value} placeholder={field.default} onChange={(e) => set(e.target.value)} type={field.kind === 'numero' ? 'number' : 'text'} spellCheck={false} data-field={field.name} />
}

function VisualNode({ id, data }: NodeProps<FlowNode>) {
  const spec = specOf(data.type)
  const { symbols } = useContext(Ctx)
  const edges = useEdges()
  if (!spec) return <div className="vnode">?</div>
  const fn = spec.type === 'chiama' ? symbols.functions.find((f) => `${f.path}#${f.name}` === data.values['funzione']) : undefined
  const visibleFields = spec.fields.filter((f) => !(spec.type === 'chiama' && f.name.startsWith('arg') && (!fn || Number(f.name.slice(3)) >= fn.params.length)))
  return (
    <div className={`vnode cat-${spec.category}${data.active ? ' active' : ''}`} data-vnode={data.type}>
      <div className="vnode-head">
        {spec.execIn && <Handle type="target" position={Position.Left} id="in" className="vn-exec" />}
        <span>{spec.label}</span>
      </div>
      {visibleFields.map((field) => {
        const isInput = spec.inputs.includes(field.name)
        const connected = isInput && edges.some((e) => e.target === id && e.targetHandle === field.name)
        const label = spec.type === 'chiama' && fn && field.name.startsWith('arg') ? fn.params[Number(field.name.slice(3))] : field.label
        return (
          <div key={field.name} className="vnode-field">
            {isInput && <Handle type="target" position={Position.Left} id={field.name} className="vn-data" />}
            <label>{label}</label>
            <FieldInput nodeId={id} spec={spec} field={field} value={data.values[field.name] ?? ''} connected={connected} />
          </div>
        )
      })}
      {spec.execOut.map((out) => (
        <div key={out} className="vnode-out">
          <span>{out}</span>
          <Handle type="source" position={Position.Right} id={out} className="vn-exec" />
        </div>
      ))}
      {spec.output && (
        <div className="vnode-out">
          <span>{t('visual.value')}</span>
          <Handle type="source" position={Position.Right} id="out" className="vn-data" />
        </div>
      )}
    </div>
  )
}

const nodeTypes = { visual: VisualNode }

function toFlow(program: NodesProgram): { nodes: FlowNode[]; edges: Edge[] } {
  return {
    nodes: program.nodes.map((n) => ({ id: n.id, type: 'visual', position: { x: n.x, y: n.y }, data: { type: n.type, values: n.data } })),
    edges: program.edges.map(edgeStyle)
  }
}

function edgeStyle(edge: { id: string; source: string; sourceHandle: string; target: string; targetHandle: string }): Edge {
  const exec = edge.targetHandle === 'in'
  return { ...edge, className: exec ? 'vn-edge-exec' : 'vn-edge-data', markerEnd: exec ? { type: MarkerType.ArrowClosed } : undefined, animated: !exec }
}

function Editor({ path }: { path: string }) {
  const [program, setProgram] = useState<NodesProgram | null>(null)
  const [symbols, setSymbols] = useState<ProjectSymbols>({ ids: [], functions: [] })
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [loaded, setLoaded] = useState(false)
  const flow = useReactFlow()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void Promise.all([readProgram(path, 'nodi'), loadSymbols()]).then(([p, s]) => {
      const nodesProgram = p as NodesProgram
      setProgram(nodesProgram)
      setSymbols(s)
      const { nodes: n, edges: e } = toFlow(nodesProgram)
      setNodes(n)
      setEdges(e)
      setLoaded(true)
    }, notifyError)
  }, [path, setNodes, setEdges])

  const current = useMemo<NodesProgram | null>(
    () =>
      program && {
        ...program,
        nodes: nodes.map((n) => ({ id: n.id, type: n.data.type, x: Math.round(n.position.x), y: Math.round(n.position.y), data: n.data.values })),
        edges: edges.map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle ?? '', target: e.target, targetHandle: e.targetHandle ?? '' }))
      },
    [program, nodes, edges]
  )
  const options = useMemo(() => ({ outputPath: generatedPath(path), sourceName: basenameOf(path), functions: symbols.functions }), [path, symbols])
  const code = useMemo(() => (current ? generateNodesCode(current, options) : ''), [current, options])
  const cleanCode = useMemo(() => (current ? generateNodesCode({ ...current, highlight: false }, options) : ''), [current, options])
  // Mappa nodo ↔ righe del codice pulito (vista affiancata grafica ↔ codice).
  const codeMap = useMemo(() => {
    if (!current) return { clean: '', ranges: {} }
    const headers = new Set(current.nodes.filter((n) => specOf(n.type)?.category === 'evento').map((n) => n.id))
    return mapSteps(generateNodesCode({ ...current, highlight: true }, options), headers)
  }, [current, options])
  const selectedId = useMemo(() => {
    const selected = nodes.filter((n) => n.selected)
    return selected.length === 1 ? selected[0]!.id : null
  }, [nodes])
  const selectedRange = selectedId ? codeMap.ranges[selectedId] : undefined
  const rangeKey = selectedRange ? `${selectedId}:${selectedRange.startLine}-${selectedRange.endLine}` : ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const highlight = useMemo(() => selectedRange ?? null, [rangeKey])
  const sideOpen = useCodeSideOpen(`visual:${path}`)
  // Codice → grafica: clic su una riga = il suo nodo selezionato e portato in vista.
  const onLineClick = (line: number) => {
    const id = idAtLine(codeMap.ranges, line)
    const target = id ? nodes.find((n) => n.id === id) : undefined
    if (!target) return
    setNodes((list) => list.map((n) => (n.selected === (n.id === id) ? n : { ...n, selected: n.id === id })))
    void flow.setCenter(target.position.x + (target.measured?.width ?? 180) / 2, target.position.y + (target.measured?.height ?? 80) / 2, { zoom: flow.getZoom(), duration: 250 })
  }

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    if (current) await writeProgram(path, current, code).catch(notifyError)
  }, [current, code, path])

  // Salvataggio automatico (poco dopo l'ultima modifica).
  useEffect(() => {
    if (!loaded || !current) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void writeProgram(path, current, code).catch(notifyError), 500)
  }, [loaded, current, code, path])

  // Nodo in esecuzione nell'anteprima.
  useEffect(() => {
    let reset: ReturnType<typeof setTimeout> | null = null
    return on('preview:step', ({ id }) => {
      setNodes((list) => (list.some((n) => n.id === id) ? list.map((n) => ({ ...n, data: { ...n.data, active: n.id === id } })) : list))
      if (reset) clearTimeout(reset)
      reset = setTimeout(() => setNodes((list) => list.map((n) => (n.data.active ? { ...n, data: { ...n.data, active: false } } : n))), 900)
    })
  }, [setNodes])

  // ---------------------------------------------------------------- Annulla / Ripeti (Ctrl+Z, Ctrl+Y)
  const history = useRef(new History<Snapshot>())
  const live = useRef<Snapshot>({ nodes: [], edges: [] })
  live.current = { nodes, edges }
  const lastField = useRef<{ key: string; at: number } | null>(null)
  /** Istantanea dello stato com'è ora, prima di cambiarlo. */
  const remember = useCallback(() => history.current.record({ nodes: live.current.nodes.map((n) => ({ ...n, data: { ...n.data, active: false } })), edges: live.current.edges }), [])
  const restore = (snapshot: Snapshot | null) => {
    if (!snapshot) return
    setNodes(snapshot.nodes)
    setEdges(snapshot.edges)
  }
  const undo = () => restore(history.current.undo(live.current))
  const redo = () => restore(history.current.redo(live.current))

  const update = useCallback(
    (id: string, name: string, value: string) => {
      // Scrivendo in un campo si salva un passo solo all'inizio (non a ogni lettera).
      const key = `${id}.${name}`
      const now = Date.now()
      if (lastField.current?.key !== key || now - lastField.current.at > 1500) remember()
      lastField.current = { key, at: now }
      setNodes((list) => list.map((n) => (n.id === id ? { ...n, data: { ...n.data, values: { ...n.data.values, [name]: value } } } : n)))
    },
    [setNodes, remember]
  )

  /** Centro della parte visibile del canvas, in coordinate del grafo (i nodi nuovi nascono lì). */
  const viewCenter = () => {
    const box = canvasRef.current?.getBoundingClientRect()
    const centre = box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    // Uno accanto all'altro, non tutti sullo stesso punto.
    const shift = (added.current++ % 6) * 24
    const point = flow.screenToFlowPosition(centre)
    return { x: point.x - 90 + shift, y: point.y - 40 + shift }
  }
  const added = useRef(0)

  const addNode = (type: string, position?: { x: number; y: number }): string => {
    const spec = specOf(type)!
    const values = Object.fromEntries(spec.fields.filter((f) => f.default !== undefined).map((f) => [f.name, f.default!]))
    const id = `${type}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`
    remember()
    setNodes((list) => [...list, { id, type: 'visual', position: position ?? viewCenter(), data: { type, values } }])
    return id
  }

  const isValidConnection = (connection: Connection | Edge) => {
    const source = nodes.find((n) => n.id === connection.source)
    const target = nodes.find((n) => n.id === connection.target)
    if (!source || !target || source.id === target.id) return false
    const exec = connection.sourceHandle !== 'out'
    return exec ? connection.targetHandle === 'in' : connection.targetHandle !== 'in'
  }

  const wireOf = (connection: Connection) => {
    const wire = { source: connection.source, sourceHandle: connection.sourceHandle ?? '', target: connection.target, targetHandle: connection.targetHandle ?? '' }
    return edgeStyle({ ...wire, id: wireId(wire) })
  }

  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target) return
    remember()
    // Un'uscita di flusso ha un solo filo e un ingresso di dati un solo valore: il nuovo sostituisce il vecchio.
    setEdges((list) => connectWire(list, wireOf(connection)))
  }

  // Si ricollega un filo trascinandone un capo su un'altra maniglia.
  const reconnected = useRef(false)
  const onReconnect = (old: Edge, connection: Connection) => {
    reconnected.current = true
    remember()
    setEdges((list) => reconnectWire(list, old, wireOf(connection)))
  }
  // Un capo trascinato e lasciato nel vuoto stacca il filo.
  const onReconnectEnd = (_event: unknown, old: Edge) => {
    if (!reconnected.current) {
      remember()
      setEdges((list) => list.filter((e) => e.id !== old.id))
    }
    reconnected.current = false
  }

  // Filo lasciato nel vuoto: menu dei nodi compatibili, il nodo scelto nasce lì già collegato (come in Unreal).
  const onConnectEnd = (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid || !state.fromHandle || !state.fromNode) return
    const point = 'changedTouches' in event ? event.changedTouches[0]! : event
    const side = state.fromHandle.type
    const handle = state.fromHandle.id ?? (side === 'source' ? 'poi' : 'in')
    const from = state.fromNode.id
    const choices = compatibleNodes(side, handle)
    if (!choices.length) return
    showContextMenu(
      { clientX: point.clientX, clientY: point.clientY, preventDefault: () => undefined, stopPropagation: () => undefined },
      choices.map(({ spec, handle: other }) => ({
        label: spec.label,
        run: () => {
          const position = flow.screenToFlowPosition({ x: point.clientX, y: point.clientY })
          const id = addNode(spec.type, side === 'source' ? position : { x: position.x - 220, y: position.y })
          const connection = side === 'source' ? { source: from, sourceHandle: handle, target: id, targetHandle: other } : { source: id, sourceHandle: other, target: from, targetHandle: handle }
          setEdges((list) => connectWire(list, wireOf(connection)))
        }
      }))
    )
  }

  // Le cancellazioni (tasto Canc) e gli spostamenti finiscono nella cronologia.
  const onNodesChangeWithHistory: typeof onNodesChange = (changes) => {
    if (changes.some((c) => c.type === 'remove')) remember()
    onNodesChange(changes)
  }
  const onEdgesChangeWithHistory: typeof onEdgesChange = (changes) => {
    if (changes.some((c) => c.type === 'remove')) remember()
    onEdgesChange(changes)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, select, [contenteditable="true"], .monaco-editor')) return
    const ctrl = event.ctrlKey || event.metaKey
    if (ctrl && event.key.toLowerCase() === 'z' && !event.shiftKey) {
      event.preventDefault()
      undo()
    } else if (ctrl && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
      event.preventDefault()
      redo()
    }
  }

  const categories = Object.keys(CATEGORY_LABEL) as NodeCategory[]

  return (
    <Ctx.Provider value={{ symbols, update }}>
      {/* tabIndex -1: un clic nel canvas porta qui il fuoco, così Ctrl+Z e Ctrl+Y arrivano. */}
      <div className="panel visual-panel" data-testid="nodes-editor" onKeyDown={onKeyDown} tabIndex={-1} style={{ outline: 'none' }}>
        {current && <VisualToolbar path={path} program={current} cleanCode={cleanCode} allowConsole={false} onChange={(next: VisualProgram) => setProgram({ ...(next as NodesProgram) })} flush={flush} />}
        <div className={`visual-body nodes${sideOpen ? '' : ' no-side'}`}>
          <div className="vn-palette">
            {categories.map((category) => (
              <section key={category}>
                <h4>{CATEGORY_LABEL[category]}</h4>
                {NODE_SPECS.filter((s) => s.category === category).map((spec) => (
                  <button
                    key={spec.type}
                    className={`palette-item cat-${spec.category}`}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/x-lab-node', spec.type)}
                    onClick={() => addNode(spec.type)}
                    data-node-type={spec.type}
                  >
                    {spec.label}
                  </button>
                ))}
              </section>
            ))}
          </div>
          <div
            className="vn-canvas"
            ref={canvasRef}
            onDragOver={(e) => e.dataTransfer.types.includes('text/x-lab-node') && e.preventDefault()}
            onDrop={(e) => {
              const type = e.dataTransfer.getData('text/x-lab-node')
              if (type) addNode(type, flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }))
            }}
          >
            {loaded && (
              <GraphCanvas<FlowNode, Edge>
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChangeWithHistory}
                onEdgesChange={onEdgesChangeWithHistory}
                onNodeDragStart={() => remember()}
                onConnect={onConnect}
                onConnectEnd={onConnectEnd}
                edgesReconnectable
                onReconnect={onReconnect}
                onReconnectEnd={onReconnectEnd}
                isValidConnection={isValidConnection}
                fitViewOptions={{ maxZoom: 1 }}
                minimap={nodes.length > 8}
                // Si adatta la vista solo all'apertura: aggiungere un nodo non deve far saltare il punto su cui si lavora.
                fitKey={path}
              />
            )}
          </div>
          {sideOpen && (
            <div className="visual-side">
              <div className="panel-toolbar">
                <span className="title">{t('visual.generated')}</span>
              </div>
              <CodePreview code={codeMap.clean} highlight={highlight} onLineClick={onLineClick} />
            </div>
          )}
        </div>
      </div>
    </Ctx.Provider>
  )
}

export function NodesPanel({ params }: IDockviewPanelProps<{ path: string }>) {
  return (
    <ReactFlowProvider>
      <Editor path={params.path} />
    </ReactFlowProvider>
  )
}
