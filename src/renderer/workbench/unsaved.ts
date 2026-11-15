// Lavoro non salvato (comportamento della shell, come in Easey DB). I moduli dichiarano con
// registerUnsavedWork ciò che andrebbe perso chiudendo la finestra o cambiando progetto: un fornitore può
// mettere al sicuro da sé il lavoro (es. un salvataggio rimandato di pochi decimi di secondo) e restituire
// solo ciò che resta in pericolo. La guardia di chiusura (close-guard.tsx) e il cambio di progetto
// chiamano collectUnsavedWork() prima di andare avanti.
import { useCallback, useEffect, useRef } from 'react'
import { notifyError } from './notifications'

/** Fornitore: descrizioni comprensibili di ciò che si perderebbe (vuoto = niente). Può salvare da sé. */
export type UnsavedProvider = () => string[] | Promise<string[]>

const providers = new Set<UnsavedProvider>()

export function registerUnsavedWork(provider: UnsavedProvider): () => void {
  providers.add(provider)
  return () => {
    providers.delete(provider)
  }
}

/** Tutto il lavoro che andrebbe perso adesso (un fornitore in errore non blocca gli altri). */
export async function collectUnsavedWork(): Promise<string[]> {
  const all: string[] = []
  for (const provider of [...providers]) {
    try {
      all.push(...(await provider()))
    } catch (error) {
      console.warn('Lavoro non salvato: fornitore in errore', error)
    }
  }
  return all
}

/**
 * Salvataggio rimandato (blocchi, nodi, diagrammi): `schedule(job)` salva dopo `delay` ms dall'ultima
 * modifica; il salvataggio in sospeso parte subito alla chiusura della finestra, al cambio di progetto e
 * alla chiusura del pannello. `label` è ciò che si dice all'utente se il salvataggio non riesce.
 */
export function useDeferredSave(label: string, delay: number): { schedule: (job: () => Promise<unknown>) => void; flush: () => Promise<boolean> } {
  const pending = useRef<(() => Promise<unknown>) | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const labelRef = useRef(label)
  labelRef.current = label

  // Niente await prima di avviare il lavoro: chi lo chiama mentre il pannello si chiude legge ancora il suo stato.
  const flush = useCallback((): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const job = pending.current
    pending.current = null
    if (!job) return Promise.resolve(true)
    return job().then(
      () => true,
      (error) => {
        notifyError(error)
        return false
      }
    )
  }, [])

  const schedule = useCallback(
    (job: () => Promise<unknown>) => {
      pending.current = job
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), delay)
    },
    [delay, flush]
  )

  useEffect(() => {
    const off = registerUnsavedWork(async () => (pending.current && !(await flush()) ? [labelRef.current] : []))
    return () => {
      off()
      void flush()
    }
  }, [flush])

  return { schedule, flush }
}
