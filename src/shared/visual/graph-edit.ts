// Modifiche ai fili del programma a nodi e cronologia per Annulla/Ripeti (logica pura).
// Come nei Blueprint di Unreal: un'uscita di flusso («poi», «allora»…) ha UN solo filo, perché
// l'ordine di esecuzione deve vedersi; un ingresso di dati riceve un solo valore.
import { NODE_SPECS, type NodeSpec } from './nodes'

export interface WireLike {
  id: string
  source: string
  sourceHandle?: string | null
  target: string
  targetHandle?: string | null
}

/** Un filo di flusso entra sempre nella maniglia «in»; gli altri portano dati. */
export const isExecWire = (wire: Pick<WireLike, 'targetHandle'>) => wire.targetHandle === 'in'

export function wireId(wire: Omit<WireLike, 'id'>): string {
  return `${wire.source}:${wire.sourceHandle ?? ''}->${wire.target}:${wire.targetHandle ?? ''}`
}

/**
 * Aggiunge un filo togliendo quelli che non possono convivere con lui:
 * - uscita di flusso: il filo nuovo sostituisce quello che partiva dalla stessa uscita;
 * - ingresso di dati: il filo nuovo sostituisce quello che arrivava allo stesso ingresso;
 * - lo stesso filo due volte: uno solo.
 */
export function connectWire<W extends WireLike>(wires: W[], wire: W): W[] {
  const exec = isExecWire(wire)
  const kept = wires.filter((w) => {
    if (w.id === wire.id) return false
    if (exec) return !(isExecWire(w) && w.source === wire.source && (w.sourceHandle ?? '') === (wire.sourceHandle ?? ''))
    return !(w.target === wire.target && (w.targetHandle ?? '') === (wire.targetHandle ?? ''))
  })
  return [...kept, wire]
}

/** Ricollega un filo esistente trascinandone un capo: il vecchio sparisce, il nuovo segue le regole sopra. */
export function reconnectWire<W extends WireLike>(wires: W[], old: W, next: W): W[] {
  return connectWire(
    wires.filter((w) => w.id !== old.id),
    next
  )
}

/**
 * Nodi che si possono attaccare a un filo lasciato nel vuoto, partendo dalla maniglia `handle`
 * (di tipo `side`): da un'uscita di flusso → nodi con ingresso di flusso; da un'uscita di valore →
 * nodi con un ingresso di dati; da un ingresso → nodi che possono alimentarlo.
 */
export function compatibleNodes(side: 'source' | 'target', handle: string): { spec: NodeSpec; handle: string }[] {
  const out: { spec: NodeSpec; handle: string }[] = []
  for (const spec of NODE_SPECS) {
    if (side === 'source' && handle !== 'out') {
      if (spec.execIn) out.push({ spec, handle: 'in' })
    } else if (side === 'source') {
      if (spec.inputs.length) out.push({ spec, handle: spec.inputs[0]! })
    } else if (handle === 'in') {
      if (spec.execOut.length) out.push({ spec, handle: spec.execOut[0]! })
    } else if (spec.output) out.push({ spec, handle: 'out' })
  }
  return out
}

// ---------------------------------------------------------------- cronologia

/** Pile di Annulla/Ripeti con istantanee immutabili (al più `limit` passi). */
export class History<T> {
  private past: T[] = []
  private future: T[] = []

  constructor(private readonly limit = 100) {}

  /** Da chiamare PRIMA di una modifica, con lo stato com'era. */
  record(state: T): void {
    this.past.push(state)
    if (this.past.length > this.limit) this.past.shift()
    this.future = []
  }

  undo(current: T): T | null {
    const previous = this.past.pop()
    if (previous === undefined) return null
    this.future.push(current)
    return previous
  }

  redo(current: T): T | null {
    const next = this.future.pop()
    if (next === undefined) return null
    this.past.push(current)
    return next
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }
}
