// Mermaid: esportazione dei diagrammi (flowchart, ER, classi, mappe) e importazione dei flowchart.
import { layeredLayout, newId, SHAPE_SIZES, type Diagram, type DiagramEdge, type DiagramNode, type ShapeKind } from './model'
import { parseTableText } from './er'
import { parseClassText } from './uml'

const SAFE = (text: string) => text.replace(/"/g, "'").replace(/\n/g, '<br/>')

function mermaidId(index: number): string {
  return `N${index + 1}`
}

function flowShape(node: DiagramNode, id: string): string {
  const text = `"${SAFE(node.text)}"`
  switch (node.shape) {
    case 'inizio':
      return `${id}([${text}])`
    case 'decisione':
      return `${id}{${text}}`
    case 'io':
      return `${id}[/${text}/]`
    case 'cerchio':
      return `${id}((${text}))`
    case 'database':
      return `${id}[(${text})]`
    default:
      return `${id}[${text}]`
  }
}

export function toMermaid(diagram: Diagram): string {
  if (diagram.type === 'er') {
    const lines = ['erDiagram']
    for (const node of diagram.nodes.filter((n) => n.shape === 'tabella')) {
      const table = parseTableText(node.text)
      lines.push(`  ${table.name} {`)
      for (const c of table.columns) lines.push(`    ${c.type.replace(/[^\w]/g, '_') || 'TEXT'} ${c.name}${c.primaryKey ? ' PK' : ''}${c.references ? ' FK' : ''}`)
      lines.push('  }')
    }
    for (const edge of diagram.edges) {
      const source = diagram.nodes.find((n) => n.id === edge.source)
      const target = diagram.nodes.find((n) => n.id === edge.target)
      if (source?.shape === 'tabella' && target?.shape === 'tabella') lines.push(`  ${parseTableText(target.text).name} ||--o{ ${parseTableText(source.text).name} : "${edge.label || 'ha'}"`)
    }
    return lines.join('\n') + '\n'
  }
  if (diagram.type === 'uml') {
    const lines = ['classDiagram']
    for (const node of diagram.nodes.filter((n) => n.shape === 'classe')) {
      const cls = parseClassText(node.text)
      lines.push(`  class ${cls.name} {`)
      for (const a of cls.attributes) lines.push(`    ${a}`)
      for (const m of cls.methods) lines.push(`    ${m}`)
      lines.push('  }')
    }
    for (const edge of diagram.edges) {
      const source = diagram.nodes.find((n) => n.id === edge.source)
      const target = diagram.nodes.find((n) => n.id === edge.target)
      if (source && target) lines.push(`  ${parseClassText(source.text).name} --> ${parseClassText(target.text).name}${edge.label ? ` : ${edge.label}` : ''}`)
    }
    return lines.join('\n') + '\n'
  }
  if (diagram.type === 'mappa') {
    const root = diagram.nodes.find((n) => !diagram.edges.some((e) => e.target === n.id)) ?? diagram.nodes[0]
    const lines = ['mindmap']
    const walk = (node: DiagramNode, depth: number, seen: Set<string>) => {
      if (seen.has(node.id)) return
      seen.add(node.id)
      lines.push(`${'  '.repeat(depth + 1)}${depth === 0 ? `((${SAFE(node.text)}))` : SAFE(node.text)}`)
      for (const edge of diagram.edges.filter((e) => e.source === node.id)) {
        const child = diagram.nodes.find((n) => n.id === edge.target)
        if (child) walk(child, depth + 1, seen)
      }
    }
    if (root) walk(root, 0, new Set())
    return lines.join('\n') + '\n'
  }
  const ids = new Map(diagram.nodes.filter((n) => n.shape !== 'cornice').map((n, i) => [n.id, mermaidId(i)]))
  const lines = ['flowchart TD']
  for (const node of diagram.nodes) if (ids.has(node.id)) lines.push(`  ${flowShape(node, ids.get(node.id)!)}`)
  for (const edge of diagram.edges) {
    const a = ids.get(edge.source)
    const b = ids.get(edge.target)
    if (!a || !b) continue
    const arrow = edge.dashed ? '-.->' : edge.arrow === 'nessuna' ? '---' : '-->'
    lines.push(`  ${a} ${arrow}${edge.label ? `|${SAFE(edge.label)}|` : ''} ${b}`)
  }
  return lines.join('\n') + '\n'
}

const NODE_PATTERN = /^([A-Za-z_][\w]*)\s*(\(\[(.+?)\]\)|\[\((.+?)\)\]|\(\((.+?)\)\)|\{(.+?)\}|\[\/(.+?)\/\]|\[(.+?)\]|\((.+?)\))?/

function unquote(text: string): string {
  return text.trim().replace(/^"(.*)"$/, '$1').replace(/<br\s*\/?>/gi, '\n')
}

/** Importa un flowchart Mermaid (graph/flowchart TD|LR) con le forme principali e le etichette sui collegamenti. */
export function fromMermaidFlowchart(source: string): Diagram {
  const lines = source
    .split(/\r?\n|;/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('%%'))
  if (!/^(graph|flowchart)\b/i.test(lines[0] ?? '')) throw new Error('Serve un flowchart Mermaid che inizi con "flowchart TD" o "graph TD".')
  const nodes = new Map<string, DiagramNode>()
  const edges: DiagramEdge[] = []

  const declare = (raw: string): string | null => {
    const match = NODE_PATTERN.exec(raw.trim())
    if (!match) return null
    const id = match[1]!
    let shape: ShapeKind = 'processo'
    let text: string | undefined
    if (match[3] !== undefined) [shape, text] = ['inizio', match[3]]
    else if (match[4] !== undefined) [shape, text] = ['database', match[4]]
    else if (match[5] !== undefined) [shape, text] = ['cerchio', match[5]]
    else if (match[6] !== undefined) [shape, text] = ['decisione', match[6]]
    else if (match[7] !== undefined) [shape, text] = ['io', match[7]]
    else if (match[8] !== undefined) text = match[8]
    else if (match[9] !== undefined) [shape, text] = ['inizio', match[9]]
    const existing = nodes.get(id)
    if (!existing) nodes.set(id, { id: newId('n'), shape, x: 0, y: 0, ...SHAPE_SIZES[shape], text: text !== undefined ? unquote(text) : id })
    else if (text !== undefined) nodes.set(id, { ...existing, shape, ...SHAPE_SIZES[shape], text: unquote(text) })
    return id
  }

  for (const line of lines.slice(1)) {
    const parts = line.split(/\s*(-->|-\.->|---|==>)\s*(?:\|([^|]*)\|\s*)?/)
    if (parts.length === 1) {
      declare(line)
      continue
    }
    let previous = declare(parts[0]!)
    for (let i = 1; i + 2 < parts.length + 1; i += 3) {
      const arrow = parts[i]!
      const label = parts[i + 1]
      const next = parts[i + 2] !== undefined ? declare(parts[i + 2]!) : null
      if (previous && next) {
        edges.push({ id: newId('e'), source: nodes.get(previous)!.id, target: nodes.get(next)!.id, label: label ? unquote(label) : undefined, dashed: arrow === '-.->', arrow: arrow === '---' ? 'nessuna' : 'fine', routing: 'ortogonale' })
      }
      previous = next
    }
  }
  const list = [...nodes.values()]
  return { kind: 'diagramma', version: 1, type: 'flowchart', nodes: layeredLayout(list, edges), edges }
}
