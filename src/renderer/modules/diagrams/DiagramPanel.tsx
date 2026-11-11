// Editor dei diagrammi (flowchart, ER, UML, mappe, liberi) sul motore a grafo comune.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { IDockviewPanelProps } from 'dockview'
import {
  ConnectionMode,
  getNodesBounds,
  getViewportForBounds,
  MarkerType,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge
} from '@xyflow/react'
import { toPng, toSvg } from 'html-to-image'
import { Code2, Copy, Database, Download, FileCode2, Group, Link2, Play, Plus, Trash2, Ungroup, Upload } from 'lucide-react'
import { diagramToDdl, inferredRelations, schemaToDiagram } from '@shared/diagrams/er'
import { flowchartToCode } from '@shared/diagrams/flow-code'
import { fromMermaidFlowchart, toMermaid } from '@shared/diagrams/mermaid'
import { DIAGRAM_SUFFIX, newId, parseDiagram, serializeDiagram, SHAPE_SIZES, SHAPES_BY_TYPE, type Diagram, type DiagramEdge, type DiagramNode, type EdgeRouting, type ShapeKind } from '@shared/diagrams/model'
import { classToTypeScript, parseClassText } from '@shared/diagrams/uml'
import type { DbConnectionInfo, DbSchema } from '@shared/contracts/db'
import { basenameOf } from '@shared/paths'
import { ide } from '../../ipc'
import { GraphCanvas } from '../../graph-canvas/GraphCanvas'
import { executeCommand } from '../../workbench/commands'
import { notify, notifyError } from '../../workbench/notifications'
import { useWorkbench } from '../../workbench/store'
import { Modal, openDialog } from '../../ui/dialogs'
import { t } from '../../i18n'
import { DiagramContext } from './diagram-context'
import { DEFAULT_FILL, ShapeNode, type ShapeFlowNode } from './ShapeNode'

const nodeTypes = { shape: ShapeNode }

const SHAPE_LABELS: Record<ShapeKind, string> = {
  inizio: 'Inizio / Fine',
  processo: 'Istruzione',
  decisione: 'Condizione',
  io: 'Leggi / Scrivi',
  nota: 'Nota',
  testo: 'Testo',
  cerchio: 'Cerchio',
  database: 'Database',
  tabella: 'Tabella (ER)',
  classe: 'Classe (UML)',
  idea: 'Idea',
  cornice: 'Cornice'
}

const DEFAULT_TEXT: Record<ShapeKind, string> = {
  inizio: 'Inizio',
  processo: 'x = x + 1',
  decisione: 'x > 0',
  io: 'scrivi x',
  nota: 'Una nota',
  testo: 'Testo',
  cerchio: '',
  database: 'Database',
  tabella: 'nuova_tabella\nid INTEGER PK AI\nnome TEXT NN',
  classe: 'NuovaClasse\n---\n+ nome: string\n---\n+ saluta(): void',
  idea: 'Idea',
  cornice: 'Gruppo'
}

const ROUTE_TYPE: Record<EdgeRouting, string> = { ortogonale: 'smoothstep', curva: 'default', dritta: 'straight' }

function toFlowNode(node: DiagramNode): ShapeFlowNode {
  return {
    id: node.id,
    type: 'shape',
    position: { x: node.x, y: node.y },
    width: node.width,
    height: node.height,
    data: { shape: node.shape, text: node.text, fill: node.fill, color: node.color },
    parentId: node.parent,
    zIndex: node.shape === 'cornice' ? -1 : 0
  }
}

function toFlowEdge(edge: DiagramEdge): Edge {
  const arrow = edge.arrow ?? 'fine'
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    label: edge.label,
    type: ROUTE_TYPE[edge.routing ?? 'ortogonale'],
    markerEnd: arrow !== 'nessuna' ? { type: MarkerType.ArrowClosed } : undefined,
    markerStart: arrow === 'entrambe' ? { type: MarkerType.ArrowClosed } : undefined,
    style: edge.dashed ? { strokeDasharray: '6 4' } : undefined,
    data: { routing: edge.routing ?? 'ortogonale', arrow, dashed: !!edge.dashed },
    className: 'dg-edge'
  }
}

