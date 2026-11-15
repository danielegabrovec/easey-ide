// Avvisi a comparsa (toast). Informazioni e conferme spariscono da sole; gli ERRORI restano finché non si
// chiudono (✕), con «Copia» e «Dettagli». Ogni avviso finisce anche nel registro delle attività (activity.ts).
import { create } from 'zustand'
import { logActivity } from './activity'

export type ToastKind = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
  /** Prima riga in evidenza. */
  title?: string
  /** Testo lungo mostrato con «Dettagli» e copiato con «Copia». */
  details?: string
}

interface ToastState {
  toasts: Toast[]
  push: (kind: ToastKind, message: string, extra?: { title?: string; details?: string; source?: string }) => void
  dismiss: (id: number) => void
}

/** Quanti avvisi si vedono insieme: i più vecchi escono dalla vista ma restano nel registro. */
const MAX_VISIBLE = 4
/** Durata a schermo per tipo; null = resta finché non si chiude. */
const LIFETIME: Record<ToastKind, number | null> = { info: 3500, success: 3500, warning: 6000, error: null }

let nextId = 1

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, message, extra = {}) => {
    const id = nextId++
    const { source, ...shown } = extra
    logActivity(kind, message, { ...shown, source })
    set((state) => ({ toasts: [...state.toasts.slice(-(MAX_VISIBLE - 1)), { id, kind, message, ...shown }] }))
    const lifetime = LIFETIME[kind]
    if (lifetime !== null) setTimeout(() => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })), lifetime)
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
}))

/** Messaggio leggibile da un errore IPC ("Error invoking remote method 'x': Error: ..."). */
export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
}

export function notify(message: string, kind: ToastKind = 'info'): void {
  useToasts.getState().push(kind, message)
}

/** Errore a comparsa: resta finché non si chiude e finisce nel registro delle attività. */
export function notifyError(error: unknown, source?: string): void {
  console.error(error)
  useToasts.getState().push('error', errorMessage(error), { source })
}
