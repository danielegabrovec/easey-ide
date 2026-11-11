// Modello dei diagrammi (file nome.diagramma.json): forme, connettori, tipo di diagramma.

export type DiagramType = 'flowchart' | 'er' | 'uml' | 'mappa' | 'libero'

export type ShapeKind =
  | 'inizio' // terminale (ovale): Inizio / Fine
  | 'processo' // rettangolo: un'istruzione
  | 'decisione' // rombo: una condizione
  | 'io' // parallelogramma: leggi / scrivi
  | 'nota'
  | 'testo'
  | 'cerchio'
  | 'database'
  | 'tabella' // entità ER: nome + colonne
  | 'classe' // classe UML: nome --- attributi --- metodi
  | 'idea' // nodo di mappa mentale
  | 'cornice' // gruppo

export interface DiagramNode {
  id: string
  shape: ShapeKind
  x: number
  y: number
  width: number
  height: number
  text: string
  fill?: string
  color?: string
  /** Nodo contenuto in una cornice (posizione relativa alla cornice). */
  parent?: string
}

export type EdgeRouting = 'ortogonale' | 'curva' | 'dritta'

export interface DiagramEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  label?: string
  routing?: EdgeRouting
  arrow?: 'fine' | 'entrambe' | 'nessuna'
  dashed?: boolean
}

export interface Diagram {
  kind: 'diagramma'
  version: 1
  type: DiagramType
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}

export const DIAGRAM_SUFFIX = '.diagramma.json'

export const SHAPE_SIZES: Record<ShapeKind, { width: number; height: number }> = {
  inizio: { width: 140, height: 56 },
  processo: { width: 180, height: 64 },
  decisione: { width: 170, height: 100 },
  io: { width: 180, height: 64 },
  nota: { width: 180, height: 90 },
  testo: { width: 160, height: 40 },
  cerchio: { width: 80, height: 80 },
  database: { width: 120, height: 90 },
  tabella: { width: 220, height: 140 },
  classe: { width: 220, height: 150 },
  idea: { width: 160, height: 56 },
  cornice: { width: 360, height: 240 }
}

export const SHAPES_BY_TYPE: Record<DiagramType, ShapeKind[]> = {
  flowchart: ['inizio', 'processo', 'decisione', 'io', 'nota'],
  er: ['tabella', 'nota'],
  uml: ['classe', 'nota'],
  mappa: ['idea', 'nota'],
  libero: ['processo', 'decisione', 'inizio', 'io', 'cerchio', 'database', 'nota', 'testo', 'tabella', 'classe', 'idea', 'cornice']
}

export function emptyDiagram(type: DiagramType): Diagram {
  return { kind: 'diagramma', version: 1, type, nodes: [], edges: [] }
}

export function parseDiagram(text: string): Diagram {
  try {
    const data = JSON.parse(text || '{}') as Partial<Diagram>
    const type: DiagramType = ['flowchart', 'er', 'uml', 'mappa', 'libero'].includes(data.type as string) ? (data.type as DiagramType) : 'libero'
    return { kind: 'diagramma', version: 1, type, nodes: Array.isArray(data.nodes) ? data.nodes : [], edges: Array.isArray(data.edges) ? data.edges : [] }
  } catch {
    return emptyDiagram('libero')
  }
}

export function serializeDiagram(diagram: Diagram): string {
  return `${JSON.stringify(diagram, null, 2)}\n`
}

let counter = 0
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${(++counter).toString(36)}`
}

/** Disposizione a livelli dall'alto in basso (per diagrammi importati o generati). */
export function layeredLayout(nodes: DiagramNode[], edges: DiagramEdge[], gapX = 60, gapY = 50): DiagramNode[] {
  const level = new Map<string, number>()
  const incoming = new Map(nodes.map((n) => [n.id, 0]))
  for (const edge of edges) incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1)
  const queue = nodes.filter((n) => !incoming.get(n.id)).map((n) => n.id)
  if (queue.length === 0 && nodes[0]) queue.push(nodes[0].id)
  for (const id of queue) level.set(id, 0)
  while (queue.length) {
    const id = queue.shift()!
    for (const edge of edges.filter((e) => e.source === id)) {
      if (!level.has(edge.target)) {
        level.set(edge.target, level.get(id)! + 1)
        queue.push(edge.target)
      }
    }
  }
  for (const node of nodes) if (!level.has(node.id)) level.set(node.id, 0)
  const rows = new Map<number, DiagramNode[]>()
  for (const node of nodes) rows.set(level.get(node.id)!, [...(rows.get(level.get(node.id)!) ?? []), node])
  let y = 0
  const out: DiagramNode[] = []
  for (const depth of [...rows.keys()].sort((a, b) => a - b)) {
    const row = rows.get(depth)!
    const total = row.reduce((sum, n) => sum + n.width, 0) + gapX * (row.length - 1)
    let x = -total / 2
    for (const node of row) {
      out.push({ ...node, x: Math.round(x), y })
      x += node.width + gapX
    }
    y += Math.max(...row.map((n) => n.height)) + gapY
  }
  return out
}
