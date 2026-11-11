// Programmazione a nodi: catalogo dei nodi e generatore di codice JavaScript.
// Due tipi di collegamento: il FLUSSO (frecce bianche: "poi fai questo") e i DATI (valori che entrano nei parametri).
import { generatedHeader, STEP_HELPER, type ExportedFunction, type NodesProgram, type VNode } from './program'
import { dirnameOf, relativeTo } from '../paths'

export type NodeCategory = 'evento' | 'azione' | 'controllo' | 'valore'

export interface FieldSpec {
  name: string
  label: string
  kind: 'elemento' | 'evento' | 'testo' | 'numero' | 'scelta' | 'funzione'
  options?: [string, string][]
  default?: string
}

export interface NodeSpec {
  type: string
  label: string
  category: NodeCategory
  /** Ingresso di flusso. */
  execIn: boolean
  /** Uscite di flusso (nomi delle maniglie). */
  execOut: string[]
  /** Ingressi di dati: se non collegati si usa il campo con lo stesso nome. */
  inputs: string[]
  /** Uscita di dati. */
  output: boolean
  fields: FieldSpec[]
}

const EVENTS: [string, string][] = [
  ['click', 'clic'],
  ['input', 'scrittura (input)'],
  ['change', 'cambio valore'],
  ['mouseover', 'mouse sopra'],
  ['mouseout', 'mouse fuori'],
  ['submit', 'invio del modulo'],
  ['keydown', 'tasto premuto']
]