function fromFlow(type: Diagram['type'], nodes: ShapeFlowNode[], edges: Edge[]): Diagram {
  return {
    kind: 'diagramma',
    version: 1,
    type,
    nodes: nodes.map((n) => ({
      id: n.id,
      shape: n.data.shape,
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
      width: Math.round(n.measured?.width ?? n.width ?? SHAPE_SIZES[n.data.shape].width),
      height: Math.round(n.measured?.height ?? n.height ?? SHAPE_SIZES[n.data.shape].height),
      text: n.data.text,
      ...(n.data.fill ? { fill: n.data.fill } : {}),
      ...(n.data.color ? { color: n.data.color } : {}),
      ...(n.parentId ? { parent: n.parentId } : {})
    })),
    edges: edges.map((e) => {
      const data = (e.data ?? {}) as { routing?: EdgeRouting; arrow?: DiagramEdge['arrow']; dashed?: boolean }
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
        ...(e.targetHandle ? { targetHandle: e.targetHandle } : {}),
        ...(e.label ? { label: String(e.label) } : {}),
        routing: data.routing ?? 'ortogonale',
        arrow: data.arrow ?? 'fine',
        ...(data.dashed ? { dashed: true } : {})
      }
    })
  }
}

function MermaidImport({ close, onImport }: { close: () => void; onImport: (diagram: Diagram) => void }) {
  const [text, setText] = useState('flowchart TD\n  A([Inizio]) --> B[/leggi n/]\n  B --> C{n > 0}\n  C -->|sì| D[/scrivi "positivo"/]\n  C -->|no| E[/scrivi "non positivo"/]')
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal
      title={t('diagram.importMermaid')}
      wide
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            {t('common.cancel')}
          </button>
          <button
            className="btn primary"
            onClick={() => {
              try {
                onImport(fromMermaidFlowchart(text))
                close()
              } catch (err) {
                setError((err as Error).message)
              }
            }}
          >
            {t('diagram.import')}
          </button>
        </>
      }
    >
      <span className="hint">{t('diagram.importHint')}</span>
      <textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} style={{ fontFamily: 'var(--font-code)' }} data-testid="mermaid-input" />
      {error && <span className="error-text">{error}</span>}
    </Modal>
  )
}

