// Diagrammi di flusso ↔ codice JavaScript.
//
// Convenzioni del flowchart (come nei libri di informatica):
//   ovale "Inizio" / "Fine", rettangolo = istruzione (es. somma = somma + i),
//   parallelogramma = "leggi x" oppure "scrivi x", rombo = condizione (es. i <= 10) con uscite "sì" / "no".
// Un'uscita che torna a un rombo già visto diventa un ciclo while; due rami che si ricongiungono un if/else.
import { parse } from '@babel/parser'
import { layeredLayout, newId, SHAPE_SIZES, type Diagram, type DiagramEdge, type DiagramNode, type ShapeKind } from './model'

const YES = /^(s[iì]|vero|true|yes|y|ok)$/i
const NO = /^(no|falso|false|n)$/i
const READ = /^(leggi|input|chiedi|inserisci)\s+([A-Za-z_$][\w$]*)\s*$/i
const WRITE = /^(scrivi|stampa|mostra|output|visualizza)\s+(.+)$/i

/** Condizione scritta "alla buona" → JavaScript (=, ≠, ≤, ≥, e, o, non). */
export function toCondition(text: string): string {
  return text
    .trim()
    .replace(/≠/g, '!==')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/<>/g, '!==')
    .replace(/([^=!<>])=([^=])/g, '$1===$2')
    .replace(/\s+e\s+/gi, ' && ')
    .replace(/\s+o\s+/gi, ' || ')
    .replace(/\bnon\s+/gi, '!')
}

export interface FlowCodeResult {
  code: string
  warnings: string[]
}

export function flowchartToCode(diagram: Diagram, sourceName: string): FlowCodeResult {
  const warnings: string[] = []
  const nodes = new Map(diagram.nodes.filter((n) => n.shape !== 'nota' && n.shape !== 'testo' && n.shape !== 'cornice').map((n) => [n.id, n]))
  const outgoing = (id: string) => diagram.edges.filter((e) => e.source === id && nodes.has(e.target))
  const start = [...nodes.values()].find((n) => n.shape === 'inizio' && !/fine|end|stop/i.test(n.text)) ?? [...nodes.values()].find((n) => !diagram.edges.some((e) => e.target === n.id))
  if (!start) return { code: '// Il diagramma è vuoto: aggiungi un ovale "Inizio".\n', warnings: ['Manca il nodo di inizio'] }

  const reach = (from: string, avoid: string): Set<string> => {
    const seen = new Set<string>()
    const queue = [from]
    while (queue.length) {
      const id = queue.shift()!
      if (seen.has(id) || id === avoid) continue
      seen.add(id)
      for (const e of outgoing(id)) queue.push(e.target)
    }
    return seen
  }
  const ordered = (from: string, avoid: string): string[] => {
    const seen: string[] = []
    const queue = [from]
    while (queue.length) {
      const id = queue.shift()!
      if (seen.includes(id) || id === avoid) continue
      seen.push(id)
      for (const e of outgoing(id)) queue.push(e.target)
    }
    return seen
  }

  const variables = new Set<string>()
  const declared = new Set<string>()
  let reads = false
  const visits = new Map<string, number>()

  const statementsOf = (node: DiagramNode): string[] => {
    const lines = node.text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (node.shape === 'io') {
      return lines.map((line) => {
        const read = READ.exec(line)
        if (read) {
          reads = true
          variables.add(read[2]!)
          return `${read[2]} = await leggi(${JSON.stringify(read[2])});`
        }
        const write = WRITE.exec(line)
        if (write) return `console.log(${write[2]});`
        return /[;{}]$/.test(line) ? line : `${line};`
      })
    }
    return lines.map((line) => {
      const declaration = /^(let|const|var)\s+([A-Za-z_$][\w$]*)/.exec(line)
      if (declaration) declared.add(declaration[2]!)
      const assign = /^([A-Za-z_$][\w$]*)\s*(=[^=]|\+=|-=|\*=|\/=|%=|\+\+|--)/.exec(line)
      if (assign && !declaration) variables.add(assign[1]!)
      return /[;{}]$/.test(line) ? line : `${line};`
    })
  }

  const indent = (lines: string[]) => lines.map((l) => (l ? `  ${l}` : l))

  const generate = (id: string | undefined, stop: string | null): string[] => {
    const out: string[] = []
    let current = id
    while (current && current !== stop) {
      const node = nodes.get(current)
      if (!node) break
      const count = (visits.get(current) ?? 0) + 1
      visits.set(current, count)
      if (count > 50) {
        warnings.push(`Percorso senza fine passando da "${node.text}"`)
        out.push(`// (percorso interrotto: "${node.text}" visitato troppe volte)`)
        break
      }
      if (node.shape === 'inizio') {
        if (/fine|end|stop/i.test(node.text) && node !== start) break
        current = outgoing(current)[0]?.target
        continue
      }
      if (node.shape !== 'decisione') {
        out.push(...statementsOf(node))
        const next = outgoing(current)
        if (next.length > 1) warnings.push(`"${node.text}" ha più uscite: si segue la prima`)
        current = next[0]?.target
        continue
      }
      const edges = outgoing(current)
      const yes = edges.find((e) => YES.test((e.label ?? '').trim())) ?? edges.find((e) => !NO.test((e.label ?? '').trim()))
      const no = edges.find((e) => e !== yes)
      const condition = toCondition(node.text)
      // Il ramo "sì" torna al rombo → ciclo while (oppure il ramo "no" → while con la condizione negata).
      if (yes && reach(yes.target, '__none__').has(current)) {
        out.push(`while (${condition}) {`, ...indent(generate(yes.target, current)), '}')
        current = no?.target
        continue
      }
      if (no && reach(no.target, '__none__').has(current)) {
        out.push(`while (!(${condition})) {`, ...indent(generate(no.target, current)), '}')
        current = yes?.target
        continue
      }
      const yesOrder = yes ? ordered(yes.target, current) : []
      const noReach = no ? reach(no.target, current) : new Set<string>()
      const merge = yesOrder.find((n) => noReach.has(n)) ?? null
      out.push(`if (${condition}) {`, ...indent(generate(yes?.target, merge)))
      const otherwise = generate(no?.target, merge)
      if (otherwise.length) out.push('} else {', ...indent(otherwise))
      out.push('}')
      current = merge ?? undefined
    }
    return out
  }

  const body = generate(start.id, null)
  const toDeclare = [...variables].filter((v) => !declared.has(v))
  const lines = [`// Codice generato dal diagramma di flusso ${sourceName}.`, '// Si rigenera dal diagramma: per modificarlo a mano copialo in un altro file.', '']
  if (reads) {
    lines.push(
      "import * as readline from 'node:readline/promises'",
      '',
      'const rl = readline.createInterface({ input: process.stdin, output: process.stdout })',
      '',
      '/** Chiede un valore: se è un numero lo restituisce come numero. */',
      'async function leggi(nome) {',
      "  const risposta = (await rl.question(nome + '? ')).trim()",
      "  return risposta !== '' && !Number.isNaN(Number(risposta)) ? Number(risposta) : risposta",
      '}',
      ''
    )
  }
  lines.push('async function main() {')
  if (toDeclare.length) lines.push(`  let ${toDeclare.join(', ')}`)
  lines.push(...indent(body), '}', '', 'await main()')
  if (reads) lines.push('rl.close()')
  return { code: `${lines.join('\n')}\n`, warnings }
}

