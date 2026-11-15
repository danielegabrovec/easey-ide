// Percorsi guidati (Fase 10): logica pura dei passi di un tour. Il renderer (src/renderer/ui/Tour.tsx) disegna il
// riquadro evidenziato e la nuvoletta, osserva il DOM, i comandi eseguiti e gli eventi del workbench e passa qui i
// «segnali»; qui si decide se il passo è compiuto, se manca il bersaglio, se aprire il pannello giusto o se saltare.
// Niente DOM, niente React: si prova con i test (tests/unit/guide.test.ts).

/** Che cosa fa avanzare un passo da solo (oltre al pulsante «Avanti»). */
export type TourWait =
  /** Un comando del registro è stato eseguito (con `needResult` solo se ha restituito qualcosa: null/false = annullato). */
  | { kind: 'command'; command: string; needResult?: boolean }
  /** Un evento del workbench (es. `project:opened`); `test` filtra il contenuto (es. file in `codegen/`). */
  | { kind: 'event'; event: string; test?: (payload: unknown) => boolean }
  /** Un elemento visibile compare (es. il pannello «Dati» aperto). */
  | { kind: 'element'; selector: string }
  /** Una condizione sul DOM o sullo stato, controllata a ogni giro. */
  | { kind: 'check'; test: () => boolean }

export interface TourStep {
  id: string
  title: string
  text: string
  /** Selettore CSS dell'elemento da evidenziare (assente = nuvoletta al centro). */
  target?: string
  placement?: 'auto' | 'top' | 'bottom' | 'left' | 'right'
  /** Il passo si compie da solo quando l'utente fa l'azione. */
  wait?: TourWait
  /** Comando che apre il pannello giusto se il bersaglio non c'è (es. `sql.show`, `studio.open`). */
  open?: { command: string; args?: unknown }
  /** Pulsante «fallo per me» nella nuvoletta (es. «Apri i dati di clienti»). */
  action?: { label: string; command: string; args?: unknown }
  /**
   * Nuvoletta in un angolo invece che accanto al bersaglio (che resta evidenziato): per i passi in cui si lavora in
   * un'area grande (scrivere righe nella griglia) e la nuvoletta coprirebbe il lavoro.
   */
  dock?: boolean
}

export interface TourDefinition {
  id: string
  title: string
  description: string
  /** Minuti indicativi. */
  minutes: number
  steps: TourStep[]
}

export interface TourState {
  tourId: string
  index: number
  total: number
  status: 'running' | 'done' | 'exited'
  /** Quando è iniziato il passo (ms). */
  enteredAt: number
  /** Il comando `open` del passo è già stato provato. */
  opened: boolean
  /** Il bersaglio non si trova: la nuvoletta lo dice e propone di andare avanti. */
  missing: boolean
}

/** Dopo quanto il bersaglio che manca si apre col comando del passo e dopo quanto si dichiara mancante. */
export const OPEN_AFTER_MS = 400
export const MISSING_AFTER_MS = 3500

export type TourSignal =
  | { kind: 'command'; command: string; result?: unknown }
  | { kind: 'event'; event: string; payload?: unknown }
  /** Giro di controllo: `present(selettore)` dice se l'elemento è visibile adesso. */
  | { kind: 'poll'; now: number; present: (selector: string) => boolean }

export interface SignalOutcome {
  state: TourState
  /** Il passo vuole aprire il pannello giusto con questo comando. */
  open?: { command: string; args?: unknown }
}

export function startTour(tour: TourDefinition, now: number): TourState {
  return { tourId: tour.id, index: 0, total: tour.steps.length, status: tour.steps.length ? 'running' : 'done', enteredAt: now, opened: false, missing: false }
}

function enter(state: TourState, index: number, now: number): TourState {
  if (index >= state.total) return { ...state, status: 'done', missing: false }
  return { ...state, index: Math.max(0, index), enteredAt: now, opened: false, missing: false }
}

