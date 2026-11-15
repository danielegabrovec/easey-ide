// Spazi in cui un modulo mette un pezzo d'interfaccia dentro il pannello di un altro, senza importarlo (Fase 10):
// il Benvenuto mostra `<Slot name="welcome.top" />` e `<Slot name="welcome.column" />`, il modulo Guide
// ci registra «Cosa fare adesso» e l'invito al primo percorso. Se nessuno registra niente, lo spazio resta vuoto.
import { Fragment, type FunctionComponent } from 'react'
import { create } from 'zustand'

/** Spazi noti: Benvenuto in alto, colonna del Benvenuto, sopra a tutta la finestra (schede non modali). */
export type SlotName = 'welcome.top' | 'welcome.column' | 'workbench.overlay' | 'quick.top'

interface SlotEntry {
  id: string
  render: FunctionComponent
  order: number
}

const useSlots = create<{ slots: Partial<Record<SlotName, SlotEntry[]>> }>(() => ({ slots: {} }))

export function registerSlot(name: SlotName, id: string, render: FunctionComponent, order = 0): () => void {
  useSlots.setState((state) => {
    const list = (state.slots[name] ?? []).filter((entry) => entry.id !== id)
    return { slots: { ...state.slots, [name]: [...list, { id, render, order }].sort((a, b) => a.order - b.order) } }
  })
  return () => useSlots.setState((state) => ({ slots: { ...state.slots, [name]: (state.slots[name] ?? []).filter((entry) => entry.id !== id) } }))
}

export function Slot({ name }: { name: SlotName }) {
  const entries = useSlots((s) => s.slots[name])
  if (!entries?.length) return null
  return (
    <>
      {entries.map((entry) => (
        <Fragment key={entry.id}>
          <entry.render />
        </Fragment>
      ))}
    </>
  )
}
