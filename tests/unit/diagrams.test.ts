import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import type { DbSchema } from '@shared/contracts/db'
import { diagramToDdl, inferredRelations, parseTableText, schemaToDiagram, tableText } from '@shared/diagrams/er'
import { flowchartToCode, functionNames, functionToFlowchart, toCondition } from '@shared/diagrams/flow-code'
import { fromMermaidFlowchart, toMermaid } from '@shared/diagrams/mermaid'
import { parseDiagram, SHAPE_SIZES, type Diagram, type DiagramEdge, type DiagramNode, type ShapeKind } from '@shared/diagrams/model'
import { classToTypeScript, parseClassText } from '@shared/diagrams/uml'

const n = (id: string, shape: ShapeKind, text: string): DiagramNode => ({ id, shape, text, x: 0, y: 0, ...SHAPE_SIZES[shape] })
const e = (source: string, target: string, label?: string): DiagramEdge => ({ id: `${source}-${target}`, source, target, label })
const flow = (nodes: DiagramNode[], edges: DiagramEdge[]): Diagram => ({ kind: 'diagramma', version: 1, type: 'flowchart', nodes, edges })

/** Esegue il codice generato (senza input) e restituisce ciò che scrive in console. */
function runGenerated(code: string): unknown[] {
  const logs: unknown[] = []
  const body = code.replace(/^await main\(\)$/m, 'main()')
  runInNewContext(body, { console: { log: (...args: unknown[]) => logs.push(args.length === 1 ? args[0] : args) } })
  return logs
}

describe('flowchart → codice', () => {
  it('condizioni scritte alla buona', () => {
    expect(toCondition('x = 5 e y ≠ 3')).toBe('x === 5 && y !== 3')
    expect(toCondition('a ≤ b o non c')).toBe('a <= b || !c')
    expect(toCondition('i >= 10')).toBe('i >= 10')
  })

  it('ciclo: somma dei numeri da 1 a 10', () => {
    const diagram = flow(
      [n('s', 'inizio', 'Inizio'), n('init', 'processo', 'somma = 0\ni = 1'), n('d', 'decisione', 'i ≤ 10'), n('body', 'processo', 'somma = somma + i\ni = i + 1'), n('out', 'io', 'scrivi somma'), n('f', 'inizio', 'Fine')],
      [e('s', 'init'), e('init', 'd'), e('d', 'body', 'sì'), e('body', 'd'), e('d', 'out', 'no'), e('out', 'f')]
    )
    const { code, warnings } = flowchartToCode(diagram, 'somma.diagramma.json')
    expect(warnings).toEqual([])
    expect(code).toContain('let somma, i')
    expect(code).toContain('while (i <= 10) {')
    expect(runGenerated(code)).toEqual([55])
  })

  it('se/altrimenti con ricongiungimento', () => {
    const diagram = flow(
      [n('s', 'inizio', 'Inizio'), n('x', 'processo', 'x = 7'), n('d', 'decisione', 'x > 5'), n('a', 'io', "scrivi 'grande'"), n('b', 'io', "scrivi 'piccolo'"), n('m', 'io', "scrivi 'fine'"), n('f', 'inizio', 'Fine')],
      [e('s', 'x'), e('x', 'd'), e('d', 'a', 'sì'), e('d', 'b', 'no'), e('a', 'm'), e('b', 'm'), e('m', 'f')]
    )
    const { code } = flowchartToCode(diagram, 'x.diagramma.json')
    expect(code).toContain('if (x > 5) {')
    expect(code).toContain('} else {')
    expect(runGenerated(code)).toEqual(['grande', 'fine'])
  })

  it('lettura con readline quando si usa "leggi"', () => {
    const { code } = flowchartToCode(flow([n('s', 'inizio', 'Inizio'), n('r', 'io', 'leggi nome'), n('w', 'io', "scrivi 'Ciao ' + nome")], [e('s', 'r'), e('r', 'w')]), 'x')
    expect(code).toContain("import * as readline from 'node:readline/promises'")
    expect(code).toContain("nome = await leggi(\"nome\");")
    expect(code).toContain('rl.close()')
  })
})

describe('codice → flowchart', () => {
  const source = `
export function classifica(voti: number[]): string {
  let somma = 0
  for (let i = 0; i < voti.length; i++) {
    somma += voti[i]
  }
  const media = somma / voti.length
  if (media >= 6) {
    console.log('promosso', media)
    return 'promosso'
  } else {
    return 'rimandato'
  }
}
const doppio = (x: number) => x * 2
`
  it('elenca le funzioni', () => {
    expect(functionNames(source)).toEqual(['classifica', 'doppio'])
  })
  it('costruisce forme e collegamenti, compresi i cicli all’indietro', () => {
    const diagram = functionToFlowchart(source, 'classifica')
    const shapes = diagram.nodes.map((node) => node.shape)
    expect(shapes.filter((s) => s === 'decisione')).toHaveLength(2)
    expect(diagram.nodes.find((node) => node.shape === 'inizio')?.text).toBe('Inizio: classifica(voti: number[])')
    expect(diagram.nodes.some((node) => node.text === 'scrivi \'promosso\', media')).toBe(true)
    expect(diagram.edges.some((edge) => edge.sourceHandle === 'l')).toBe(true)
    expect(diagram.edges.filter((edge) => edge.label === 'sì')).toHaveLength(2)
    const fine = diagram.nodes.find((node) => node.text === 'Fine')!
    expect(diagram.edges.filter((edge) => edge.target === fine.id)).toHaveLength(2)
  })
  it('funzioni freccia con corpo espressione', () => {
    const diagram = functionToFlowchart(source, 'doppio')
    expect(diagram.nodes.map((node) => node.text)).toContain('restituisci x * 2')
  })
  it('errore chiaro se la funzione non c’è', () => {
    expect(() => functionToFlowchart(source, 'inesistente')).toThrow(/non trovata/)
  })
})

