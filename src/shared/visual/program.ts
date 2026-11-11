// Formato dei programmi visuali salvati nel progetto e dei file di codice che generano.
//   nome.blocchi.json  → programma a blocchi (Blockly)
//   nome.nodi.json     → programma a nodi con connettori
//   nome.generato.js   → codice JavaScript generato (da non modificare a mano: si rigenera)

export type VisualKind = 'blocchi' | 'nodi'
export type VisualTarget = 'pagina' | 'console'

export interface VisualProgramBase {
  kind: VisualKind
  version: 1
  target: VisualTarget
  /** Evidenzia blocchi/nodi mentre il programma gira nell'anteprima. */
  highlight: boolean
}

export interface BlocksProgram extends VisualProgramBase {
  kind: 'blocchi'
  /** Area di lavoro serializzata da Blockly. */
  workspace: unknown
}

export interface VNode {
  id: string
  type: string
  x: number
  y: number
  data: Record<string, string>
}

export interface VEdge {
  id: string
  source: string
  sourceHandle: string
  target: string
  targetHandle: string
}

export interface NodesProgram extends VisualProgramBase {
  kind: 'nodi'
  nodes: VNode[]
  edges: VEdge[]
}

export type VisualProgram = BlocksProgram | NodesProgram

export const VISUAL_SUFFIX: Record<VisualKind, string> = { blocchi: '.blocchi.json', nodi: '.nodi.json' }

export function isVisualFile(path: string): VisualKind | null {
  if (path.endsWith(VISUAL_SUFFIX.blocchi)) return 'blocchi'
  if (path.endsWith(VISUAL_SUFFIX.nodi)) return 'nodi'
  return null
}

export function generatedPath(path: string): string {
  return path.replace(/\.(blocchi|nodi)\.json$/, '.generato.js')
}

export function parseProgram(text: string, kind: VisualKind): VisualProgram {
  let data: Partial<VisualProgram> = {}
  try {
    data = JSON.parse(text || '{}') as Partial<VisualProgram>
  } catch {
    data = {}
  }
  const base = { version: 1 as const, target: data.target === 'console' ? ('console' as const) : ('pagina' as const), highlight: data.highlight !== false }
  if (kind === 'blocchi') return { ...base, kind, workspace: (data as Partial<BlocksProgram>).workspace ?? {} }
  const nodes = Array.isArray((data as Partial<NodesProgram>).nodes) ? (data as NodesProgram).nodes : []
  const edges = Array.isArray((data as Partial<NodesProgram>).edges) ? (data as NodesProgram).edges : []
  return { ...base, kind, nodes, edges }
}

export function serializeProgram(program: VisualProgram): string {
  return `${JSON.stringify(program, null, 2)}\n`
}

/** Funzione richiamata dal codice generato per evidenziare il passo in corso nell'IDE. */
export const STEP_HELPER = `function __labStep(id) {
  try { window.parent.postMessage({ __ide: 1, kind: 'step', id: id }, '*') } catch (e) {}
}
`

export function generatedHeader(source: string, kind: VisualKind): string {
  return `// File generato automaticamente da ${source} (${kind === 'blocchi' ? 'programma a blocchi' : 'programma a nodi'}).
// Non modificarlo a mano: cambia il programma visuale e questo file si rigenera.
// Per continuare in codice usa "Converti in codice".
`
}

/** Funzioni esportate da un file JS/TS (per i nodi "Chiama funzione"). */
export interface ExportedFunction {
  path: string
  name: string
  params: string[]
}

export function findExportedFunctions(path: string, source: string): ExportedFunction[] {
  const out: ExportedFunction[] = []
  const clean = (params: string) =>
    params
      .split(',')
      .map((p) => p.trim().replace(/^\.\.\./, '').split(/[:=?]/)[0]!.trim())
      .filter((p) => /^[A-Za-z_$][\w$]*$/.test(p))
  const fn = /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/g
  const arrow = /export\s+const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?\(([^)]*)\)\s*(?::[^=]+)?=>/g
  let match: RegExpExecArray | null
  while ((match = fn.exec(source))) out.push({ path, name: match[1]!, params: clean(match[2]!) })
  while ((match = arrow.exec(source))) out.push({ path, name: match[1]!, params: clean(match[2]!) })
  return out
}
