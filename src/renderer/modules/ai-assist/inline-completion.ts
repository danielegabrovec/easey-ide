// Suggerimento AI in grigio nei file del progetto (Tab accetta): il motore è comune alla Scrittura rapida
// (services/inline-ai.ts), con la misura «intermedia» (qualche riga, a fine riga) e tutti i linguaggi dell'IDE.
import type * as monaco from 'monaco-editor'
import { registerInlineAi } from '../../services/inline-ai'
import { workbench } from '../../workbench/store'

let busy = 0
function setBusy(delta: number, model: string): void {
  busy = Math.max(0, busy + delta)
  const store = workbench()
  const current = store.statusItems.find((i) => i.id === 'ai')
  if (!current) return
  store.setStatusItem({ ...current, tone: busy > 0 ? 'busy' : 'normal', text: busy > 0 ? `✦ ${model}…` : `✦ ${model}` })
}

export function registerInlineCompletion(): monaco.IDisposable {
  return registerInlineAi({
    id: 'fim',
    accepts: (model) => model.uri.scheme === 'file' && workbench().settings.ai.inlineCompletion,
    level: () => 'medium',
    onBusy: setBusy
  })
}
