// Contratto dell'assistente AI. Fornitori: Ollama (predefinito) e qualunque server compatibile con
// l'API di OpenAI (LM Studio, llama.cpp, vLLM…): stessa interfaccia, l'interfaccia utente non cambia.

export type AiProviderKind = 'ollama' | 'openai'

/** Indirizzo predefinito per ogni fornitore (LM Studio ascolta sulla 1234). */
export const DEFAULT_ENDPOINTS: Record<AiProviderKind, string> = { ollama: 'http://127.0.0.1:11434', openai: 'http://127.0.0.1:1234/v1' }

export interface AiModel {
  name: string
  /** Es. "14.8B". */
  size: string
  family: string
  /** Capacità dichiarate da Ollama: completion, insert (fill-in-the-middle), tools, thinking, vision, embedding. */
  capabilities: string[]
  /** Modello che gira su server remoti (es. "…:cloud"): mai scelto in automatico. */
  remote: boolean
}

export interface AiStatus {
  available: boolean
  endpoint: string
  version?: string
  error?: string
  models: AiModel[]
}

export interface AiCompleteRequest {
  requestId: string
  model: string
  prefix: string
  suffix: string
  language: string
  maxTokens?: number
}

export type AiRole = 'system' | 'user' | 'assistant'

export interface AiChatMessage {
  role: AiRole
  content: string
}

export interface AiChatRequest {
  requestId: string
  model: string
  messages: AiChatMessage[]
  temperature?: number
}

export interface AiChatChunk {
  requestId: string
  content?: string
  thinking?: string
  done?: boolean
  error?: string
}

export interface AiSettings {
  enabled: boolean
  provider: AiProviderKind
  endpoint: string
  /** Solo per i server compatibili OpenAI che la richiedono (salvata nelle impostazioni locali). */
  apiKey: string
  /** '' = scelta automatica. */
  completionModel: string
  chatModel: string
  inlineCompletion: boolean
  temperature: number
  /** In modalità tutor l'AI guida con indizi e domande invece di dare la soluzione. */
  tutorMode: boolean
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: true,
  provider: 'ollama',
  endpoint: 'http://127.0.0.1:11434',
  apiKey: '',
  completionModel: '',
  chatModel: '',
  inlineCompletion: true,
  temperature: 0.3,
  tutorMode: false
}

/** Interfaccia di un fornitore di modelli (lato main). */
export interface AiProvider {
  status(): Promise<AiStatus>
  complete(request: AiCompleteRequest, signal: AbortSignal): Promise<string>
  chat(request: AiChatRequest, onChunk: (chunk: AiChatChunk) => void, signal: AbortSignal): Promise<void>
}

const CHAT_PREFERENCE = ['gemma4:latest', 'gemma4', 'gpt-oss', 'qwen3.8', 'qwen3', 'llama3', 'mistral', 'qwen2.5-coder']

/** Modello per l'autocompletamento: il più piccolo con fill-in-the-middle ("insert"), solo locale. */
export function pickCompletionModel(models: AiModel[], preferred: string): string | null {
  if (preferred && models.some((m) => m.name === preferred)) return preferred
  const candidates = models.filter((m) => !m.remote && m.capabilities.includes('insert'))
  if (candidates.length === 0) return null
  return candidates.sort((a, b) => parseSize(a.size) - parseSize(b.size))[0]!.name
}

/** Modello per la chat: preferenze note, poi il primo modello di testo locale. */
export function pickChatModel(models: AiModel[], preferred: string): string | null {
  if (preferred && models.some((m) => m.name === preferred)) return preferred
  const local = models.filter((m) => !m.remote && m.capabilities.includes('completion') && !m.capabilities.includes('embedding'))
  // Confronto senza punteggiatura: "gemma4:latest" (Ollama) e "gemma-4-e4b" (LM Studio) sono la stessa famiglia.
  const plain = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const wanted of CHAT_PREFERENCE) {
    const found = local.find((m) => m.name === wanted || m.name.startsWith(`${wanted}:`) || plain(m.name).startsWith(plain(wanted)))
    if (found) return found.name
  }
  return local[0]?.name ?? null
}

export function parseSize(size: string): number {
  const match = /([\d.]+)\s*([MB])/i.exec(size)
  if (!match) return Number.POSITIVE_INFINITY
  return Number(match[1]) * (match[2]!.toUpperCase() === 'B' ? 1000 : 1)
}
