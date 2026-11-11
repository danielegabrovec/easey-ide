// Diagramma Entità-Relazioni generato dallo schema reale del database. Le tabelle si spostano a mano
// e la posizione si ricorda; doppio clic su una tabella = mostra i dati.
import { useEffect, useMemo, useState } from 'react'
import { Handle, MarkerType, Position, useEdgesState, useNodesState, type Edge, type Node, type NodeProps } from '@xyflow/react'
import { KeyRound, Link2, Plus, RefreshCw, LayoutGrid } from 'lucide-react'
import type { DbTable } from '@shared/contracts/db'
import { GraphCanvas, gridLayout, loadPositions, savePositions } from '../../graph-canvas/GraphCanvas'
import { executeCommand } from '../../workbench/commands'
import { t } from '../../i18n'
import { activeConnection, useSql } from './sql-store'

type TableNode = Node<{ table: DbTable }, 'table'>

const ROW = 22
const HEADER = 32
const WIDTH = 230

function TableNodeView({ data }: NodeProps<TableNode>) {
  const { table } = data
  const fkColumns = new Set(table.foreignKeys.map((f) => f.column))
  return (
    <div className={`er-table${table.kind === 'view' ? ' view' : ''}`} style={{ width: WIDTH }} data-er-table={table.name}>
      <div className="er-head">
        <strong>{table.name}</strong>
        {table.rowCount !== null && <span className="hint">{table.rowCount}</span>}
      </div>
      {table.columns.map((column) => (
        <div key={column.name} className="er-col" style={{ height: ROW }}>
          <Handle type="target" position={Position.Left} id={`in-${column.name}`} className="er-handle" />
          {column.primaryKey ? <KeyRound size={11} color="var(--warning)" /> : fkColumns.has(column.name) ? <Link2 size={11} color="var(--accent-strong)" /> : <span style={{ width: 11 }} />}
          <span className={column.primaryKey ? 'pk' : ''}>{column.name}</span>
          <span className="er-type">{column.type.toLowerCase()}</span>
          <Handle type="source" position={Position.Right} id={`out-${column.name}`} className="er-handle" />
        </div>
      ))}
    </div>
  )
}

const nodeTypes = { table: TableNodeView }

export function ErDiagramPanel() {
  const activeId = useSql((s) => s.activeId)
  const schema = useSql((s) => s.schemas[s.activeId])
  const [nodes, setNodes, onNodesChange] = useNodesState<TableNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [layoutVersion, setLayoutVersion] = useState(0)
  const key = `er:${activeId}`

  useEffect(() => {
    if (!schema) void useSql.getState().loadSchema(activeId)
  }, [schema, activeId])

  const tables = useMemo(() => schema?.tables ?? [], [schema])

  useEffect(() => {
    const saved = layoutVersion === 0 ? loadPositions(key) : {}
    const auto = gridLayout(tables, (table) => ({ width: WIDTH, height: HEADER + table.columns.length * ROW }), Math.max(2, Math.ceil(Math.sqrt(tables.length))), 70)
    setNodes(tables.map((table, index) => ({ id: table.name, type: 'table', position: saved[table.name] ?? auto[index]!, data: { table } })))
    setEdges(
      tables.flatMap((table) =>
        table.foreignKeys.map((fk) => ({
          id: `${table.name}.${fk.column}->${fk.refTable}.${fk.refColumn}`,
          source: table.name,
          sourceHandle: `out-${fk.column}`,
          target: fk.refTable,
          targetHandle: `in-${fk.refColumn}`,
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed },
          label: `${fk.column} → ${fk.refColumn}`,
          labelBgPadding: [4, 2] as [number, number],
          className: 'er-edge'
        }))
      )
    )
    if (layoutVersion > 0) savePositions(key, {})
  }, [tables, key, layoutVersion, setNodes, setEdges])

  const connection = activeConnection()

  return (
    <div className="panel">
      <div className="panel-toolbar">
        <span className="title">{t('sql.erTitle', { name: connection?.name ?? '' })}</span>
        <span style={{ flex: 1 }} />
        <button className="btn ghost" onClick={() => executeCommand('sql.newTable')}>
          <Plus size={13} /> {t('sql.newTable')}
        </button>
        <button className="icon-btn" title={t('sql.autoLayout')} onClick={() => setLayoutVersion((v) => v + 1)}>
          <LayoutGrid size={14} />
        </button>
        <button className="icon-btn" title={t('sql.refresh')} onClick={() => useSql.getState().loadSchema(activeId)}>
          <RefreshCw size={13} />
        </button>
      </div>
      <div className="panel-body" data-testid="er-diagram">
        {tables.length === 0 ? (
          <div className="empty-state">{t('sql.erEmpty')}</div>
        ) : (
          <GraphCanvas<TableNode, Edge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodesConnectable={false}
            deleteKeyCode={null}
            minimap={tables.length > 6}
            fitKey={`${tables.length}-${layoutVersion}`}
            onNodeDragStop={() => setNodes((current) => (savePositions(key, Object.fromEntries(current.map((n) => [n.id, n.position]))), current))}
            onNodeDoubleClick={(_, node) => executeCommand('sql.showData', { table: node.id })}
          />
        )}
      </div>
    </div>
  )
}