describe('Mermaid', () => {
  it('esporta e reimporta un flowchart con forme ed etichette', () => {
    const diagram = flow([n('s', 'inizio', 'Inizio'), n('d', 'decisione', 'x > 0'), n('a', 'io', 'scrivi x'), n('b', 'processo', 'x = -x')], [e('s', 'd'), e('d', 'a', 'sì'), e('d', 'b', 'no'), e('b', 'a')])
    const text = toMermaid(diagram)
    expect(text).toContain('flowchart TD')
    expect(text).toContain('N2{"x > 0"}')
    expect(text).toContain('N2 -->|sì| N3')
    const back = fromMermaidFlowchart(text)
    expect(back.nodes.map((node) => [node.shape, node.text])).toEqual([
      ['inizio', 'Inizio'],
      ['decisione', 'x > 0'],
      ['io', 'scrivi x'],
      ['processo', 'x = -x']
    ])
    expect(back.edges.map((edge) => edge.label ?? '')).toEqual(['', 'sì', 'no', ''])
    expect(new Set(back.nodes.map((node) => node.y)).size).toBeGreaterThan(1)
  })
  it('importa la sintassi corta su una riga', () => {
    const d = fromMermaidFlowchart('graph LR\n  A[Start] --> B{Ok?} -->|sì| C([Fine])')
    expect(d.nodes).toHaveLength(3)
    expect(d.edges).toHaveLength(2)
  })
  it('rifiuta testo che non è un flowchart', () => {
    expect(() => fromMermaidFlowchart('sequenceDiagram\nA->>B: ciao')).toThrow()
  })
})

describe('ER e classi', () => {
  const ordini = 'ordini\nid INTEGER PK AI\ncliente_id INTEGER NN FK clienti.id\ntotale REAL'
  const clienti = 'clienti\nid INTEGER PK AI\nemail TEXT UQ'
  it('testo di una tabella ↔ modello', () => {
    const table = parseTableText(ordini)
    expect(table.name).toBe('ordini')
    expect(table.columns.map((c) => [c.name, c.type, c.primaryKey, c.autoIncrement, c.notNull, c.references])).toEqual([
      ['id', 'INTEGER', true, true, false, ''],
      ['cliente_id', 'INTEGER', false, false, true, 'clienti.id'],
      ['totale', 'REAL', false, false, false, '']
    ])
    expect(tableText(table)).toBe(ordini)
  })
  it('DDL in ordine di dipendenza e relazioni dedotte', () => {
    const diagram: Diagram = { kind: 'diagramma', version: 1, type: 'er', nodes: [n('o', 'tabella', ordini), n('c', 'tabella', clienti)], edges: [] }
    const ddl = diagramToDdl(diagram, 'sqlite')
    expect(ddl.indexOf('CREATE TABLE clienti')).toBeLessThan(ddl.indexOf('CREATE TABLE ordini'))
    expect(ddl).toContain('FOREIGN KEY (cliente_id) REFERENCES clienti (id)')
    expect(inferredRelations(diagram)).toEqual([{ source: 'o', target: 'c', label: 'cliente_id → id' }])
  })
  it('diagramma da uno schema reale', () => {
    const schema: DbSchema = {
      engine: 'sqlite',
      tables: [
        { name: 'clienti', kind: 'table', columns: [{ name: 'id', type: 'INTEGER', notNull: true, defaultValue: null, primaryKey: true, unique: false }], foreignKeys: [], indexes: [], rowCount: 1 },
        { name: 'ordini', kind: 'table', columns: [{ name: 'id', type: 'INTEGER', notNull: true, defaultValue: null, primaryKey: true, unique: false }, { name: 'cliente_id', type: 'INTEGER', notNull: true, defaultValue: null, primaryKey: false, unique: false }], foreignKeys: [{ column: 'cliente_id', refTable: 'clienti', refColumn: 'id' }], indexes: [], rowCount: 0 }
      ]
    }
    const diagram = schemaToDiagram(schema)
    expect(diagram.nodes.map((node) => node.text.split('\n')[0])).toEqual(['clienti', 'ordini'])
    expect(diagram.edges).toHaveLength(1)
    expect(toMermaid(diagram)).toContain('clienti ||--o{ ordini')
  })
  it('classe UML → TypeScript', () => {
    const text = 'Persona\n---\n+ nome: string\n- eta: number\n---\n+ saluta(altro: string): string\n+ compleanno()'
    expect(parseClassText(text)).toEqual({ name: 'Persona', attributes: ['+ nome: string', '- eta: number'], methods: ['+ saluta(altro: string): string', '+ compleanno()'] })
    const ts = classToTypeScript(text)
    expect(ts).toContain('export class Persona {')
    expect(ts).toContain('  private eta: number')
    expect(ts).toContain('  constructor(nome: string, eta: number) {')
    expect(ts).toContain('  public saluta(altro: string): string {')
  })
  it('file rovinati diventano un diagramma vuoto', () => {
    expect(parseDiagram('{oops')).toMatchObject({ type: 'libero', nodes: [], edges: [] })
  })
})
