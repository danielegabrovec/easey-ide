import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { generateNodesCode, literal, NODE_SPECS } from '@shared/visual/nodes'
import { findExportedFunctions, generatedPath, isVisualFile, parseProgram, type NodesProgram, type VEdge, type VNode } from '@shared/visual/program'

const node = (id: string, type: string, data: Record<string, string> = {}, y = 0): VNode => ({ id, type, x: 0, y, data })
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): VEdge => ({ id: `${source}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle })

function program(nodes: VNode[], edges: VEdge[], highlight = false): NodesProgram {
  return { kind: 'nodi', version: 1, target: 'pagina', highlight, nodes, edges }
}

/** DOM minimo: elementi con textContent/value/style/classList e addEventListener. */
function fakeDom() {
  const listeners: Record<string, Record<string, (event: unknown) => void>> = {}
  const elements: Record<string, { textContent: string; value: string; style: Record<string, string>; classes: Set<string> }> = {}
  const get = (selector: string) => {
    elements[selector] ??= { textContent: '', value: '', style: {}, classes: new Set() }
    const el = elements[selector]!
    return {
      get textContent() {
        return el.textContent
      },
      set textContent(v: string) {
        el.textContent = v
      },
      get value() {
        return el.value
      },
      style: el.style,
      classList: { toggle: (c: string) => (el.classes.has(c) ? el.classes.delete(c) : el.classes.add(c)), add: (c: string) => el.classes.add(c), remove: (c: string) => el.classes.delete(c) },
      addEventListener: (event: string, fn: (e: unknown) => void) => {
        listeners[selector] ??= {}
        listeners[selector]![event] = fn
      }
    }
  }
  const logs: unknown[] = []
  const context = { document: { querySelector: get }, console: { log: (v: unknown) => logs.push(v) }, alert: (v: unknown) => logs.push(`alert:${v}`), setInterval: () => 0, String, window: { parent: { postMessage: () => undefined } } }
  return { context, elements, listeners, logs, fire: (selector: string, event: string) => listeners[selector]?.[event]?.({ preventDefault: () => undefined }) }
}

describe('formato dei programmi visuali', () => {
  it('riconosce i file e ne ricava il generato', () => {
    expect(isVisualFile('a/logica.nodi.json')).toBe('nodi')
    expect(isVisualFile('prog.blocchi.json')).toBe('blocchi')
    expect(isVisualFile('dati.json')).toBeNull()
    expect(generatedPath('a/logica.nodi.json')).toBe('a/logica.generato.js')
  })
  it('tollera file vuoti o rovinati', () => {
    expect(parseProgram('', 'nodi')).toMatchObject({ kind: 'nodi', nodes: [], edges: [], target: 'pagina', highlight: true })
    expect(parseProgram('{rotto', 'blocchi')).toMatchObject({ kind: 'blocchi', workspace: {} })
  })
  it('trova le funzioni esportate e i parametri (anche TypeScript)', () => {
    const source = 'export function somma(a: number, b = 2): number { return a + b }\nfunction privata() {}\nexport const saluta = async (nome: string, ...altri: string[]): Promise<void> => {}\nexport async function vuota() {}'
    expect(findExportedFunctions('src/utils.ts', source)).toEqual([
      { path: 'src/utils.ts', name: 'somma', params: ['a', 'b'] },
      { path: 'src/utils.ts', name: 'vuota', params: [] },
      { path: 'src/utils.ts', name: 'saluta', params: ['nome', 'altri'] }
    ])
  })
})

describe('generatore dei nodi', () => {
  it('ogni nodo del catalogo ha campi coerenti', () => {
    for (const spec of NODE_SPECS) for (const input of spec.inputs) expect(spec.fields.some((f) => f.name === input)).toBe(true)
    expect(literal('42')).toBe('42')
    expect(literal('ciao')).toBe('"ciao"')
    expect(literal('abc', 'numero')).toBe('0')
  })

  it('evento → azioni in fila, con valori dai campi e dai collegamenti', () => {
    const code = generateNodesCode(
      program(
        [
          node('e', 'evento', { elemento: 'pulsante', evento: 'click' }),
          node('t', 'testo', { elemento: '#titolo' }, 1),
          node('c', 'console', { valore: 'fatto' }, 2),
          node('u', 'unisci', { a: 'Ciao ' }),
          node('f', 'campo', { elemento: 'nome' })
        ],
        [edge('e', 'poi', 't', 'in'), edge('t', 'poi', 'c', 'in'), edge('f', 'out', 'u', 'b'), edge('u', 'out', 't', 'valore')]
      ),
      { outputPath: 'logica.generato.js', sourceName: 'logica.nodi.json', functions: [] }
    )
    expect(code).toContain('document.querySelector("#pulsante").addEventListener("click", (event) => {')
    expect(code).toContain('document.querySelector("#titolo").textContent = String("Ciao ") + String(document.querySelector("#nome").value);')
    const dom = fakeDom()
    dom.elements['#nome'] = { textContent: '', value: 'Ada', style: {}, classes: new Set() }
    runInNewContext(code, dom.context)
    dom.fire('#pulsante', 'click')
    expect(dom.elements['#titolo']!.textContent).toBe('Ciao Ada')
    expect(dom.logs).toEqual(['fatto'])
  })

  it('se/altrimenti, ripeti, variabili e stile', () => {
    const code = generateNodesCode(
      program(
        [
          node('e', 'evento', { elemento: 'b', evento: 'click' }),
          node('v', 'variabile', { nome: 'conta' }, 1),
          node('op', 'operazione', { b: '1', operatore: '+' }),
          node('l', 'leggi', { nome: 'conta' }),
          node('s', 'se', {}, 2),
          node('cmp', 'confronto', { operatore: '>', b: '2' }),
          node('l2', 'leggi', { nome: 'conta' }),
          node('st', 'stile', { elemento: 'b', proprieta: 'color', valore: 'red' }, 3),
          node('r', 'ripeti', { volte: '2' }, 4),
          node('k', 'console', { valore: 'giro' }, 5)
        ],
        [
          edge('e', 'poi', 'v', 'in'),
          edge('l', 'out', 'op', 'a'),
          edge('op', 'out', 'v', 'valore'),
          edge('v', 'poi', 's', 'in'),
          edge('l2', 'out', 'cmp', 'a'),
          edge('cmp', 'out', 's', 'condizione'),
          edge('s', 'allora', 'st', 'in'),
          edge('s', 'altrimenti', 'r', 'in'),
          edge('r', 'corpo', 'k', 'in')
        ]
      ),
      { outputPath: 'x.generato.js', sourceName: 'x.nodi.json', functions: [] }
    )
    expect(code).toContain('let conta = 0;')
    const dom = fakeDom()
    runInNewContext(code, dom.context)
    dom.fire('#b', 'click')
    dom.fire('#b', 'click')
    expect(dom.logs).toEqual(['giro', 'giro', 'giro', 'giro'])
    expect(dom.elements['#b']!.style['color']).toBeUndefined()
    dom.fire('#b', 'click')
    expect(dom.elements['#b']!.style['color']).toBe('red')
  })

  it('importa le funzioni chiamate dai file del progetto e segue i passi', () => {
    const code = generateNodesCode(
      program([node('a', 'avvio'), node('c', 'chiama', { funzione: 'src/utils.ts#somma', arg0: '2', arg1: '3' }, 1)], [edge('a', 'poi', 'c', 'in')], true),
      { outputPath: 'pagine/logica.generato.js', sourceName: 'logica.nodi.json', functions: [{ path: 'src/utils.ts', name: 'somma', params: ['a', 'b'] }] }
    )
    expect(code).toContain('import { somma } from "../src/utils.js";')
    expect(code).toContain('__labStep("c");\nsomma(2, 3);')
    expect(code).toContain('function __labStep(id)')
  })

  it('interrompe i cicli di flusso invece di bloccarsi', () => {
    const code = generateNodesCode(
      program([node('a', 'avvio'), node('x', 'console', { valore: '1' }, 1), node('y', 'console', { valore: '2' }, 2)], [edge('a', 'poi', 'x', 'in'), edge('x', 'poi', 'y', 'in'), edge('y', 'poi', 'x', 'in')]),
      { outputPath: 'x.generato.js', sourceName: 'x.nodi.json', functions: [] }
    )
    expect(code).toContain('ciclo interrotto')
  })
})
