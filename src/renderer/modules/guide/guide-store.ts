// Stato del modulo Guide: il quadro del lavoro per «Cosa fare adesso» (raccolto senza importare gli altri moduli:
// stato condiviso del workbench, comandi eseguiti, stato dell'AI) e l'invito al primo percorso.
import { create } from 'zustand'
import type { AiStatus } from '@shared/contracts/ai'
import { nextHints, type AiReadiness, type Hint, type HintState } from '@shared/guide/hints'
import { useAi } from '../../services/ai-client'
import { onCommandExecuted, onCommandStarted } from '../../workbench/commands'
import { onAnyEvent } from '../../workbench/events'
import { useWorkbench, workbench } from '../../workbench/store'
import { updateSettings } from '../../workbench/workbench-commands'

interface GuideState {
  hints: Hint[]
  /** Invito al primo percorso visibile (solo al primo avvio, finché non si sceglie). */
  offerVisible: boolean
}

export const useGuide = create<GuideState>(() => ({ hints: [], offerVisible: false }))

/** Cosa si è già fatto in questa sessione (per non proporre ciò che l'utente ha appena fatto). */
const session = { ran: false, designed: false }

export function aiReadiness(status: AiStatus | null, enabled: boolean): AiReadiness {
  if (!enabled) return 'off'
  if (!status) return 'unknown'
  if (!status.available) return 'missing'
  return status.models.some((model) => model.capabilities.includes('completion')) ? 'ready' : 'no-models'
}

function collect(): HintState {
  const wb = workbench()
  return {
    hasProject: wb.project !== null,
    runMode: wb.project?.config.run.mode ?? null,
    errors: wb.problems.errors,
    dirty: wb.dirty.length,
    autoSave: wb.settings.autoSave,
    ran: session.ran,
    designed: session.designed,
    ai: aiReadiness(useAi.getState().status, wb.settings.ai.enabled),
    dismissed: wb.settings.guide.dismissedTips
  }
}

let timer: ReturnType<typeof setTimeout> | null = null

/** Rilegge il quadro fra poco (una raffica di comandi ed eventi diventa una lettura sola). */
export function requestRefresh(delay = 250): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    useGuide.setState({ hints: nextHints(collect()) })
  }, delay)
}

const RUN_COMMANDS = new Set(['run.project', 'run.preview', 'run.fileInTerminal', 'trace.run'])

export function installGuideRefresh(): void {
  // «Esegui» può durare finché il programma gira: conta appena parte.
  onCommandStarted((id) => {
    if (RUN_COMMANDS.has(id)) session.ran = true
    if (id === 'designer.open') session.designed = true
    if (RUN_COMMANDS.has(id) || id === 'designer.open') requestRefresh()
  })
  onCommandExecuted(() => requestRefresh())
  onAnyEvent((event) => {
    if (event === 'project:opened' || event === 'project:closed') {
      session.ran = false
      session.designed = false
    }
    if (event !== 'editor:cursor' && event !== 'preview:step') requestRefresh()
  })
  useAi.subscribe((state, previous) => {
    if (state.status !== previous.status) requestRefresh()
  })
  // Errori, file modificati, impostazioni (suggerimenti chiusi, salvataggio automatico) e progetto.
  useWorkbench.subscribe((state, previous) => {
    if (state.problems !== previous.problems || state.dirty !== previous.dirty || state.settings !== previous.settings || state.project !== previous.project) requestRefresh()
  })
  requestRefresh(600)
}

/** Chiude per sempre un suggerimento (o l'invito). */
export async function dismissTip(id: string): Promise<void> {
  const guide = workbench().settings.guide
  if (guide.dismissedTips.includes(id)) return
  await updateSettings({ guide: { ...guide, dismissedTips: [...guide.dismissedTips, id] } })
}

export async function markTourCompleted(id: string): Promise<void> {
  const guide = workbench().settings.guide
  if (guide.completed.includes(id)) return
  await updateSettings({ guide: { ...guide, completed: [...guide.completed, id] } })
}
