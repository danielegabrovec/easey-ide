// Bus di eventi del workbench: i moduli si parlano da qui, senza importarsi a vicenda.
import type { ProjectInfo } from '@shared/contracts/workspace'

export interface WorkbenchEvents {
  'project:opened': ProjectInfo
  'project:closed': void
  /** Un file è stato salvato su disco dall'editor. */
  'file:saved': { path: string }
  /** File cambiati su disco (anche da fuori dall'IDE). */
  'files:changed': { paths: string[] }
  'file:renamed': { from: string; to: string }
  'file:deleted': { path: string }
  /** Il cursore dell'editor si è spostato (offset nel file). */
  'editor:cursor': { path: string; offset: number }
  /** Un programma visuale nell'anteprima sta eseguendo questo blocco/nodo. */
  'preview:step': { id: string }
  /** La finestra sta per chiudersi: ogni modulo scrive subito ciò che ha in sospeso (bozze, timer). */
  'app:closing': void
}

type Listener<T> = (payload: T) => void

const listeners = new Map<keyof WorkbenchEvents, Set<Listener<never>>>()

export function on<K extends keyof WorkbenchEvents>(event: K, listener: Listener<WorkbenchEvents[K]>): () => void {
  let set = listeners.get(event)
  if (!set) {
    set = new Set()
    listeners.set(event, set)
  }
  set.add(listener as Listener<never>)
  return () => set.delete(listener as Listener<never>)
}

export function emit<K extends keyof WorkbenchEvents>(event: K, ...payload: WorkbenchEvents[K] extends void ? [] : [WorkbenchEvents[K]]): void {
  for (const listener of listeners.get(event) ?? []) {
    try {
      ;(listener as Listener<WorkbenchEvents[K] | undefined>)(payload[0])
    } catch (error) {
      console.error(`Errore nel gestore di ${event}`, error)
    }
  }
}