// ------------------------------------------------------------------ dal codice al diagramma

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyNode = any

interface Pred {
  id: string
  label?: string
  handle?: string
}

export function functionNames(source: string): string[] {
  try {
    const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'], errorRecovery: true }) as AnyNode
    const names: string[] = []
    const visit = (node: AnyNode) => {
      if (!node || typeof node !== 'object') return
      if (node.type === 'FunctionDeclaration' && node.id) names.push(node.id.name)
      if (node.type === 'VariableDeclarator' && node.id?.name && /Function|ArrowFunction/.test(node.init?.type ?? '')) names.push(node.id.name)
      if (node.type === 'ClassMethod' && node.key?.name) names.push(node.key.name)
      for (const key of Object.keys(node)) if (key !== 'loc' && key !== 'start' && key !== 'end') Array.isArray(node[key]) ? node[key].forEach(visit) : typeof node[key] === 'object' && visit(node[key])
    }
    visit(ast.program)
    return names
  } catch {
    return []
  }
}

/** Flowchart di una funzione (la prima, o quella con il nome dato). */
export function functionToFlowchart(source: string, name?: string): Diagram {
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'], errorRecovery: true }) as AnyNode
  let target: AnyNode = null
  const find = (node: AnyNode) => {
    if (!node || typeof node !== 'object' || target) return
    const fnName = node.type === 'FunctionDeclaration' ? node.id?.name : node.type === 'VariableDeclarator' && /Function/.test(node.init?.type ?? '') ? node.id?.name : node.type === 'ClassMethod' ? node.key?.name : null
    if (fnName && (!name || fnName === name)) {
      target = node.type === 'VariableDeclarator' ? { ...node.init, id: node.id } : node
      return
    }
    for (const key of Object.keys(node)) if (key !== 'loc') Array.isArray(node[key]) ? node[key].forEach(find) : typeof node[key] === 'object' && find(node[key])
  }
  find(ast.program)
  if (!target) throw new Error(name ? `Funzione "${name}" non trovata.` : 'Nel file non c’è nessuna funzione.')

  const nodes: DiagramNode[] = []
  const edges: DiagramEdge[] = []
  const text = (node: AnyNode) => source.slice(node.start, node.end).replace(/\s+/g, ' ').trim()
  const add = (shape: ShapeKind, label: string): string => {
    const id = newId(shape)
    const lines = Math.max(1, Math.ceil(label.length / 26))
    const size = SHAPE_SIZES[shape]
    nodes.push({ id, shape, x: 0, y: 0, width: size.width, height: Math.max(size.height, 24 + lines * 18), text: label })
    return id
  }
  const link = (preds: Pred[], to: string, back = false) => {
    for (const p of preds) edges.push({ id: newId('e'), source: p.id, target: to, label: p.label, sourceHandle: back ? 'l' : (p.handle ?? 'b'), targetHandle: back ? 'l' : 't', routing: 'ortogonale', arrow: 'fine' })
  }

  const emit = (statements: AnyNode[], preds: Pred[]): { exits: Pred[]; first: string | null } => {
    let current = preds
    let first: string | null = null
    const enter = (id: string, back = false) => {
      link(current, id, back)
      if (!first) first = id
    }
    for (const statement of statements) {
      if (current.length === 0) break
      switch (statement.type) {
        case 'BlockStatement': {
          const inner = emit(statement.body, current)
          if (!first) first = inner.first
          current = inner.exits
          break
        }
        case 'ExpressionStatement': {
          const expr = statement.expression
          const isLog = expr.type === 'CallExpression' && expr.callee.type === 'MemberExpression' && expr.callee.object?.name === 'console'
          const id = add(isLog ? 'io' : 'processo', isLog ? `scrivi ${expr.arguments.map(text).join(', ')}` : text(statement).replace(/;$/, ''))
          enter(id)
          current = [{ id }]
          break
        }
        case 'ReturnStatement': {
          const id = add('io', statement.argument ? `restituisci ${text(statement.argument)}` : 'restituisci')
          enter(id)
          link([{ id }], end)
          current = []
          break
        }
        case 'IfStatement': {
          const id = add('decisione', text(statement.test))
          enter(id)
          const yes = emit([statement.consequent], [{ id, label: 'sì', handle: 'b' }])
          const no = statement.alternate ? emit([statement.alternate], [{ id, label: 'no', handle: 'r' }]) : { exits: [{ id, label: 'no', handle: 'r' }], first: null }
          current = [...yes.exits, ...no.exits]
          break
        }
        case 'WhileStatement': {
          const id = add('decisione', text(statement.test))
          enter(id)
          const body = emit([statement.body], [{ id, label: 'sì', handle: 'b' }])
          link(body.exits, id, true)
          current = [{ id, label: 'no', handle: 'r' }]
          break
        }
        case 'DoWhileStatement': {
          const body = emit([statement.body], current)
          if (!first) first = body.first
          const id = add('decisione', text(statement.test))
          link(body.exits, id)
          if (body.first) link([{ id, label: 'sì', handle: 'l' }], body.first, true)
          current = [{ id, label: 'no', handle: 'r' }]
          break
        }
        case 'ForStatement': {
          if (statement.init) {
            const init = add('processo', text(statement.init).replace(/;$/, ''))
            enter(init)
            current = [{ id: init }]
          }
          const id = add('decisione', statement.test ? text(statement.test) : 'true')
          enter(id)
          const body = emit([statement.body], [{ id, label: 'sì', handle: 'b' }])
          let exits = body.exits
          if (statement.update) {
            const update = add('processo', text(statement.update))
            link(exits, update)
            exits = [{ id: update }]
          }
          link(exits, id, true)
          current = [{ id, label: 'no', handle: 'r' }]
          break
        }
        case 'ForOfStatement':
        case 'ForInStatement': {
          const id = add('decisione', `per ogni ${text(statement.left).replace(/^(const|let|var)\s+/, '')} ${statement.type === 'ForOfStatement' ? 'di' : 'in'} ${text(statement.right)}`)
          enter(id)
          const body = emit([statement.body], [{ id, label: 'sì', handle: 'b' }])
          link(body.exits, id, true)
          current = [{ id, label: 'no', handle: 'r' }]
          break
        }
        default: {
          const id = add('processo', text(statement).replace(/;$/, ''))
          enter(id)
          current = [{ id }]
        }
      }
    }
    return { exits: current, first }
  }

  const params = (target.params ?? []).map((p: AnyNode) => text(p)).join(', ')
  const start = add('inizio', `Inizio: ${target.id?.name ?? target.key?.name ?? 'funzione'}(${params})`)
  const end = newId('fine')
  const body = target.body?.type === 'BlockStatement' ? target.body.body : [{ type: 'ReturnStatement', argument: target.body, start: target.body.start, end: target.body.end }]
  const result = emit(body, [{ id: start }])
  nodes.push({ id: end, shape: 'inizio', x: 0, y: 0, ...SHAPE_SIZES.inizio, text: 'Fine' })
  link(result.exits, end)
  const forward = edges.filter((e) => e.sourceHandle !== 'l')
  const placed = layeredLayout(nodes, forward, 70, 60)
  return { kind: 'diagramma', version: 1, type: 'flowchart', nodes: placed, edges }
}
