// Chiusura della finestra senza perdere il lavoro: prima di chiudere si chiede al renderer di salvare
// (salvataggi automatici in sospeso, bozza della Scrittura rapida, file non salvati).
// Logica pura, senza Electron, per poterla collaudare: il main la collega all'evento `close`.
import type { CloseDecision } from '@shared/contracts/ipc'

/** Oltre questo tempo senza risposta il renderer è considerato bloccato e la finestra si chiude comunque. */
export const CLOSE_REPLY_TIMEOUT = 5000

export class CloseGuard {
  private approved = false
  private askedAt = 0
  private waiting = false

  constructor(private readonly now: () => number = Date.now) {}

  /**
   * Chiamata all'evento `close` della finestra. `true` = lasciala chiudere;
   * `false` = chiusura trattenuta, e si deve inviare la richiesta al renderer (`ask` diventa vero).
   */
  onClose(rendererGone: boolean): { allow: boolean; ask: boolean } {
    if (this.approved || rendererGone) return { allow: true, ask: false }
    // Il renderer non ha risposto (né «aspetta» per un dialogo aperto): non si tiene la finestra in ostaggio.
    if (this.askedAt && !this.waiting && this.now() - this.askedAt > CLOSE_REPLY_TIMEOUT) return { allow: true, ask: false }
    // Dialogo già aperto nel renderer: un secondo clic sulla X non ne apre un altro.
    if (this.waiting) return { allow: false, ask: false }
    // Il tempo si conta dalla prima richiesta: clic ripetuti sulla X non lo fanno ripartire.
    if (!this.askedAt) this.askedAt = this.now()
    return { allow: false, ask: true }
  }

  /** Risposta del renderer. Restituisce true se la finestra va chiusa ora. */
  reply(decision: CloseDecision): boolean {
    if (decision === 'close') {
      this.approved = true
      return true
    }
    if (decision === 'wait') {
      this.waiting = true
      return false
    }
    this.askedAt = 0
    this.waiting = false
    return false
  }
}
