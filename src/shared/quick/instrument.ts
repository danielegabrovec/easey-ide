// Scrittura rapida: strumentazione del codice JS/TS per mostrare i risultati accanto alle righe.
//
//  - espressione di primo livello      a * 10         →  __v(3, (a * 10), 0)
//  - variabile dichiarata              const a = 5    →  const a = 5;__vd(1, "a", a);
//  - console.* ovunque                 console.log(x) →  __con(2).log(x)   (riga di chi stampa)
//
// Le modifiche sono testuali e restano sulla stessa riga: i numeri di riga del codice scritto non
// cambiano (anche TypeScript: i tipi li toglie esbuild dopo). Niente import/export: si esegue un
// frammento, non un modulo.
import { parse } from '@babel/parser'

type Node = { type: string; start: number; end: number; loc: { start: { line: number; column: number }; end: { line: number } }; [key: string]: unknown }

export class QuickCodeError extends Error {
  constructor(
    message: string,
    readonly line?: number,
    readonly column?: number
  ) {
    super(message)
  }
}

interface Edit {
  start: number
  end: number
  text: string
  /** A parità di posizione: prima ciò che chiude lo statement precedente (0), poi le aperture (1), poi i rimpiazzi (2). */
  order: number
}

const CONSOLE_METHODS = new Set(['log', 'info', 'warn', 'error', 'debug', 'table', 'dir', 'trace', 'assert', 'count', 'countReset', 'group', 'groupCollapsed', 'groupEnd', 'time', 'timeEnd', 'timeLog'])
const FUNCTION_LIKE = new Set(['FunctionExpression', 'ArrowFunctionExpression', 'ClassExpression'])
const MODULE_SYNTAX = new Set(['ImportDeclaration', 'ExportNamedDeclaration', 'ExportDefaultDeclaration', 'ExportAllDeclaration', 'TSImportEqualsDeclaration', 'TSExportAssignment'])
const WRAPPERS = new Set(['AwaitExpression', 'TSNonNullExpression', 'TSAsExpression', 'TSSatisfiesExpression', 'ParenthesizedExpression'])
const QUIET = new Set(['CallExpression', 'OptionalCallExpression', 'NewExpression', 'UnaryExpression'])

function isNode(value: unknown): value is Node {
  return !!value && typeof value === 'object' && typeof (value as Node).type === 'string' && typeof (value as Node).start === 'number'
}

/** Nomi legati da un pattern (a, {b, c: d}, [e, ...f], g = 1). */
export function patternNames(pattern: unknown, out: string[] = []): string[] {
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
  }
  return out
}

/** `console.qualcosa` (non calcolato) con un metodo noto. */
function isConsoleMember(node: Node): boolean {
  if (node.type !== 'MemberExpression' && node.type !== 'OptionalMemberExpression') return false
  const object = node['object'] as Node
  const property = node['property'] as Node
  return object.type === 'Identifier' && object['name'] === 'console' && !node['computed'] && property.type === 'Identifier' && CONSOLE_METHODS.has(property['name'] as string)
}

function isConsoleCall(node: Node): boolean {
  return (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') && isConsoleMember(node['callee'] as Node)
}

const TIMER_FUNCTIONS = new Set(['setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval', 'clearImmediate', 'queueMicrotask'])

/** `setTimeout(...)` & co.: il numero del timer non è un risultato interessante. */
function isTimerCall(node: Node): boolean {
  const callee = node['callee'] as Node | undefined
  return node.type === 'CallExpression' && callee?.type === 'Identifier' && TIMER_FUNCTIONS.has(callee['name'] as string)
}

function walk(node: Node, visit: (node: Node) => void): void {
  visit(node)
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments' || key === 'extra') continue
    const value = node[key]
    if (Array.isArray(value)) {
      for (const item of value) if (isNode(item)) walk(item, visit)
    } else if (isNode(value)) walk(value, visit)
  }
}

/** Il valore `undefined` di una chiamata (es. `saluta()`) non interessa: si mostra solo se c'è un risultato. */
function quietWhenUndefined(expression: Node): boolean {
  let inner = expression
  while (WRAPPERS.has(inner.type)) inner = (inner['argument'] ?? inner['expression']) as Node
  return QUIET.has(inner.type)
}

export function instrumentQuick(source: string, typescript: boolean): string {
  let program: Node
  try {
    program = (
      parse(source, {
        sourceType: 'module',
        allowAwaitOutsideFunction: true,
        allowReturnOutsideFunction: true,
        plugins: typescript ? ['typescript'] : [],
        errorRecovery: false
      }) as unknown as { program: Node }
    ).program
  } catch (error) {
    const e = error as Error & { loc?: { line: number; column: number } }
    throw new QuickCodeError(e.message.replace(/\s*\(\d+:\d+\)\s*$/, ''), e.loc?.line, e.loc ? e.loc.column + 1 : undefined)
  }

  const body = program['body'] as Node[]
  const moduleStatement = body.find((statement) => MODULE_SYNTAX.has(statement.type))
  if (moduleStatement) {
    throw new QuickCodeError(
      'import ed export non servono nella scrittura rapida: scrivi il codice direttamente (i moduli si usano in un progetto).',
      moduleStatement.loc.start.line,
      moduleStatement.loc.start.column + 1
    )
  }

  const edits: Edit[] = []
  walk(program, (node) => {
    if (!isConsoleMember(node)) return
    const object = node['object'] as Node
    edits.push({ start: object.start, end: object.end, text: `__con(${object.loc.start.line})`, order: 2 })
  })

  for (const statement of body) {
    if (statement.type === 'ExpressionStatement') {
      const expression = statement['expression'] as Node
      if (isConsoleCall(expression) || isTimerCall(expression)) continue
      const quiet = quietWhenUndefined(expression) ? 1 : 0
      edits.push({ start: expression.start, end: expression.start, text: `__v(${expression.loc.end.line}, (`, order: 1 })
      edits.push({ start: expression.end, end: expression.end, text: `), ${quiet})`, order: 0 })
    } else if (statement.type === 'VariableDeclaration' && !statement['declare']) {
      const calls: string[] = []
      for (const declarator of statement['declarations'] as Node[]) {
        const init = declarator['init'] as Node | null
        if (!init || FUNCTION_LIKE.has(init.type)) continue
        for (const name of patternNames(declarator['id'])) calls.push(`__vd(${declarator.loc.end.line}, ${JSON.stringify(name)}, ${name});`)
      }
      if (calls.length) edits.push({ start: statement.end, end: statement.end, text: `;${calls.join('')}`, order: 0 })
    }
  }

  edits.sort((a, b) => a.start - b.start || a.order - b.order)
  let out = ''
  let cursor = 0
  for (const edit of edits) {
    if (edit.start < cursor) continue
    out += source.slice(cursor, edit.start) + edit.text
    cursor = edit.end
  }
  return out + source.slice(cursor)
}

/** Avvolge il codice in una funzione asincrona sulla stessa prima riga: `await` di primo livello funziona e le righe non cambiano. */
export function wrapAsync(code: string): string {
  return `(async () => {${code}\n})()`
}

/** Riga e colonna di chi ha generato un errore, lette dallo stack (`nomefile:riga:colonna`). */
export function stackLocation(stack: string | undefined, filename: string): { line: number; column: number } | null {
  if (!stack) return null
  const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`${escaped}:(\\d+):(\\d+)`).exec(stack)
  return match ? { line: Number(match[1]), column: Number(match[2]) } : null
}
