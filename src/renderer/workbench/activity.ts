// Registro delle attività in memoria (ultime 200 voci): ogni avviso a comparsa, ogni errore delle query,
// ogni pannello bloccato. Si legge dal pulsante «Attività» della barra di stato (comando workbench.activity).
import { create } from 'zustand'
import { appendBounded, type ActivityEntry, type ActivityKind } from '@shared/activity-log'

interface ActivityState {
  entries: ActivityEntry[]
  /** Errori arrivati da quando il registro è stato aperto l'ultima volta (pallino sul pulsante). */
  unseenErrors: number
  add: (entry: Omit<ActivityEntry, 'id' | 'at'>) => ActivityEntry
  markSeen: () => void
  clear: () => void
}

let nextId = 1

export const useActivity = create<ActivityState>((set) => ({
  entries: [],
  unseenErrors: 0,
  add: (partial) => {
    const entry: ActivityEntry = { ...partial, id: nextId++, at: Date.now() }
    set((state) => ({ entries: appendBounded(state.entries, entry), unseenErrors: state.unseenErrors + (entry.kind === 'error' ? 1 : 0) }))
    return entry
  },
  markSeen: () => set({ unseenErrors: 0 }),
  clear: () => set({ entries: [], unseenErrors: 0 })
}))

export function logActivity(kind: ActivityKind, message: string, extra: { title?: string; details?: string; source?: string } = {}): ActivityEntry {
  return useActivity.getState().add({ kind, message, ...extra })
}
