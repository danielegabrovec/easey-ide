// Client AI condiviso dal renderer: lo usano l'assistente, il SQL Lab, la didattica…
// (è un servizio, non un modulo: niente interfaccia qui).
import { create } from 'zustand'
import { pickChatModel, pickCompletionModel, type AiChatMessage, type AiChatChunk, type AiStatus } from '@shared/contracts/ai'
import { ide } from '../ipc'
import { workbench } from '../workbench/store'

let counter = 0
let refreshSeq = 0
export const newRequestId = (kind: string) => `${kind}-${Date.now().toString(36)}-${++counter}`

interface AiState {
  status: AiStatus | null
  checking: boolean
  refresh: () => Promise<AiStatus>
}

export const useAi = create<AiState>((set) => ({
  status: null,
  checking: false,
  refresh: async () => {
    // Vale solo la risposta più recente: una richiesta lenta partita prima (es. verso il server
    // precedente) non deve sovrascrivere lo stato del server appena scelto.
    const mine = ++refreshSeq
    set({ checking: true })
    const status = await ide.invoke('ai:status').catch(
      (error: Error): AiStatus => ({ available: false, endpoint: workbench().settings.ai.endpoint, error: error.message, models: [] })
    )
    if (mine !== refreshSeq) return status
    set({ status, checking: false })
    return status
  }
}))

/** Modelli effettivi (scelta dell'utente o automatica) per chat e autocompletamento. */
export function activeModels(): { chat: string | null; completion: string | null } {
  const status = useAi.getState().status
  const ai = workbench().settings.ai
  if (!status?.available || !ai.enabled) return { chat: null, completion: null }
  return { chat: pickChatModel(status.models, ai.chatModel), completion: pickCompletionModel(status.models, ai.completionModel) }
}

const chunkListeners = new Map<string, (chunk: AiChatChunk) => void>()
let subscribed = false

function ensureSubscribed(): void {
  if (subscribed) return
  subscribed = true
  ide.on('ai:chunk', (chunk) => chunkListeners.get(chunk.requestId)?.(chunk))
}

export interface ChatStream {
  requestId: string
  /** Testo completo della risposta quando finisce. */
  done: Promise<string>
  cancel: () => void
}

/** Avvia una chat in streaming. `onChunk` riceve i pezzi di testo man mano che arrivano. */
export function streamChat(
  messages: AiChatMessage[],
  onChunk: (chunk: { content?: string; thinking?: string }) => void,
  model?: string
): ChatStream {
  ensureSubscribed()
  const requestId = newRequestId('chat')
  const chosen = model ?? activeModels().chat
  let text = ''
  const done = new Promise<string>((resolve, reject) => {
    if (!chosen) {
      reject(new Error('Nessun modello AI disponibile: controlla che Ollama sia avviato.'))
      return
    }
    chunkListeners.set(requestId, (chunk) => {
      if (chunk.content) text += chunk.content
      if (chunk.content || chunk.thinking) onChunk({ content: chunk.content, thinking: chunk.thinking })
      if (chunk.done) {
        chunkListeners.delete(requestId)
        if (chunk.error) reject(new Error(chunk.error))
        else resolve(text)
      }
    })
    void ide.invoke('ai:chat', { requestId, model: chosen, messages, temperature: workbench().settings.ai.temperature }).catch((error: Error) => {
      chunkListeners.delete(requestId)
      reject(error)
    })
  })
  return { requestId, done, cancel: () => void ide.invoke('ai:cancel', requestId) }
}

/** Primo blocco di codice ```…``` di una risposta (o il testo intero se non ce ne sono). */
export function extractCode(answer: string): string {
  const match = /```[\w+-]*\s*\n([\s\S]*?)```/.exec(answer)
  return (match ? match[1]! : answer).replace(/\s+$/, '')
}
