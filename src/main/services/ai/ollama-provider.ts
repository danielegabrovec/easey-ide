// Fornitore Ollama: parla con l'API HTTP locale (/api/tags, /api/generate, /api/chat).
// Le chiamate partono dal main: niente CORS né OLLAMA_ORIGINS, e la CSP del renderer resta chiusa.
import type { AiChatChunk, AiChatRequest, AiCompleteRequest, AiModel, AiProvider, AiStatus } from '@shared/contracts/ai'
import { cleanContext, ollamaGenerateBody, postProcess, type ModelInfo } from '@shared/ai/inline'

interface TagsResponse {
  models?: { name: string; details?: { parameter_size?: string; family?: string }; capabilities?: string[]; remote_host?: string }[]
}

const KEEP_ALIVE = '15m'

export function isRemoteModel(name: string, remoteHost?: string): boolean {
  return !!remoteHost || /(^|[:-])cloud$/i.test(name)
}

export class OllamaProvider implements AiProvider {
  private capabilities = new Map<string, string[]>()
  private families = new Map<string, string>()

  constructor(private readonly endpoint: () => string) {}

  private url(path: string): string {
    return `${this.endpoint().replace(/\/+$/, '')}${path}`
  }

  async status(): Promise<AiStatus> {
    const endpoint = this.endpoint()
    try {
      const signal = AbortSignal.timeout(3000)
      const [tagsResponse, versionResponse] = await Promise.all([fetch(this.url('/api/tags'), { signal }), fetch(this.url('/api/version'), { signal }).catch(() => null)])
      if (!tagsResponse.ok) throw new Error(`HTTP ${tagsResponse.status}`)
      const tags = (await tagsResponse.json()) as TagsResponse
      const version = versionResponse?.ok ? ((await versionResponse.json()) as { version?: string }).version : undefined
      const models: AiModel[] = (tags.models ?? []).map((m) => ({
        name: m.name,
        size: m.details?.parameter_size ?? '',
        family: m.details?.family ?? '',
        capabilities: m.capabilities ?? ['completion'],
        remote: isRemoteModel(m.name, m.remote_host)
      }))
      this.capabilities = new Map(models.map((m) => [m.name, m.capabilities]))
      this.families = new Map(models.map((m) => [m.name, m.family]))
      return { available: true, endpoint, version, models }
    } catch (error) {
      return { available: false, endpoint, error: (error as Error).message, models: [] }
    }
  }

  /**
   * Suggerimento in grigio: riempimento al centro col formato del modello (token FIM dei modelli da codice,
   * `suffix` di Ollama per gli altri che lo sanno fare), poi la pulizia comune (@shared/ai/inline).
   */
  async complete(request: AiCompleteRequest, signal: AbortSignal): Promise<string> {
    const info: ModelInfo = { family: this.families.get(request.model), capabilities: this.capabilities.get(request.model) ?? ['completion', 'insert'] }
    const body = { ...ollamaGenerateBody(request.model, info, request), keep_alive: KEEP_ALIVE }
    const response = await fetch(this.url('/api/generate'), { method: 'POST', body: JSON.stringify(body), signal })
    if (!response.ok) throw new Error(`Ollama: HTTP ${response.status} ${await response.text().catch(() => '')}`)
    const data = (await response.json()) as { response?: string }
    return postProcess(data.response ?? '', cleanContext(request.prefix, request.suffix, request.blankStops ?? true))
  }

  async chat(request: AiChatRequest, onChunk: (chunk: AiChatChunk) => void, signal: AbortSignal): Promise<void> {
    const capabilities = this.capabilities.get(request.model) ?? []
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
      stream: true,
      keep_alive: KEEP_ALIVE,
      options: { temperature: request.temperature ?? 0.3 }
    }
    // Modelli "pensanti": ragionamento breve (gpt-oss accetta solo livelli, gli altri on/off).
    if (capabilities.includes('thinking')) body['think'] = /gpt-oss/i.test(request.model) ? 'low' : false
    const response = await fetch(this.url('/api/chat'), { method: 'POST', body: JSON.stringify(body), signal })
    if (!response.ok || !response.body) throw new Error(`Ollama: HTTP ${response.status} ${await response.text().catch(() => '')}`)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line) this.emitLine(line, request.requestId, onChunk)
        newline = buffer.indexOf('\n')
      }
    }
    if (buffer.trim()) this.emitLine(buffer.trim(), request.requestId, onChunk)
  }

  private emitLine(line: string, requestId: string, onChunk: (chunk: AiChatChunk) => void): void {
    const data = JSON.parse(line) as { message?: { content?: string; thinking?: string }; done?: boolean; error?: string }
    if (data.error) throw new Error(data.error)
    const content = data.message?.content
    const thinking = data.message?.thinking
    if (content || thinking) onChunk({ requestId, content: content || undefined, thinking: thinking || undefined })
  }
}