/** «Avanti» (anche per saltare un passo che aspetta un'azione); dopo l'ultimo il tour è finito. */
export function nextStep(state: TourState, now: number): TourState {
  if (state.status !== 'running') return state
  return enter(state, state.index + 1, now)
}

export function previousStep(state: TourState, now: number): TourState {
  if (state.status !== 'running' || state.index === 0) return state
  return enter(state, state.index - 1, now)
}

export function exitTour(state: TourState): TourState {
  return state.status === 'running' ? { ...state, status: 'exited' } : state
}

export function currentStep(tour: TourDefinition, state: TourState): TourStep | null {
  return state.status === 'running' ? (tour.steps[state.index] ?? null) : null
}

/** Il segnale compie il passo? */
export function waitSatisfied(wait: TourWait | undefined, signal: TourSignal): boolean {
  if (!wait) return false
  if (wait.kind === 'command') return signal.kind === 'command' && signal.command === wait.command && (!wait.needResult || (signal.result !== null && signal.result !== undefined && signal.result !== false))
  if (wait.kind === 'event') return signal.kind === 'event' && signal.event === wait.event && (!wait.test || safeTest(() => wait.test!(signal.payload)))
  if (signal.kind !== 'poll') return false
  if (wait.kind === 'element') return signal.present(wait.selector)
  return safeTest(wait.test)
}

function safeTest(test: () => boolean): boolean {
  try {
    return test()
  } catch {
    return false
  }
}

/**
 * Un segnale arriva al tour: il passo compiuto va avanti; a ogni giro si guarda anche il bersaglio (se manca si
 * apre il pannello col comando del passo, poi, se manca ancora, la nuvoletta lo dice e lascia andare avanti).
 */
export function applySignal(tour: TourDefinition, state: TourState, signal: TourSignal): SignalOutcome {
  const step = currentStep(tour, state)
  if (!step) return { state }
  if (waitSatisfied(step.wait, signal)) return { state: nextStep(state, signal.kind === 'poll' ? signal.now : state.enteredAt) }
  if (signal.kind !== 'poll' || !step.target) return { state }
  if (signal.present(step.target)) return { state: state.missing ? { ...state, missing: false } : state }
  const elapsed = signal.now - state.enteredAt
  if (!state.opened && step.open && elapsed >= OPEN_AFTER_MS) return { state: { ...state, opened: true }, open: step.open }
  if (!state.missing && elapsed >= MISSING_AFTER_MS) return { state: { ...state, missing: true } }
  return { state }
}

/** «Passo 2 di 6». */
export function stepProgress(state: TourState): { n: number; total: number } {
  return { n: Math.min(state.index + 1, state.total), total: state.total }
}

/** Elenco dei percorsi completati con uno in più (senza doppioni, ordine di completamento). */
export function withCompleted(completed: readonly string[], tourId: string): string[] {
  return completed.includes(tourId) ? [...completed] : [...completed, tourId]
}

/** Dove mettere la nuvoletta rispetto al riquadro evidenziato (spazio libero nella finestra). */
export function bubblePlacement(
  target: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
  bubble: { width: number; height: number },
  preferred: TourStep['placement'] = 'auto'
): 'top' | 'bottom' | 'left' | 'right' {
  const room = {
    bottom: viewport.height - (target.y + target.height),
    top: target.y,
    right: viewport.width - (target.x + target.width),
    left: target.x
  }
  const fits = { bottom: room.bottom >= bubble.height + 16, top: room.top >= bubble.height + 16, right: room.right >= bubble.width + 16, left: room.left >= bubble.width + 16 }
  if (preferred && preferred !== 'auto' && fits[preferred]) return preferred
  for (const side of ['bottom', 'right', 'top', 'left'] as const) if (fits[side]) return side
  return (Object.entries(room) as [keyof typeof room, number][]).sort((a, b) => b[1] - a[1])[0]![0]
}
