// Servizio AI: instrada le richieste al fornitore, gestisce annullamenti e flussi di risposta.
import type { AiChatChunk, AiChatRequest, AiCompleteRequest, AiProvider, AiStatus } from '@shared/contracts/ai'

export class AiService {
  private readonly controllers = new Map<string, AbortController>()

  constructor(
    /** Il fornitore si sceglie a ogni richiesta (cambia dalle impostazioni senza riavvio). */
    private readonly providerOf: () => AiProvider,
    private readonly emitChunk: (chunk: AiChatChunk) => void
  ) {}

  status(): Promise<AiStatus> {
    return this.providerOf().status()
  }

  async complete(request: AiCompleteRequest): Promise<string> {
    const controller = this.track(request.requestId)
    try {
      return await this.providerOf().complete(request, controller.signal)
    } catch (error) {
      if (controller.signal.aborted) return ''
      throw error
    } finally {
      this.controllers.delete(request.requestId)
    }
  }

  /** Avvia la chat e ritorna subito: i pezzi di risposta arrivano come eventi `ai:chunk`. */
  chat(request: AiChatRequest): void {
    const controller = this.track(request.requestId)
    void this.providerOf()
      .chat(request, this.emitChunk, controller.signal)
      .then(() => this.emitChunk({ requestId: request.requestId, done: true }))
      .catch((error: Error) => {
        if (controller.signal.aborted) this.emitChunk({ requestId: request.requestId, done: true })
        else this.emitChunk({ requestId: request.requestId, done: true, error: error.message })
      })
      .finally(() => this.controllers.delete(request.requestId))
  }

  cancel(requestId: string): void {
    this.controllers.get(requestId)?.abort()
    this.controllers.delete(requestId)
  }

  private track(requestId: string): AbortController {
    this.cancel(requestId)
    const controller = new AbortController()
    this.controllers.set(requestId, controller)
    return controller
  }
}
