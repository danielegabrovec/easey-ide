// Schermata iniziale a tutta finestra (docs/SCHERMATA-INIZIALE.md di Easey DB): senza progetto copre l'area dei
// pannelli (Esplora, Anteprima, Console e assistente non si vedono); appena si apre o si crea qualcosa torna la
// disposizione di lavoro com'era (la griglia sotto non si tocca). Il logo e «Schermata iniziale» la riportano anche con
// un progetto aperto. Il contenuto lo mette il modulo Esplora nello spazio «workbench.start».
import { create } from 'zustand'
import { useWorkbench, workbench } from './store'

interface StartState {
  /** Chiesta dall'utente (logo, comando) anche con un progetto aperto. */
  shown: boolean
  /** Lasciata per lavorare senza progetto (Scrittura rapida, Laboratorio, Manuale…). */
  dismissed: boolean
  /** L'assistente AI aperto sopra la schermata iniziale (pulsante nella barra). */
  assistant: boolean
}

export const useStart = create<StartState>(() => ({ shown: false, dismissed: false, assistant: false }))

/** Si vede adesso? */
export function startVisible(state: StartState, hasProject: boolean): boolean {
  return state.shown || (!hasProject && !state.dismissed)
}

export function useStartVisible(): boolean {
  const hasProject = useWorkbench((s) => s.project !== null)
  return useStart((s) => startVisible(s, hasProject))
}

export const isStartVisible = () => startVisible(useStart.getState(), workbench().project !== null)

export function showStart(): void {
  useStart.setState({ shown: true, dismissed: false, assistant: false })
}

/** Si torna alla disposizione di lavoro (un pannello aperto, un progetto, Esc). */
export function hideStart(): void {
  const state = useStart.getState()
  if (!state.shown && state.dismissed && !state.assistant) return
  useStart.setState({ shown: false, dismissed: true, assistant: false })
}

// Aperto o creato un progetto: la schermata iniziale lascia il posto al lavoro; chiuso: torna.
useWorkbench.subscribe((state, previous) => {
  if (state.project && state.project !== previous.project) useStart.setState({ shown: false, assistant: false })
  if (!state.project && previous.project) useStart.setState({ shown: false, dismissed: false, assistant: false })
})
