// Fili del programma a nodi e cronologia (revisione del 13/11/2026, P1-6 e P1-7).
import { describe, expect, it } from 'vitest'
import { compatibleNodes, connectWire, History, reconnectWire, wireId, type WireLike } from '@shared/visual/graph-edit'

const wire = (source: string, sourceHandle: string, target: string, targetHandle: string): WireLike => ({ id: wireId({ source, sourceHandle, target, targetHandle }), source, sourceHandle, target, targetHandle })

describe('connectWire', () => {
  it('un’uscita di flusso ha un solo filo: il nuovo sostituisce il vecchio', () => {
    const first = [wire('evento', 'poi', 'testo', 'in')]
    const next = connectWire(first, wire('evento', 'poi', 'console', 'in'))
    expect(next.map((w) => w.target)).toEqual(['console'])
  })

  it('uscite diverse dello stesso nodo restano (allora / altrimenti)', () => {
    const list = connectWire([wire('se', 'allora', 'a', 'in')], wire('se', 'altrimenti', 'b', 'in'))
    expect(list).toHaveLength(2)
  })

  it('un ingresso di flusso può ricevere più fili (si entra da più punti)', () => {
    const list = connectWire([wire('a', 'poi', 'c', 'in')], wire('b', 'poi', 'c', 'in'))
    expect(list).toHaveLength(2)
  })

  it('un ingresso di dati riceve un solo valore; un valore può andare in più ingressi', () => {
    const one = connectWire([wire('n1', 'out', 'testo', 'valore')], wire('n2', 'out', 'testo', 'valore'))
    expect(one.map((w) => w.source)).toEqual(['n2'])
    const many = connectWire([wire('n1', 'out', 'a', 'valore')], wire('n1', 'out', 'b', 'valore'))
    expect(many).toHaveLength(2)
  })

  it('lo stesso filo due volte resta uno', () => {
    expect(connectWire([wire('a', 'poi', 'b', 'in')], wire('a', 'poi', 'b', 'in'))).toHaveLength(1)
  })

  it('ricollegare sposta il filo e rispetta le stesse regole', () => {
    const old = wire('a', 'poi', 'b', 'in')
    const list = reconnectWire([old, wire('x', 'poi', 'y', 'in')], old, wire('a', 'poi', 'y', 'in'))
    expect(list.map((w) => `${w.source}>${w.target}`).sort()).toEqual(['a>y', 'x>y'])
  })
})

describe('compatibleNodes (filo lasciato nel vuoto)', () => {
  it('da un’uscita di flusso: solo nodi con ingresso di flusso', () => {
    const list = compatibleNodes('source', 'poi')
    expect(list.length).toBeGreaterThan(3)
    expect(list.every((c) => c.spec.execIn && c.handle === 'in')).toBe(true)
  })

  it('da un valore: nodi con un ingresso di dati; verso un ingresso di dati: nodi che danno un valore', () => {
    expect(compatibleNodes('source', 'out').every((c) => c.spec.inputs.includes(c.handle))).toBe(true)
    expect(compatibleNodes('target', 'valore').every((c) => c.spec.output && c.handle === 'out')).toBe(true)
    expect(compatibleNodes('target', 'in').every((c) => c.spec.execOut.includes(c.handle))).toBe(true)
  })
})

describe('History', () => {
  it('annulla e ripete in ordine; una modifica nuova cancella i passi da ripetere', () => {
    const h = new History<number>()
    h.record(1)
    h.record(2)
    expect(h.undo(3)).toBe(2)
    expect(h.undo(2)).toBe(1)
    expect(h.undo(1)).toBeNull()
    expect(h.redo(1)).toBe(2)
    h.record(2)
    expect(h.canRedo).toBe(false)
  })

  it('tiene al più `limit` passi', () => {
    const h = new History<number>(2)
    h.record(1)
    h.record(2)
    h.record(3)
    expect(h.undo(4)).toBe(3)
    expect(h.undo(3)).toBe(2)
    expect(h.undo(2)).toBeNull()
  })
})