export const NODE_SPECS: NodeSpec[] = [
  { type: 'evento', label: 'Quando… (evento)', category: 'evento', execIn: false, execOut: ['poi'], inputs: [], output: false, fields: [{ name: 'elemento', label: 'Elemento', kind: 'elemento' }, { name: 'evento', label: 'Evento', kind: 'evento', options: EVENTS, default: 'click' }] },
  { type: 'avvio', label: 'All’avvio della pagina', category: 'evento', execIn: false, execOut: ['poi'], inputs: [], output: false, fields: [] },
  { type: 'timer', label: 'Ogni… millisecondi', category: 'evento', execIn: false, execOut: ['poi'], inputs: [], output: false, fields: [{ name: 'ms', label: 'Millisecondi', kind: 'numero', default: '1000' }] },
  { type: 'testo', label: 'Imposta il testo', category: 'azione', execIn: true, execOut: ['poi'], inputs: ['valore'], output: false, fields: [{ name: 'elemento', label: 'Elemento', kind: 'elemento' }, { name: 'valore', label: 'Testo', kind: 'testo', default: 'Ciao!' }] },
  {
    type: 'stile',
    label: 'Imposta uno stile',
    category: 'azione',
    execIn: true,
    execOut: ['poi'],
    inputs: ['valore'],
    output: false,
    fields: [
      { name: 'elemento', label: 'Elemento', kind: 'elemento' },
      { name: 'proprieta', label: 'Proprietà', kind: 'scelta', options: [['color', 'colore del testo'], ['backgroundColor', 'sfondo'], ['fontSize', 'dimensione testo'], ['display', 'visualizzazione'], ['opacity', 'opacità'], ['transform', 'trasformazione']], default: 'color' },
      { name: 'valore', label: 'Valore', kind: 'testo', default: 'tomato' }
    ]
  },
  { type: 'classe', label: 'Alterna una classe', category: 'azione', execIn: true, execOut: ['poi'], inputs: [], output: false, fields: [{ name: 'elemento', label: 'Elemento', kind: 'elemento' }, { name: 'azione', label: 'Azione', kind: 'scelta', options: [['toggle', 'alterna'], ['add', 'aggiungi'], ['remove', 'togli']], default: 'toggle' }, { name: 'classe', label: 'Classe', kind: 'testo', default: 'attivo' }] },
  { type: 'console', label: 'Scrivi in console', category: 'azione', execIn: true, execOut: ['poi'], inputs: ['valore'], output: false, fields: [{ name: 'valore', label: 'Valore', kind: 'testo', default: 'ciao' }] },
  { type: 'messaggio', label: 'Mostra un messaggio', category: 'azione', execIn: true, execOut: ['poi'], inputs: ['valore'], output: false, fields: [{ name: 'valore', label: 'Messaggio', kind: 'testo', default: 'Ciao!' }] },
  { type: 'variabile', label: 'Imposta variabile', category: 'azione', execIn: true, execOut: ['poi'], inputs: ['valore'], output: false, fields: [{ name: 'nome', label: 'Nome', kind: 'testo', default: 'conta' }, { name: 'valore', label: 'Valore', kind: 'numero', default: '0' }] },
  { type: 'chiama', label: 'Chiama una funzione', category: 'azione', execIn: true, execOut: ['poi'], inputs: ['arg0', 'arg1', 'arg2'], output: true, fields: [{ name: 'funzione', label: 'Funzione', kind: 'funzione' }, { name: 'arg0', label: 'Argomento 1', kind: 'testo' }, { name: 'arg1', label: 'Argomento 2', kind: 'testo' }, { name: 'arg2', label: 'Argomento 3', kind: 'testo' }] },
  { type: 'se', label: 'Se… allora / altrimenti', category: 'controllo', execIn: true, execOut: ['allora', 'altrimenti'], inputs: ['condizione'], output: false, fields: [{ name: 'condizione', label: 'Condizione', kind: 'testo', default: 'true' }] },
  { type: 'ripeti', label: 'Ripeti n volte', category: 'controllo', execIn: true, execOut: ['corpo', 'poi'], inputs: ['volte'], output: false, fields: [{ name: 'volte', label: 'Volte', kind: 'numero', default: '3' }] },
  { type: 'valore-testo', label: 'Testo', category: 'valore', execIn: false, execOut: [], inputs: [], output: true, fields: [{ name: 'testo', label: 'Testo', kind: 'testo', default: 'ciao' }] },
  { type: 'valore-numero', label: 'Numero', category: 'valore', execIn: false, execOut: [], inputs: [], output: true, fields: [{ name: 'numero', label: 'Numero', kind: 'numero', default: '1' }] },
  { type: 'campo', label: 'Valore del campo', category: 'valore', execIn: false, execOut: [], inputs: [], output: true, fields: [{ name: 'elemento', label: 'Campo', kind: 'elemento' }] },
  { type: 'contenuto', label: 'Testo dell’elemento', category: 'valore', execIn: false, execOut: [], inputs: [], output: true, fields: [{ name: 'elemento', label: 'Elemento', kind: 'elemento' }] },
  { type: 'leggi', label: 'Leggi variabile', category: 'valore', execIn: false, execOut: [], inputs: [], output: true, fields: [{ name: 'nome', label: 'Nome', kind: 'testo', default: 'conta' }] },
  {
    type: 'operazione',
    label: 'Operazione',
    category: 'valore',
    execIn: false,
    execOut: [],
    inputs: ['a', 'b'],
    output: true,
    fields: [{ name: 'a', label: 'A', kind: 'numero', default: '1' }, { name: 'operatore', label: 'Operatore', kind: 'scelta', options: [['+', '+'], ['-', '−'], ['*', '×'], ['/', '÷'], ['%', 'resto']], default: '+' }, { name: 'b', label: 'B', kind: 'numero', default: '1' }]
  },
  {
    type: 'confronto',
    label: 'Confronto',
    category: 'valore',
    execIn: false,
    execOut: [],
    inputs: ['a', 'b'],
    output: true,
    fields: [{ name: 'a', label: 'A', kind: 'testo', default: '' }, { name: 'operatore', label: 'Operatore', kind: 'scelta', options: [['===', '='], ['!==', '≠'], ['>', '>'], ['<', '<'], ['>=', '≥'], ['<=', '≤']], default: '===' }, { name: 'b', label: 'B', kind: 'testo', default: '' }]
  },
  { type: 'unisci', label: 'Unisci testi', category: 'valore', execIn: false, execOut: [], inputs: ['a', 'b'], output: true, fields: [{ name: 'a', label: 'Primo', kind: 'testo', default: 'Ciao ' }, { name: 'b', label: 'Secondo', kind: 'testo', default: 'mondo' }] }
]

export function specOf(type: string): NodeSpec | undefined {
  return NODE_SPECS.find((s) => s.type === type)
}

