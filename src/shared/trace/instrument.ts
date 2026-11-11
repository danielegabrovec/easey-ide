// Esecuzione passo-passo (stile "Python Tutor") per JavaScript e TypeScript: strumentazione del sorgente.
//
// Prima di ogni istruzione si inserisce  __s(riga, () => [["nome", () => nome, ambito], …])
// con le variabili visibili in quel punto (ambito 0 = funzione corrente, 1 = globale); ogni funzione
// viene avvolta da  __e("nome", riga); try { … } finally { __x() }  per la pila delle chiamate.
// Le inserzioni sono testuali (per posizione), così il codice dello studente resta com'è
// (anche TypeScript: i tipi li toglie esbuild dopo).
import { parse } from '@babel/parser'

type Node = { type: string; start: number; end: number; loc: { start: { line: number } }; [key: string]: unknown }

interface Scope {
  names: Set<string>
  /** true per Program e corpi di funzione. */
  boundary: boolean
  program: boolean
}

interface Insertion {
  at: number
  text: string
  /** A parità di posizione, nel testo finale: chiusure (0), aperture (1), passo dell'istruzione (2). */
  order: number
}

const SKIP_STATEMENTS = new Set([
  'FunctionDeclaration',
  'ClassDeclaration',
  'ImportDeclaration',
  'ExportAllDeclaration',
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
  'TSDeclareFunction',
  'TSModuleDeclaration',
  'EmptyStatement'
])

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod', 'ClassPrivateMethod'])

function isNode(value: unknown): value is Node {
  return !!value && typeof value === 'object' && typeof (value as Node).type === 'string' && typeof (value as Node).start === 'number'
}

/** Nomi legati da un pattern (a, {b, c: d}, [e, ...f], g = 1). */
function patternNames(pattern: unknown, out: string[] = []): string[] {
  if (!isNode(pattern)) return out
  switch (pattern.type) {
    case 'Identifier':
      out.push(pattern['name'] as string)
      break
    case 'AssignmentPattern':
      patternNames(pattern['left'], out)
      break
    case 'RestElement':
      patternNames(pattern['argument'], out)
      break
    case 'ArrayPattern':
      for (const element of pattern['elements'] as unknown[]) patternNames(element, out)
      break
    case 'ObjectPattern':
      for (const property of pattern['properties'] as Node[]) patternNames(property.type === 'RestElement' ? property : property['value'], out)
      break
    case 'TSParameterProperty':
      patternNames(pattern['parameter'], out)
      break
  }
  return out
}

/** Dichiarazioni "var" di una funzione (senza entrare nelle funzioni annidate). */
function hoistedVars(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) hoistedVars(item, out)
    return
  }
  if (!isNode(node)) return
  if (FUNCTION_TYPES.has(node.type) || node.type === 'ClassBody') return
  if (node.type === 'VariableDeclaration' && node['kind'] === 'var') for (const d of node['declarations'] as Node[]) patternNames(d['id']).forEach((n) => out.add(n))
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra') continue
    hoistedVars(node[key], out)
  }
}

