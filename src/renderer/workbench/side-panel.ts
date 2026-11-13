// Pannello laterale destro del guscio (fuori dalla griglia dockview), come la barra laterale secondaria
// di VS Code. Un modulo vi registra il proprio contenuto (oggi la chat AI); il guscio gestisce apertura,
// larghezza, espansione e stato ricordato tra i riavvii. Regole di larghezza in @shared/ai/side-panel.
import type { FunctionComponent } from 'react'
import { create } from 'zustand'
import { clampSideWidth, parseSideState, type SidePanelState } from '@shared/ai/side-panel'
import { executeCommand } from './commands'

const STORAGE_KEY = 'easey.sidePanel'

export interface SidePanelRegistration {
  component: FunctionComponent
  /** Nome accessibile dell'<aside> (es. «Assistente AI»). */
  title: string
  /** Testo del pulsante che riapre il pannello chiuso (es. «✦ AI»). */
  reopenLabel: string
  reopenTitle: string
}

let registration: SidePanelRegistration | null = null

export function registerSidePanel(next: SidePanelRegistration): void {
  registration = next
}

export function sidePanelRegistration(): SidePanelRegistration | null {
  return registration
}

function load(): SidePanelState {
  try {
    return parseSideState(localStorage.getItem(STORAGE_KEY))
  } catch {
    return parseSideState(null)
  }
}

interface SidePanelStore extends SidePanelState {
  /** Cresce a ogni richiesta di fuoco nella casella (Ctrl+Shift+A): il contenuto la osserva. */
  focusRequest: number
  setOpen: (open: boolean, focus?: boolean) => void
  toggle: () => void
  setWidth: (width: number) => void
  toggleExpanded: () => void
}

export const useSidePanel = create<SidePanelStore>((set, get) => ({
  ...load(),
  focusRequest: 0,
  setOpen: (open, focus = false) => {
    if (!open && document.activeElement?.closest('.side-panel')) void executeCommand('editor.focus')
    set((state) => ({ open, focusRequest: focus ? state.focusRequest + 1 : state.focusRequest }))
  },
  toggle: () => get().setOpen(!get().open),
  setWidth: (width) => set({ width: clampSideWidth(width, window.innerWidth), expanded: false }),
  toggleExpanded: () => set((state) => ({ expanded: !state.expanded }))
}))

// Lo stato si ricorda tra i riavvii (solo aperto/larghezza/espanso, non il fuoco).
useSidePanel.subscribe((state, previous) => {
  if (state.open === previous.open && state.width === previous.width && state.expanded === previous.expanded) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ open: state.open, width: state.width, expanded: state.expanded }))
  } catch {
    /* archivio non disponibile: lo stato vale solo per questa sessione */
  }
})

export const sidePanel = () => useSidePanel.getState()
