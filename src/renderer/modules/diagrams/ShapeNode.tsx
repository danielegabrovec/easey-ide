// Una forma del diagramma: disegno SVG, testo (doppio clic per scriverlo), maniglie sui 4 lati,
// ridimensionamento quando è selezionata. Tabelle ER e classi UML mostrano i loro scomparti.
import { useContext, useEffect, useRef, useState } from 'react'
import { Handle, NodeResizer, Position, type Node, type NodeProps } from '@xyflow/react'
import { parseTableText } from '@shared/diagrams/er'
import type { ShapeKind } from '@shared/diagrams/model'
import { parseClassText } from '@shared/diagrams/uml'
import { DiagramContext } from './diagram-context'

export type ShapeData = { shape: ShapeKind; text: string; fill?: string; color?: string }
export type ShapeFlowNode = Node<ShapeData, 'shape'>

export const DEFAULT_FILL: Partial<Record<ShapeKind, string>> = {
  inizio: '#dcfce7',
  processo: '#e0e7ff',
  decisione: '#fef3c7',
  io: '#cffafe',
  nota: '#fef9c3',
  cerchio: '#fce7f3',
  database: '#e0f2fe',
  tabella: '#ffffff',
  classe: '#ffffff',
  idea: '#ede9fe',
  cornice: 'transparent',
  testo: 'transparent'
}

function Outline({ shape, width, height, fill }: { shape: ShapeKind; width: number; height: number; fill: string }) {
  const stroke = '#475569'
  const common = { fill, stroke, strokeWidth: 1.5 }
  switch (shape) {
    case 'inizio':
      return <rect x={1} y={1} width={width - 2} height={height - 2} rx={(height - 2) / 2} {...common} />
    case 'decisione':
      return <polygon points={`${width / 2},1 ${width - 1},${height / 2} ${width / 2},${height - 1} 1,${height / 2}`} {...common} />
    case 'io':
      return <polygon points={`${width * 0.15},1 ${width - 1},1 ${width * 0.85},${height - 1} 1,${height - 1}`} {...common} />
    case 'cerchio':
      return <ellipse cx={width / 2} cy={height / 2} rx={width / 2 - 1} ry={height / 2 - 1} {...common} />
    case 'database':
      return (
        <g {...common}>
          <path d={`M1,10 A${width / 2 - 1},9 0 0 1 ${width - 1},10 L${width - 1},${height - 10} A${width / 2 - 1},9 0 0 1 1,${height - 10} Z`} />
          <path d={`M1,10 A${width / 2 - 1},9 0 0 0 ${width - 1},10`} fill="none" />
        </g>
      )
    case 'nota':
      return <path d={`M1,1 L${width - 16},1 L${width - 1},16 L${width - 1},${height - 1} L1,${height - 1} Z`} {...common} />
    case 'idea':
      return <rect x={1} y={1} width={width - 2} height={height - 2} rx={16} {...common} />
    case 'cornice':
      return <rect x={1} y={1} width={width - 2} height={height - 2} rx={10} fill="rgba(109,124,255,0.05)" stroke="#6d7cff" strokeDasharray="6 4" strokeWidth={1.5} />
    case 'testo':
      return null
    default:
      return <rect x={1} y={1} width={width - 2} height={height - 2} rx={6} {...common} />
  }
}

function Body({ shape, text }: { shape: ShapeKind; text: string }) {
  if (shape === 'tabella') {
    const table = parseTableText(text)
    return (
      <div className="dg-compartments">
        <div className="dg-title">{table.name}</div>
        {table.columns.map((c) => (
          <div key={c.name} className="dg-row">
            <span>
              {c.primaryKey ? '🔑 ' : c.references ? '🔗 ' : ''}
              {c.name}
            </span>
            <span className="dg-type">{c.type.toLowerCase()}</span>
          </div>
        ))}
      </div>
    )
  }
  if (shape === 'classe') {
    const cls = parseClassText(text)
    return (
      <div className="dg-compartments">
        <div className="dg-title">{cls.name}</div>
        <div className="dg-section">{cls.attributes.map((a) => <div key={a}>{a}</div>)}</div>
        <div className="dg-section">{cls.methods.map((m) => <div key={m}>{m}</div>)}</div>
      </div>
    )
  }
  return <div className={`dg-text${shape === 'cornice' ? ' frame' : ''}`}>{text}</div>
}

export function ShapeNode({ id, data, selected, width, height }: NodeProps<ShapeFlowNode>) {
  const { setText } = useContext(DiagramContext)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(data.text)
  const area = useRef<HTMLTextAreaElement>(null)
  const w = width ?? 160
  const h = height ?? 60

  useEffect(() => {
    if (!editing) setDraft(data.text)
  }, [data.text, editing])

  useEffect(() => {
    if (editing) {
      area.current?.focus()
      area.current?.select()
    }
  }, [editing])

  return (
    <div className={`dg-node shape-${data.shape}`} style={{ width: w, height: h, color: data.color }} onDoubleClick={() => setEditing(true)} data-shape={data.shape}>
      <NodeResizer isVisible={selected && !editing} minWidth={40} minHeight={30} lineClassName="dg-resize-line" handleClassName="dg-resize-handle" />
      <svg className="dg-svg" width={w} height={h}>
        <Outline shape={data.shape} width={w} height={h} fill={data.fill || DEFAULT_FILL[data.shape] || '#ffffff'} />
      </svg>
      {editing ? (
        <textarea
          ref={area}
          className="dg-editor nodrag nowheel"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false)
            if (draft !== data.text) setText(id, draft)
          }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') {
              setDraft(data.text)
              setEditing(false)
            } else if (e.key === 'Enter' && !e.shiftKey && !['tabella', 'classe', 'processo', 'nota'].includes(data.shape)) {
              e.preventDefault()
              ;(e.target as HTMLTextAreaElement).blur()
            }
          }}
          data-testid="shape-editor"
        />
      ) : (
        <Body shape={data.shape} text={data.text} />
      )}
      {(['t', 'r', 'b', 'l'] as const).map((side) => (
        <Handle
          key={side}
          id={side}
          type="source"
          position={side === 't' ? Position.Top : side === 'r' ? Position.Right : side === 'b' ? Position.Bottom : Position.Left}
          className="dg-handle"
        />
      ))}
    </div>
  )
}