/** Valore scritto in un campo → letterale JavaScript (numeri e booleani restano tali). */
export function literal(value: string | undefined, kind: FieldSpec['kind'] = 'testo'): string {
  const v = value ?? ''
  if (kind === 'numero' || /^-?\d+(\.\d+)?$/.test(v.trim())) return /^-?\d+(\.\d+)?$/.test(v.trim()) ? v.trim() : '0'
  if (/^(true|false|null)$/.test(v.trim())) return v.trim()
  return JSON.stringify(v)
}

function selector(node: VNode): string {
  const raw = (node.data['elemento'] ?? '').trim()
  return JSON.stringify(raw.startsWith('#') || raw.startsWith('.') || !raw ? raw || 'body' : `#${raw}`)
}

export interface GenerateOptions {
  /** Percorso del file generato (per gli import relativi). */
  outputPath: string
  sourceName: string
  functions: ExportedFunction[]
}

export function generateNodesCode(program: NodesProgram, options: GenerateOptions): string {
  const byId = new Map(program.nodes.map((n) => [n.id, n]))
  const step = (node: VNode) => (program.highlight ? `__labStep(${JSON.stringify(node.id)});\n` : '')
  const usedFunctions = new Map<string, ExportedFunction>()
  const variables = new Set<string>()

  const incoming = (nodeId: string, handle: string) => program.edges.find((e) => e.target === nodeId && e.targetHandle === handle)
  const outgoing = (nodeId: string, handle: string) =>
    program.edges
      .filter((e) => e.source === nodeId && e.sourceHandle === handle)
      .map((e) => byId.get(e.target))
      .filter((n): n is VNode => !!n)
      .sort((a, b) => a.y - b.y || a.x - b.x)

  const expression = (nodeId: string, handle: string, kind: FieldSpec['kind'], depth = 0): string => {
    const node = byId.get(nodeId)!
    const edge = incoming(nodeId, handle)
    if (edge && depth < 50) {
      const source = byId.get(edge.source)
      if (source) return value(source, depth + 1)
    }
    return literal(node.data[handle], kind)
  }

  const value = (node: VNode, depth: number): string => {
    switch (node.type) {
      case 'valore-testo':
        return JSON.stringify(node.data['testo'] ?? '')
      case 'valore-numero':
        return literal(node.data['numero'], 'numero')
      case 'campo':
        return `document.querySelector(${selector(node)}).value`
      case 'contenuto':
        return `document.querySelector(${selector(node)}).textContent`
      case 'leggi':
        variables.add(identifier(node.data['nome']))
        return identifier(node.data['nome'])
      case 'operazione':
        return `(${expression(node.id, 'a', 'numero', depth)} ${node.data['operatore'] ?? '+'} ${expression(node.id, 'b', 'numero', depth)})`
      case 'confronto':
        return `(${expression(node.id, 'a', 'testo', depth)} ${node.data['operatore'] ?? '==='} ${expression(node.id, 'b', 'testo', depth)})`
      case 'unisci':
        return `String(${expression(node.id, 'a', 'testo', depth)}) + String(${expression(node.id, 'b', 'testo', depth)})`
      case 'chiama':
        return call(node, depth)
      default:
        return 'undefined'
    }
  }

  const call = (node: VNode, depth: number): string => {
    const fn = options.functions.find((f) => `${f.path}#${f.name}` === node.data['funzione'] || f.name === node.data['funzione'])
    const name = fn?.name ?? identifier(node.data['funzione'] || 'funzione')
    if (fn) usedFunctions.set(fn.name, fn)
    const count = fn ? fn.params.length : ['arg0', 'arg1', 'arg2'].filter((a) => node.data[a] || incoming(node.id, a)).length
    const args = ['arg0', 'arg1', 'arg2'].slice(0, count).map((a) => expression(node.id, a, 'testo', depth))
    return `${name}(${args.join(', ')})`
  }

  const indent = (code: string, pad: string) =>
    code
      .split('\n')
      .map((line) => (line ? pad + line : line))
      .join('\n')

  const statements = (node: VNode, visited: Set<string>): string => {
    if (visited.has(node.id)) return `// (ciclo interrotto: il nodo "${specOf(node.type)?.label ?? node.type}" è già stato eseguito)\n`
    visited.add(node.id)
    const el = `document.querySelector(${selector(node)})`
    let code = step(node)
    switch (node.type) {
      case 'testo':
        code += `${el}.textContent = ${expression(node.id, 'valore', 'testo')};\n`
        break
      case 'stile':
        code += `${el}.style.${identifier(node.data['proprieta'] || 'color')} = ${expression(node.id, 'valore', 'testo')};\n`
        break
      case 'classe':
        code += `${el}.classList.${['add', 'remove', 'toggle'].includes(node.data['azione'] ?? '') ? node.data['azione'] : 'toggle'}(${JSON.stringify(node.data['classe'] ?? '')});\n`
        break
      case 'console':
        code += `console.log(${expression(node.id, 'valore', 'testo')});\n`
        break
      case 'messaggio':
        code += `alert(${expression(node.id, 'valore', 'testo')});\n`
        break
      case 'variabile': {
        const name = identifier(node.data['nome'])
        variables.add(name)
        code += `${name} = ${expression(node.id, 'valore', 'numero')};\n`
        break
      }
      case 'chiama':
        code += `${call(node, 0)};\n`
        break
      case 'se': {
        code += `if (${expression(node.id, 'condizione', 'testo')}) {\n${indent(chain(node.id, 'allora', new Set(visited)), '  ')}}`
        const otherwise = chain(node.id, 'altrimenti', new Set(visited))
        code += otherwise ? ` else {\n${indent(otherwise, '  ')}}\n` : '\n'
        break
      }
      case 'ripeti': {
        code += `for (let i = 0; i < ${expression(node.id, 'volte', 'numero')}; i++) {\n${indent(chain(node.id, 'corpo', new Set(visited)), '  ')}}\n`
        break
      }
      default:
        code += `// nodo "${node.type}" senza azione\n`
    }
    return code + chain(node.id, 'poi', visited)
  }

  const chain = (nodeId: string, handle: string, visited: Set<string>): string =>
    outgoing(nodeId, handle)
      .map((next) => statements(next, visited))
      .join('')

  const blocks: string[] = []
  for (const node of [...program.nodes].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const body = chain(node.id, 'poi', new Set([node.id]))
    if (node.type === 'evento') {
      const event = node.data['evento'] || 'click'
      blocks.push(`// Quando: ${event} su ${node.data['elemento'] || 'pagina'}\ndocument.querySelector(${selector(node)}).addEventListener(${JSON.stringify(event)}, (event) => {\n${indent(step(node) + (event === 'submit' ? 'event.preventDefault();\n' : '') + body, '  ')}});`)
    } else if (node.type === 'avvio') {
      blocks.push(`// All'avvio della pagina\n${step(node)}${body}`.trimEnd())
    } else if (node.type === 'timer') {
      blocks.push(`// Ogni ${literal(node.data['ms'], 'numero')} ms\nsetInterval(() => {\n${indent(step(node) + body, '  ')}}, ${literal(node.data['ms'], 'numero')});`)
    }
  }

  const outDir = dirnameOf(options.outputPath)
  const imports = [...usedFunctions.values()].map((fn) => {
    let target = relativeTo(outDir, fn.path).replace(/\.(ts|tsx|mts)$/, '.js')
    if (!target.startsWith('.')) target = `./${target}`
    return `import { ${fn.name} } from ${JSON.stringify(target)};`
  })
  const parts = [generatedHeader(options.sourceName, 'nodi').trimEnd()]
  if (imports.length) parts.push(imports.join('\n'))
  if (program.highlight) parts.push(STEP_HELPER.trimEnd())
  if (variables.size) parts.push(`let ${[...variables].map((v) => `${v} = 0`).join(', ')};`)
  parts.push(blocks.length ? blocks.join('\n\n') : '// Aggiungi un nodo "Quando…" o "All’avvio" e collegaci delle azioni.')
  return `${parts.join('\n\n')}\n`
}

function identifier(raw: string | undefined): string {
  const cleaned = (raw ?? '').trim().replace(/[^\w$]/g, '_')
  return /^[A-Za-z_$]/.test(cleaned) ? cleaned : `_${cleaned || 'x'}`
}