/** let/const/class/function dichiarati direttamente in un elenco di istruzioni. */
function blockNames(statements: Node[]): string[] {
  const names: string[] = []
  for (let s of statements) {
    if ((s.type === 'ExportNamedDeclaration' || s.type === 'ExportDefaultDeclaration') && isNode(s['declaration'])) s = s['declaration'] as Node
    if (s.type === 'VariableDeclaration' && s['kind'] !== 'var') for (const d of s['declarations'] as Node[]) names.push(...patternNames(d['id']))
    if ((s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') && isNode(s['id'])) names.push((s['id'] as Node)['name'] as string)
    if (s.type === 'ImportDeclaration' && s['importKind'] !== 'type')
      for (const spec of s['specifiers'] as Node[]) if (spec['importKind'] !== 'type') names.push((spec['local'] as Node)['name'] as string)
  }
  return names
}

export interface InstrumentResult {
  code: string
  /** Righe su cui l'esecuzione può fermarsi. */
  lines: number[]
}

export function instrument(source: string, typescript: boolean): InstrumentResult {
  const ast = parse(source, {
    sourceType: 'module',
    plugins: typescript ? ['typescript'] : ['jsx'],
    errorRecovery: false
  }) as unknown as { program: Node }
  const insertions: Insertion[] = []
  const lines = new Set<number>()
  const scopes: Scope[] = []
  const insert = (at: number, text: string, order: 0 | 1 | 2) => insertions.push({ at, text, order })

  const visibleVariables = () => {
    const seen = new Set<string>()
    const entries: string[] = []
    for (let i = scopes.length - 1; i >= 0; i--) {
      const scope = scopes[i]!
      const kind = scope.program ? 1 : 0
      for (const name of scope.names) {
        if (seen.has(name) || name.startsWith('__')) continue
        seen.add(name)
        entries.push(`[${JSON.stringify(name)},()=>${name},${kind}]`)
      }
    }
    return entries.join(',')
  }

  const stepCall = (node: Node) => {
    const line = node.loc.start.line
    lines.add(line)
    return `__s(${line},()=>[${visibleVariables()}]);`
  }

  const withScope = (names: Iterable<string>, boundary: boolean, run: () => void, program = false) => {
    scopes.push({ names: new Set(names), boundary, program })
    try {
      run()
    } finally {
      scopes.pop()
    }
  }

  const functionName = (node: Node, parent: Node | null): string => {
    if (isNode(node['id'])) return (node['id'] as Node)['name'] as string
    if (isNode(node['key'])) return ((node['key'] as Node)['name'] as string) ?? 'metodo'
    if (parent?.type === 'VariableDeclarator' && isNode(parent['id']) && (parent['id'] as Node).type === 'Identifier') return (parent['id'] as Node)['name'] as string
    if (parent?.type === 'AssignmentExpression' && isNode(parent['left']) && (parent['left'] as Node).type === 'Identifier') return (parent['left'] as Node)['name'] as string
    if ((parent?.type === 'ObjectProperty' || parent?.type === 'ClassProperty') && isNode(parent['key'])) return ((parent['key'] as Node)['name'] as string) ?? 'funzione'
    return 'anonima'
  }

  /** Istruzioni in un elenco: passo prima di ciascuna. */
  const visitStatements = (statements: Node[]) => {
    for (const statement of statements) {
      const inner = statement.type === 'ExportNamedDeclaration' && isNode(statement['declaration']) ? (statement['declaration'] as Node) : statement
      if (!SKIP_STATEMENTS.has(inner.type) && !inner.type.startsWith('TS') && !(inner.type === 'ExportNamedDeclaration')) insert(statement.start, stepCall(statement), 2)
      visit(statement, null)
    }
  }

  /** Corpo di un if/for/while che non è un blocco: lo avvolgo in { passo; corpo }. */
  const visitBody = (body: unknown, parent: Node) => {
    if (!isNode(body)) return
    if (body.type === 'BlockStatement') {
      visit(body, parent)
      return
    }
    insert(body.start, `{${stepCall(body)}`, 1)
    visit(body, parent)
    insert(body.end, '}', 0)
  }

  const visitFunction = (node: Node, parent: Node | null) => {
    const name = JSON.stringify(functionName(node, parent))
    const line = node.loc.start.line
    const params = (node['params'] as unknown[]).flatMap((p) => patternNames(p))
    const body = node['body'] as Node
    // Parametri con valori predefiniti: possono contenere funzioni.
    for (const param of node['params'] as unknown[]) visit(param, node)
    if (body.type === 'BlockStatement') {
      const statements = body['body'] as Node[]
      const vars = new Set<string>()
      hoistedVars(statements, vars)
      withScope([...params, ...vars, ...blockNames(statements)], true, () => {
        insert(body.start + 1, `__e(${name},${line});try{`, 1)
        visitStatements(statements)
        insert(body.end - 1, '}finally{__x()}', 0)
      })
      return
    }
    // Freccia con espressione: x => x * 2  →  x => { __e(); try { return (x * 2) } finally { __x() } }
    const extra = body['extra'] as { parenthesized?: boolean; parenStart?: number } | undefined
    const start = extra?.parenthesized && typeof extra.parenStart === 'number' ? extra.parenStart : body.start
    let end = body.end
    if (extra?.parenthesized) {
      while (end < source.length && source[end] !== ')') end++
      end++
    }
    withScope(params, true, () => {
      insert(start, `{__e(${name},${line});try{${stepCall(body)}return (`, 1)
      visit(body, node)
      insert(end, `)}finally{__x()}}`, 0)
    })
  }

  function visit(node: unknown, parent: Node | null): void {
    if (Array.isArray(node)) {
      for (const item of node) visit(item, parent)
      return
    }
    if (!isNode(node)) return
    if (node.type.startsWith('TS') && node.type !== 'TSParameterProperty' && node.type !== 'TSAsExpression' && node.type !== 'TSNonNullExpression' && node.type !== 'TSSatisfiesExpression') return
    if (FUNCTION_TYPES.has(node.type)) {
      if (node['generator'] || node['async']) {
        // Asincrone e generatori: la pila non sarebbe affidabile; si tracciano solo le istruzioni.
        const body = node['body'] as Node
        if (body.type === 'BlockStatement') withScope((node['params'] as unknown[]).flatMap((p) => patternNames(p)), true, () => visitStatements(body['body'] as Node[]))
        return
      }
      visitFunction(node, parent)
      return
    }
    switch (node.type) {
      case 'Program': {
        const statements = node['body'] as Node[]
        withScope(blockNames(statements), false, () => visitStatements(statements), true)
        return
      }
      case 'BlockStatement':
      case 'StaticBlock': {
        const statements = node['body'] as Node[]
        withScope(blockNames(statements), false, () => visitStatements(statements))
        return
      }
      case 'SwitchCase':
        visit(node['test'], node)
        visitStatements(node['consequent'] as Node[])
        return
      case 'IfStatement':
        visit(node['test'], node)
        visitBody(node['consequent'], node)
        visitBody(node['alternate'], node)
        return
      case 'WhileStatement':
      case 'DoWhileStatement':
        visit(node['test'], node)
        visitBody(node['body'], node)
        return
      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement': {
        const init = (node['init'] ?? node['left']) as Node | undefined
        const names = init?.type === 'VariableDeclaration' && init['kind'] !== 'var' ? (init['declarations'] as Node[]).flatMap((d) => patternNames(d['id'])) : []
        withScope(names, false, () => {
          visit(node['init'], node)
          visit(node['test'], node)
          visit(node['update'], node)
          visit(node['right'], node)
          visitBody(node['body'], node)
        })
        return
      }
      case 'CatchClause':
        withScope(patternNames(node['param']), false, () => visit(node['body'], node))
        return
      case 'LabeledStatement':
        visitBody(node['body'], node)
        return
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') continue
      if (key === 'typeAnnotation' || key === 'returnType' || key === 'typeParameters') continue
      visit(node[key], node)
    }
  }

  // Le var del programma sono globali come let/const.
  const programVars = new Set<string>()
  hoistedVars(ast.program['body'], programVars)
  withScope(programVars, true, () => visit(ast.program, null), true)
  scopes.length = 0

  // Applica le inserzioni dalla fine all'inizio (le posizioni restano valide).
  insertions.sort((a, b) => b.at - a.at || b.order - a.order)
  let code = source
  for (const { at, text } of insertions) code = code.slice(0, at) + text + code.slice(at)
  return { code, lines: [...lines].sort((a, b) => a - b) }
}
