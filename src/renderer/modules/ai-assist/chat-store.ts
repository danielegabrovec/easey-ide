// Conversazione con l'assistente: messaggi, risposta in corso, destinazione "Applica".
import { create } from 'zustand'
import type { AiChatMessage } from '@shared/contracts/ai'
import type { EditorRange } from '@shared/contracts/editor'
import { streamChat, type ChatStream } from '../../services/ai-client'
import { workbench } from '../../workbench/store'
import { t } from '../../i18n'

/** Dove applicare il codice proposto (selezione o file intero da cui è partita la richiesta). */
export interface ApplyTarget {
  path: string
  range: EditorRange
  original: string
  language: string
}

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  /** Testo mostrato (per le azioni rapide è un riassunto, non il prompt completo). */
  display: string
  /** Testo inviato al modello. */
  content: string
  thinking?: string
  error?: string
  pending?: boolean
  apply?: ApplyTarget
}

interface ChatState {
  messages: ChatMessage[]
  stream: ChatStream | null
  send: (content: string, options?: { display?: string; apply?: ApplyTarget }) => Promise<void>
  stop: () => void
  reset: () => void
}

let nextId = 1

export function systemPrompt(): string {
  const ai = workbench().settings.ai
  return ai.tutorMode ? `${t('ai.systemPrompt')}\n\n${t('ai.tutorPrompt')}` : t('ai.systemPrompt')
}

export const useChat = create<ChatState>((set, get) => ({
  messages: [],
  stream: null,
  send: async (content, options) => {
    if (get().stream) get().stop()
    const user: ChatMessage = { id: nextId++, role: 'user', display: options?.display ?? content, content }
    const assistant: ChatMessage = { id: nextId++, role: 'assistant', display: '', content: '', pending: true, apply: options?.apply }
    const history: AiChatMessage[] = [
      { role: 'system', content: systemPrompt() },
      ...get()
        .messages.filter((m) => !m.error && !m.pending)
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content }
    ]
    set((state) => ({ messages: [...state.messages, user, assistant] }))
    const update = (patch: Partial<ChatMessage>) => set((state) => ({ messages: state.messages.map((m) => (m.id === assistant.id ? { ...m, ...patch } : m)) }))
    let text = ''
    let thinking = ''
    const stream = streamChat(history, (chunk) => {
      if (chunk.content) text += chunk.content
      if (chunk.thinking) thinking += chunk.thinking
      update({ display: text, content: text, thinking: thinking || undefined })
    })
    set({ stream })
    try {
      await stream.done
      update({ pending: false })
    } catch (error) {
      update({ pending: false, error: (error as Error).message })
    } finally {
      if (get().stream === stream) set({ stream: null })
    }
  },
  stop: () => {
    get().stream?.cancel()
    set((state) => ({ stream: null, messages: state.messages.map((m) => (m.pending ? { ...m, pending: false } : m)) }))
  },
  reset: () => {
    get().stream?.cancel()
    set({ messages: [], stream: null })
  }
}))
