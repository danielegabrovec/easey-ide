// Avvisi a comparsa (toast).
import { create } from 'zustand'

export type ToastKind = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastState {
  toasts: Toast[]
  push: (kind: ToastKind, message: string) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, message) => {
    const id = nextId++
    set((state) => ({ toasts: [...state.toasts.slice(-3), { id, kind, message }] }))
    setTimeout(() => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 7000 : 3500)
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

export function notifyError(error: unknown): void {
  console.error(error)
  useToasts.getState().push('error', errorMessage(error))
}
