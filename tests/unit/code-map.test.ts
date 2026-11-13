// Vista affiancata grafica ↔ codice: mappa fra elementi grafici e intervalli del codice.
import { describe, expect, it } from 'vitest'
import { idAtLine, mapSteps } from '@shared/visual/code-map'
import { generateNodesCode } from '@shared/visual/nodes'
import type { NodesProgram, VEdge, VNode } from '@shared/visual/program'
import { elementAtOffset, findByAttrId, parseHtml } from '@shared/designer/html-model'

const node = (id: string, type: string, data: Record<string, string> = {}, y = 0): VNode => ({ id, type, x: 0, y, data })
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): VEdge => ({ id: `${source}-${target}`, source, sourceHandle, target, targetHandle })
const options = { outputPath: 'logica.generato.js', sourceName: 'logica.nodi.json', functions: [] }

function program(highlight: boolean): NodesProgram {
  return {
    kind: 'nodi',
    version: 1,
    target: 'pagina',
    highlight,
    nodes: [node('e', 'evento', { elemento: 'pulsante', evento: 'click' }), node('t', 'testo', { elemento: 'titolo', valore: 'Ciao' }, 1), node('s', 'se', { condizione: 'true' }, 2), node('c', 'console', { valore: 'dentro' }, 3)],
    edges: [edge('e', 'poi', 't', 'in'), edge('t', 'poi', 's', 'in'), edge('s', 'allora', 'c', 'in')]
  }
}

describe('mapSteps (nodi e blocchi)', () => {
  const withSteps = generateNodesCode(program(true), options)
  const clean = generateNodesCode(program(false), options)
  const map = mapSteps(withSteps, new Set(['e']))
  const lines = map.clean.split('\n')

  it('il codice mostrato è proprio quello pulito (senza __labStep)', () => {
    expect(map.clean).toBe(clean)
    expect(map.clean).not.toContain('__labStep')
  })

  it('ogni nodo punta alla sua riga', () => {
    expect(lines[map.ranges['e']!.startLine - 1]).toContain('addEventListener("click"')
    expect(lines[map.ranges['t']!.startLine - 1]).toContain('.textContent = "Ciao"')
    expect(lines[map.ranges['s']!.startLine - 1]).toContain('if (true)')
    expect(lines[map.ranges['c']!.startLine - 1]).toContain('console.log("dentro")')
  })

  it('dalla riga al nodo (clic nel codice)', () => {
    expect(idAtLine(map.ranges, map.ranges['c']!.startLine)).toBe('c')
    expect(idAtLine(map.ranges, map.ranges['t']!.startLine)).toBe('t')
    expect(idAtLine(map.ranges, 1)).toBeNull()
  })

  it('accetta anche gli id fra apici singoli (Blockly)', () => {
    const blockly = "__labStep('a1');\nwindow.alert('x');\n__labStep('b2');\nconsole.log(1);\n"
    const m = mapSteps(blockly)
    expect(m.clean).toBe("window.alert('x');\nconsole.log(1);\n")
    expect(m.ranges).toEqual({ a1: { startLine: 1, endLine: 1 }, b2: { startLine: 2, endLine: 2 } })
  })
})

describe('pagine HTML: elemento ↔ intervallo del sorgente', () => {
  it('ogni posizione dentro l’elemento riporta all’elemento, e l’intervallo contiene il suo testo', () => {
    const source = '<body>\n  <main>\n    <h1 id="titolo">Ciao!</h1>\n  </main>\n</body>'
    const model = parseHtml(source)
    const h1 = findByAttrId(model, 'titolo')!
    expect(source.slice(h1.start, h1.end)).toBe('<h1 id="titolo">Ciao!</h1>')
    expect(elementAtOffset(model, h1.start + 3)?.id).toBe(h1.id)
    expect(elementAtOffset(model, source.indexOf('Ciao'))?.id).toBe(h1.id)
  })
})