function Editor({ path }: { path: string }) {
  const [type, setType] = useState<Diagram['type']>('libero')
  const [nodes, setNodes, onNodesChange] = useNodesState<ShapeFlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [loaded, setLoaded] = useState(false)
  const theme = useWorkbench((s) => s.settings.theme)
  const flow = useReactFlow()
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const base = path.replace(DIAGRAM_SUFFIX, '')

  const load = useCallback((diagram: Diagram) => {
    setType(diagram.type)
    // Le cornici prima dei nodi che contengono (richiesto da React Flow).
    const ordered = [...diagram.nodes].sort((a, b) => (a.shape === 'cornice' ? -1 : 0) - (b.shape === 'cornice' ? -1 : 0))
    setNodes(ordered.map(toFlowNode))
    setEdges(diagram.edges.map(toFlowEdge))
  }, [setNodes, setEdges])

  useEffect(() => {
    void ide.invoke('workspace:readFile', path).then((text) => {
      load(parseDiagram(text))
      setLoaded(true)
    }, notifyError)
  }, [path, load])

  const diagram = useMemo(() => fromFlow(type, nodes, edges), [type, nodes, edges])

  useEffect(() => {
    if (!loaded) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void ide.invoke('workspace:writeFile', path, serializeDiagram(diagram)).catch(notifyError), 400)
  }, [diagram, loaded, path])

  const setText = useCallback((id: string, text: string) => setNodes((list) => list.map((n) => (n.id === id ? { ...n, data: { ...n.data, text } } : n))), [setNodes])

  const addShape = (shape: ShapeKind, position?: { x: number; y: number }, text?: string): string => {
    const id = newId(shape)
    const at = position ?? flow.screenToFlowPosition({ x: window.innerWidth / 2.2, y: window.innerHeight / 2.4 })
    setNodes((list) => [...list.map((n) => ({ ...n, selected: false })), { ...toFlowNode({ id, shape, x: Math.round(at.x / 10) * 10, y: Math.round(at.y / 10) * 10, ...SHAPE_SIZES[shape], text: text ?? DEFAULT_TEXT[shape] }), selected: true }])
    return id
  }

  const selectedNodes = nodes.filter((n) => n.selected)
  const selectedEdge = edges.find((e) => e.selected)
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : undefined

  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return
    const source = nodes.find((n) => n.id === connection.source)
    const existing = edges.filter((e) => e.source === connection.source).length
    const label = source?.data.shape === 'decisione' ? (existing === 0 ? 'sì' : 'no') : undefined
    setEdges((list) => [...list, toFlowEdge({ id: newId('e'), source: connection.source, target: connection.target, sourceHandle: connection.sourceHandle ?? undefined, targetHandle: connection.targetHandle ?? undefined, label, routing: type === 'mappa' ? 'curva' : 'ortogonale', arrow: type === 'mappa' ? 'nessuna' : 'fine' })])
  }

  const updateEdge = (patch: Partial<DiagramEdge>) => {
    if (!selectedEdge) return
    const current = fromFlow(type, [], [selectedEdge]).edges[0]!
    setEdges((list) => list.map((e) => (e.id === selectedEdge.id ? { ...toFlowEdge({ ...current, ...patch }), selected: true } : e)))
  }

  const updateNode = (patch: Partial<ShapeFlowNode['data']>) => {
    if (!selectedNode) return
    setNodes((list) => list.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, ...patch } } : n)))
  }

  const removeSelection = () => {
    const ids = new Set(selectedNodes.map((n) => n.id))
    setNodes((list) => list.filter((n) => !ids.has(n.id) && !(n.parentId && ids.has(n.parentId))))
    setEdges((list) => list.filter((e) => !e.selected && !ids.has(e.source) && !ids.has(e.target)))
  }

  const duplicateSelection = () => {
    const copies = selectedNodes.filter((n) => n.data.shape !== 'cornice').map((n) => ({ ...n, id: newId(n.data.shape), position: { x: n.position.x + 30, y: n.position.y + 30 }, selected: true }))
    setNodes((list) => [...list.map((n) => ({ ...n, selected: false })), ...copies])
  }

  const group = () => {
    const members = selectedNodes.filter((n) => !n.parentId && n.data.shape !== 'cornice')
    if (members.length < 2) return
    const bounds = getNodesBounds(members)
    const frameId = newId('cornice')
    const pad = 24
    const frame = toFlowNode({ id: frameId, shape: 'cornice', x: bounds.x - pad, y: bounds.y - pad - 20, width: bounds.width + pad * 2, height: bounds.height + pad * 2 + 20, text: DEFAULT_TEXT.cornice })
    const ids = new Set(members.map((m) => m.id))
    setNodes((list) => [frame, ...list.map((n) => (ids.has(n.id) ? { ...n, parentId: frameId, position: { x: n.position.x - frame.position.x, y: n.position.y - frame.position.y }, selected: false } : n))])
  }

  const ungroup = () => {
    const frame = selectedNode?.data.shape === 'cornice' ? selectedNode : undefined
    if (!frame) return
    setNodes((list) => list.filter((n) => n.id !== frame.id).map((n) => (n.parentId === frame.id ? { ...n, parentId: undefined, position: { x: n.position.x + frame.position.x, y: n.position.y + frame.position.y } } : n)))
  }

  const addChildIdea = () => {
    const parent = selectedNode
    if (!parent) return
    const siblings = edges.filter((e) => e.source === parent.id).length
    const id = addShape('idea', { x: parent.position.x + (parent.measured?.width ?? 160) + 80, y: parent.position.y + siblings * 80 - 40 }, t('diagram.newIdea'))
    setEdges((list) => [...list, toFlowEdge({ id: newId('e'), source: parent.id, target: id, sourceHandle: 'r', targetHandle: 'l', routing: 'curva', arrow: 'nessuna' })])
  }

  const exportImage = async (format: 'png' | 'svg') => {
    const viewport = document.querySelector<HTMLElement>('[data-testid="diagram-editor"] .react-flow__viewport')
    if (!viewport || nodes.length === 0) return
    const bounds = getNodesBounds(nodes)
    const width = Math.min(4000, Math.ceil(bounds.width + 80))
    const height = Math.min(4000, Math.ceil(bounds.height + 80))
    const transform = getViewportForBounds(bounds, width, height, 0.2, 2, 0.05)
    const options = {
      backgroundColor: theme === 'dark' ? '#1c1f26' : '#ffffff',
      width,
      height,
      skipFonts: true,
      style: { width: `${width}px`, height: `${height}px`, transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})` }
    }
    try {
      if (format === 'png') {
        const url = await toPng(viewport, options)
        const saved = await ide.invoke('app:saveFile', `${basenameOf(base)}.png`, url.slice(url.indexOf(',') + 1), 'base64')
        if (saved) notify(t('diagram.exported', { path: saved }), 'success')
      } else {
        const url = await toSvg(viewport, options)
        const saved = await ide.invoke('app:saveFile', `${basenameOf(base)}.svg`, decodeURIComponent(url.slice(url.indexOf(',') + 1)))
        if (saved) notify(t('diagram.exported', { path: saved }), 'success')
      }
    } catch (error) {
      notifyError(error)
    }
  }

  const exportMermaid = async () => {
    const text = toMermaid(diagram)
    await navigator.clipboard.writeText(text).catch(() => undefined)
    const saved = await ide.invoke('app:saveFile', `${basenameOf(base)}.mmd`, text)
    notify(saved ? t('diagram.exported', { path: saved }) : t('diagram.mermaidCopied'), 'success')
  }

  const generateCode = async (runIt: boolean) => {
    const { code, warnings } = flowchartToCode(diagram, basenameOf(path))
    const target = `${base}.generato.js`
    await ide.invoke('workspace:writeFile', target, code)
    if (warnings.length) notify(warnings.join(' · '), 'error')
    if (runIt) await executeCommand('run.fileInTerminal', { path: target })
    else await executeCommand('editor.open', { path: target })
  }

  const importFromDatabase = async () => {
    const result = (await executeCommand('sql.activeSchema')) as { connection: DbConnectionInfo | null; schema: DbSchema | null } | undefined
    if (!result?.schema || result.schema.tables.length === 0) {
      notify(t('diagram.noSchema'), 'error')
      return
    }
    load({ ...schemaToDiagram(result.schema) })
    setTimeout(() => void flow.fitView({ duration: 200 }), 100)
    notify(t('diagram.importedSchema', { name: result.connection?.name ?? '' }), 'success')
  }

  const linkForeignKeys = () => {
    const missing = inferredRelations(diagram).filter((r) => !edges.some((e) => e.source === r.source && e.target === r.target))
    setEdges((list) => [...list, ...missing.map((r) => toFlowEdge({ id: newId('rel'), source: r.source, target: r.target, label: r.label, routing: 'ortogonale', arrow: 'fine' }))])
    notify(t('diagram.linked', { count: missing.length }), 'success')
  }

  const generateSql = async () => {
    const result = (await executeCommand('sql.activeSchema')) as { connection: DbConnectionInfo | null } | undefined
    await executeCommand('sql.openInEditor', { sql: diagramToDdl(diagram, result?.connection?.engine ?? 'sqlite') })
  }

  const generateClasses = async () => {
    const classes = (selectedNodes.length ? selectedNodes : nodes).filter((n) => n.data.shape === 'classe')
    for (const node of classes) {
      const name = parseClassText(node.data.text).name
      const file = `${name}.ts`
      try {
        await ide.invoke('workspace:createFile', file, classToTypeScript(node.data.text))
      } catch {
        await ide.invoke('workspace:writeFile', file, classToTypeScript(node.data.text))
      }
      await executeCommand('editor.open', { path: file })
    }
  }

  const palette = [...new Set([...SHAPES_BY_TYPE[type], ...(type === 'libero' ? [] : (['testo', 'cornice'] as ShapeKind[]))])]

  return (
    <DiagramContext.Provider value={{ setText }}>
      <div className="panel visual-panel" data-testid="diagram-editor">
        <div className="panel-toolbar">
          <span className="title">{t(`diagram.type.${type}` as 'diagram.type.flowchart')}</span>
          <span style={{ flex: 1 }} />
          {type === 'flowchart' && (
            <>
              <button className="btn ghost" onClick={() => generateCode(false)} data-testid="diagram-code">
                <Code2 size={14} /> {t('diagram.generateCode')}
              </button>
              <button className="btn run" onClick={() => generateCode(true)} data-testid="diagram-run">
                <Play size={12} fill="currentColor" /> {t('toolbar.run')}
              </button>
            </>
          )}
          {type === 'er' && (
            <>
              <button className="btn ghost" onClick={importFromDatabase} data-testid="diagram-import-db">
                <Database size={14} /> {t('diagram.fromDatabase')}
              </button>
              <button className="btn ghost" onClick={linkForeignKeys}>
                <Link2 size={14} /> {t('diagram.linkFk')}
              </button>
              <button className="btn ghost" onClick={generateSql} data-testid="diagram-sql">
                <FileCode2 size={14} /> {t('diagram.generateSql')}
              </button>
            </>
          )}
          {type === 'uml' && (
            <button className="btn ghost" onClick={generateClasses} data-testid="diagram-ts">
              <FileCode2 size={14} /> {t('diagram.generateTs')}
            </button>
          )}
          {(type === 'flowchart' || type === 'libero') && (
            <button className="btn ghost" onClick={() => openDialog((close) => <MermaidImport close={close} onImport={(d) => load({ ...d, type })} />)}>
              <Upload size={14} /> Mermaid
            </button>
          )}
          <div className="divider" />
          <button className="btn ghost" onClick={() => exportImage('svg')} title={t('diagram.exportSvg')}>
            <Download size={14} /> SVG
          </button>
          <button className="btn ghost" onClick={() => exportImage('png')} title={t('diagram.exportPng')}>
            PNG
          </button>
          <button className="btn ghost" onClick={exportMermaid} title={t('diagram.exportMermaid')} data-testid="diagram-mermaid">
            .mmd
          </button>
        </div>
        <div className="visual-body nodes">
          <div className="vn-palette">
            <h4>{t('diagram.shapes')}</h4>
            {palette.map((shape) => (
              <button
                key={shape}
                className="palette-item"
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/x-lab-shape', shape)}
                onClick={() => addShape(shape)}
                data-shape-item={shape}
              >
                {SHAPE_LABELS[shape]}
              </button>
            ))}
            <div className="hint" style={{ padding: '10px 4px' }}>
              {t(`diagram.hint.${type}` as 'diagram.hint.flowchart')}
            </div>
          </div>
          <div
            className="vn-canvas"
            onDragOver={(e) => e.dataTransfer.types.includes('text/x-lab-shape') && e.preventDefault()}
            onDrop={(e) => {
              const shape = e.dataTransfer.getData('text/x-lab-shape') as ShapeKind
              if (shape) addShape(shape, flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }))
            }}
            onKeyDown={(e) => {
              if (e.key === 'Tab' && type === 'mappa' && selectedNode) {
                e.preventDefault()
                addChildIdea()
              } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
                e.preventDefault()
                duplicateSelection()
              } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
                e.preventDefault()
                if (e.shiftKey) ungroup()
                else group()
              }
            }}
          >
            {loaded && (
              <GraphCanvas<ShapeFlowNode, Edge>
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                connectionMode={ConnectionMode.Loose}
                snapToGrid
                snapGrid={[10, 10]}
                minimap={nodes.length > 12}
                fitViewOptions={{ maxZoom: 1.2, padding: 0.2 }}
              />
            )}
          </div>
          <div className="visual-side diagram-inspector">
            <div className="panel-toolbar">
              <span className="title">{selectedEdge ? t('diagram.connector') : selectedNode ? SHAPE_LABELS[selectedNode.data.shape] : t('diagram.inspector')}</span>
            </div>
            <div className="insp-body">
              {selectedNode && (
                <section className="insp-section">
                  <label className="insp-field wide">
                    <span>{t('diagram.text')}</span>
                    <textarea rows={selectedNode.data.shape === 'tabella' || selectedNode.data.shape === 'classe' ? 8 : 3} value={selectedNode.data.text} onChange={(e) => updateNode({ text: e.target.value })} spellCheck={false} data-testid="diagram-text" />
                  </label>
                  <div className="insp-grid">
                    <label className="insp-field">
                      <span>{t('diagram.shape')}</span>
                      <select value={selectedNode.data.shape} onChange={(e) => updateNode({ shape: e.target.value as ShapeKind })}>
                        {(Object.keys(SHAPE_LABELS) as ShapeKind[]).map((s) => (
                          <option key={s} value={s}>
                            {SHAPE_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="insp-field">
                      <span>{t('diagram.fill')}</span>
                      <input type="color" value={selectedNode.data.fill ?? (DEFAULT_FILL[selectedNode.data.shape]?.startsWith('#') ? DEFAULT_FILL[selectedNode.data.shape] : '#ffffff')} onChange={(e) => updateNode({ fill: e.target.value })} />
                    </label>
                    <label className="insp-field">
                      <span>{t('diagram.textColor')}</span>
                      <input type="color" value={selectedNode.data.color ?? '#1d2230'} onChange={(e) => updateNode({ color: e.target.value })} />
                    </label>
                  </div>
                  {selectedNode.data.shape === 'tabella' && <span className="hint">{t('diagram.tableHint')}</span>}
                  {selectedNode.data.shape === 'classe' && <span className="hint">{t('diagram.classHint')}</span>}
                  {type === 'mappa' && (
                    <button className="btn" onClick={addChildIdea} data-testid="diagram-child">
                      <Plus size={13} /> {t('diagram.addChild')}
                    </button>
                  )}
                </section>
              )}
              {selectedEdge && (
                <section className="insp-section">
                  <label className="insp-field wide">
                    <span>{t('diagram.label')}</span>
                    <input value={String(selectedEdge.label ?? '')} onChange={(e) => updateEdge({ label: e.target.value || undefined })} spellCheck={false} />
                  </label>
                  <div className="insp-grid">
                    <label className="insp-field">
                      <span>{t('diagram.routing')}</span>
                      <select value={(selectedEdge.data as { routing: EdgeRouting }).routing} onChange={(e) => updateEdge({ routing: e.target.value as EdgeRouting })}>
                        <option value="ortogonale">{t('diagram.orthogonal')}</option>
                        <option value="curva">{t('diagram.curve')}</option>
                        <option value="dritta">{t('diagram.straight')}</option>
                      </select>
                    </label>
                    <label className="insp-field">
                      <span>{t('diagram.arrows')}</span>
                      <select value={(selectedEdge.data as { arrow: string }).arrow} onChange={(e) => updateEdge({ arrow: e.target.value as DiagramEdge['arrow'] })}>
                        <option value="fine">→</option>
                        <option value="entrambe">↔</option>
                        <option value="nessuna">—</option>
                      </select>
                    </label>
                  </div>
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="checkbox" checked={(selectedEdge.data as { dashed: boolean }).dashed} onChange={(e) => updateEdge({ dashed: e.target.checked })} />
                    {t('diagram.dashed')}
                  </label>
                </section>
              )}
              {(selectedNodes.length > 0 || selectedEdge) && (
                <div className="insp-buttons" style={{ padding: '8px 10px' }}>
                  <button className="btn ghost" onClick={duplicateSelection} disabled={!selectedNodes.length}>
                    <Copy size={13} /> {t('designer.duplicate')}
                  </button>
                  <button className="btn ghost" onClick={group} disabled={selectedNodes.length < 2}>
                    <Group size={13} /> {t('diagram.group')}
                  </button>
                  <button className="btn ghost" onClick={ungroup} disabled={selectedNode?.data.shape !== 'cornice'}>
                    <Ungroup size={13} /> {t('diagram.ungroup')}
                  </button>
                  <button className="btn ghost danger" onClick={removeSelection}>
                    <Trash2 size={13} /> {t('designer.delete')}
                  </button>
                </div>
              )}
              {!selectedNode && !selectedEdge && selectedNodes.length === 0 && <div className="hint" style={{ padding: 12 }}>{t('diagram.inspectorHint')}</div>}
            </div>
          </div>
        </div>
      </div>
    </DiagramContext.Provider>
  )
}

export function DiagramPanel({ params }: IDockviewPanelProps<{ path: string }>) {
  return (
    <ReactFlowProvider>
      <Editor path={params.path} />
    </ReactFlowProvider>
  )
}
