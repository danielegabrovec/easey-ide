// Fornitore AI compatibile con l'API di OpenAI: LM Studio, llama.cpp server, vLLM, LocalAI, Jan…
// Stessa interfaccia di OllamaProvider: l'interfaccia utente non cambia.
//   GET  /v1/models                 → elenco modelli
//   POST /v1/chat/completions       → chat in streaming (Server-Sent Events, "data: {…}")
//   POST /v1/completions            → autocompletamento (prompt + suffix, se il server lo supporta)
import type { AiChatChunk, AiChatRequest, AiCompleteRequest, AiModel, AiProvider, AiStatus } from '@shared/contracts/ai'
import { cleanCompletion } from './ollama-provider'

/** Modelli "da codice": li si propone per l'autocompletamento. */
const CODE_MODEL = /coder|codegemma|starcoder|codellama|deepseek-coder|codestral|santacoder/i

export function openAiBase(endpoint: string): string {
  const clean = endpoint.trim().replace(/\/+$/, '')
  return /\/v\d+$/.test(clean) ? clean : `${clean}/v1`
}

export class OpenAiCompatibleProvider implements AiProvider {
  constructor(
    private readonly endpoint: () => string,
    private readonly apiKey: () => string
  ) {}

  private headers(): Record<string, string> {
    const key = this.apiKey().trim()
    return { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }
  }

  private url(path: string): string {
    return `${openAiBase(this.endpoint())}${path}`
  }

  async status(): Promise<AiStatus> {
    const endpoint = this.endpoint()
    try {
      const response = await fetch(this.url('/models'), { headers: this.headers(), signal: AbortSignal.timeout(3000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = (await response.json()) as { data?: { id: string; owned_by?: string }[] }
      const models: AiModel[] = (data.data ?? [])
        .filter((m) => !/embed/i.test(m.id))
        .map((m) => ({ name: m.id, size: '', family: m.owned_by ?? '', capabilities: CODE_MODEL.test(m.id) ? ['completion', 'insert'] : ['completion'], remote: false }))
      return { available: true, endpoint, version: 'OpenAI API', models }
    } catch (error) {
      return { available: false, endpoint, error: (error as Error).message, models: [] }
    }
  }

  async complete(request: AiCompleteRequest, signal: AbortSignal): Promise<string> {
    const body = {
      model: request.model,
      prompt: request.prefix,
      suffix: request.suffix,
      max_tokens: request.maxTokens ?? 80,
      temperature: 0.1,
      stream: false,
      stop: ['\n\n\n', '<|endoftext|>', '<|file_sep|>']
    }
    const response = await fetch(this.url('/completions'), { method: 'POST', headers: this.headers(), body: JSON.stringify(body), signal })
    if (!response.ok) throw new Error(`Server AI: HTTP ${response.status} ${await response.text().catch(() => '')}`)
    const data = (await response.json()) as { choices?: { text?: string }[] }
    return cleanCompletion(data.choices?.[0]?.text ?? '', request.suffix)
  }

  async chat(request: AiChatRequest, onChunk: (chunk: AiChatChunk) => void, signal: AbortSignal): Promise<void> {
    const body = { model: request.model, messages: request.messages, stream: true, temperature: request.temperature ?? 0.3 }
    const response = await fetch(this.url('/chat/completions'), { method: 'POST', headers: this.headers(), body: JSON.stringify(body), signal })
    if (!response.ok || !response.body) throw new Error(`Server AI: HTTP ${response.status} ${await response.text().catch(() => '')}`)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const handle = (line: string): boolean => {
      if (!line.startsWith('data:')) return false
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') return true
      const data = JSON.parse(payload) as { choices?: { delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null } }[]; error?: { message?: string } }
      if (data.error) throw new Error(data.error.message ?? 'errore del server AI')
      const delta = data.choices?.[0]?.delta
      const content = delta?.content ?? undefined
      const thinking = delta?.reasoning_content ?? delta?.reasoning ?? undefined
      if (content || thinking) onChunk({ requestId: request.requestId, content: content || undefined, thinking: thinking || undefined })
      return false
    }
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line && handle(line)) {
          await reader.cancel().catch(() => undefined)
          return
        }
        newline = buffer.indexOf('\n')
      }
    }
    if (buffer.trim()) handle(buffer.trim())
  }
}
