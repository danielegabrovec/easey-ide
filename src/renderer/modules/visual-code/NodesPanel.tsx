// Editor a nodi: eventi, azioni e valori collegati da fili. Il flusso (filo bianco, "poi") decide
// l'ordine delle azioni; i dati (fili colorati) portano valori nei parametri. Il codice si genera accanto.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { IDockviewPanelProps } from 'dockview'
import { Handle, MarkerType, Position, ReactFlowProvider, useEdges, useEdgesState, useNodesState, useReactFlow, type Connection, type Edge, type Node, type NodeProps } from '@xyflow/react'
import { basenameOf } from '@shared/paths'
import { generateNodesCode, NODE_SPECS, specOf, type NodeCategory, type NodeSpec } from '@shared/visual/nodes'
import { generatedPath, type ExportedFunction, type NodesProgram, type VisualProgram } from '@shared/visual/program'
import { GraphCanvas } from '../../graph-canvas/GraphCanvas'
import { on } from '../../workbench/events'
import { notifyError } from '../../workbench/notifications'
import { t } from '../../i18n'
import { CodePreview } from './CodePreview'
import { loadSymbols, readProgram, writeProgram, type ProjectSymbols } from './project-files'
import { VisualToolbar } from './VisualToolbar'

type FlowNode = Node<{ type: string; values: Record<string, string>; active?: boolean }, 'visual'>

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

  const update = useCallback((id: string, name: string, value: string) => setNodes((list) => list.map((n) => (n.id === id ? { ...n, data: { ...n.data, values: { ...n.data.values, [name]: value } } } : n))), [setNodes])

  const addNode = (type: string, position?: { x: number; y: number }) => {
    const spec = specOf(type)!
    const values = Object.fromEntries(spec.fields.filter((f) => f.default !== undefined).map((f) => [f.name, f.default!]))
    const center = position ?? flow.screenToFlowPosition({ x: window.innerWidth / 2.4, y: window.innerHeight / 2.6 })
    const id = `${type}-${Date.now().toString(36)}`
    setNodes((list) => [...list, { id, type: 'visual', position: center, data: { type, values } }])
  }

  const isValidConnection = (connection: Connection | Edge) => {
    const source = nodes.find((n) => n.id === connection.source)
    const target = nodes.find((n) => n.id === connection.target)
    if (!source || !target || source.id === target.id) return false
    const exec = connection.sourceHandle !== 'out'
    return exec ? connection.targetHandle === 'in' : connection.targetHandle !== 'in'
  }

  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target) return
    const edge = { id: `${connection.source}:${connection.sourceHandle}->${connection.target}:${connection.targetHandle}`, source: connection.source, sourceHandle: connection.sourceHandle ?? '', target: connection.target, targetHandle: connection.targetHandle ?? '' }
    // Un ingresso di dati accetta un solo filo: quello nuovo sostituisce il vecchio.
    setEdges((list) => [...list.filter((e) => edge.targetHandle === 'in' || !(e.target === edge.target && e.targetHandle === edge.targetHandle)), edgeStyle(edge)])
  }

  const categories = Object.keys(CATEGORY_LABEL) as NodeCategory[]

  return (
    <Ctx.Provider value={{ symbols, update }}>
      <div className="panel visual-panel" data-testid="nodes-editor">
        {current && <VisualToolbar path={path} program={current} cleanCode={cleanCode} allowConsole={false} onChange={(next: VisualProgram) => setProgram({ ...(next as NodesProgram) })} flush={flush} />}
        <div className="visual-body nodes">
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
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                isValidConnection={isValidConnection}
                fitViewOptions={{ maxZoom: 1 }}
                minimap={nodes.length > 8}
                fitKey={nodes.length}
              />
            )}
          </div>
          <div className="visual-side">
            <div className="panel-toolbar">
              <span className="title">{t('visual.generated')}</span>
            </div>
            <CodePreview code={code} />
          </div>
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
