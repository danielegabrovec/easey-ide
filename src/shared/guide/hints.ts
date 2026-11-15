// «Prossimo passo»: dallo stato del lavoro (progetto, errori, file non salvati, esecuzioni, AI) fino a 3
// suggerimenti, ognuno con il comando che lo fa. Logica pura (stessa forma di Easey DB): il renderer raccoglie
// lo stato e traduce i testi (`guide.hint.<kind>`). Lo mostra la scheda «Cosa fare adesso» del Benvenuto.

export type AiReadiness = 'off' | 'missing' | 'no-models' | 'ready' | 'unknown'

export interface HintState {
  hasProject: boolean
  /** Modalità di esecuzione del progetto (null = nessun progetto). */
  runMode: 'web' | 'terminal' | null
  errors: number
  /** File modificati e non salvati. */
  dirty: number
  autoSave: boolean
  /** In questa sessione il progetto è già stato eseguito (Esegui, Anteprima, terminale). */
  ran: boolean
  /** Il designer è già stato aperto in questa sessione. */
  designed: boolean
  ai: AiReadiness
  /** Suggerimenti chiusi con ✕ (id, vedi Hint.id). */
  dismissed?: readonly string[]
}

export type HintKind = 'errors' | 'unsaved' | 'run' | 'designer' | 'no-project' | 'quick' | 'courses' | 'ai-missing' | 'ai-model'

export interface Hint {
  /** Stabile per lo stesso suggerimento: serve a chiuderlo per sempre. */
  id: string
  kind: HintKind
  params: Record<string, string | number>
  command: string
  args?: unknown
  /** Più alto = più importante. */
  priority: number
}

/** Fino a `limit` suggerimenti, dal più importante. */
export function nextHints(state: HintState, limit = 3): Hint[] {
  const hints: Hint[] = []
  const dismissed = new Set(state.dismissed ?? [])
  const add = (hint: Hint) => {
    if (!dismissed.has(hint.id)) hints.push(hint)
  }
  if (!state.hasProject) {
    add({ id: 'no-project', kind: 'no-project', params: {}, command: 'workspace.newProject', priority: 60 })
    add({ id: 'quick', kind: 'quick', params: {}, command: 'quick.open', priority: 50 })
    add({ id: 'courses', kind: 'courses', params: {}, command: 'learn.show', priority: 40 })
  } else {
    if (state.errors > 0) add({ id: 'errors', kind: 'errors', params: { n: state.errors }, command: 'editor.showProblems', priority: 100 })
    if (state.dirty > 0 && !state.autoSave) add({ id: 'unsaved', kind: 'unsaved', params: { n: state.dirty }, command: 'editor.saveAll', priority: 95 })
    if (!state.ran && state.errors === 0) add({ id: 'run', kind: 'run', params: {}, command: 'run.project', priority: 70 })
    if (state.runMode === 'web' && !state.designed) add({ id: 'designer', kind: 'designer', params: {}, command: 'designer.open', priority: 50 })
  }
  if (state.ai === 'missing') add({ id: 'ai-missing', kind: 'ai-missing', params: {}, command: 'ai.chat', priority: 20 })
  else if (state.ai === 'no-models') add({ id: 'ai-model', kind: 'ai-model', params: {}, command: 'ai.chat', priority: 20 })
  return hints.sort((a, b) => b.priority - a.priority).slice(0, limit)
}
