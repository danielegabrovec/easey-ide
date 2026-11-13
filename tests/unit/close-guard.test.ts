// Chiusura della finestra: il main trattiene la chiusura finché il renderer non ha salvato.
import { describe, expect, it } from 'vitest'
import { CLOSE_REPLY_TIMEOUT, CloseGuard } from '../../src/main/close-guard'

function guardAt(start = 1000) {
  let now = start
  const guard = new CloseGuard(() => now)
  return { guard, advance: (ms: number) => (now += ms) }
}

describe('CloseGuard', () => {
  it('trattiene la prima chiusura e chiede al renderer; dopo «close» lascia chiudere', () => {
    const { guard } = guardAt()
    expect(guard.onClose(false)).toEqual({ allow: false, ask: true })
    expect(guard.reply('close')).toBe(true)
    expect(guard.onClose(false)).toEqual({ allow: true, ask: false })
  })

  it('con un dialogo aperto («wait») un secondo clic sulla X non richiede di nuovo e non chiude', () => {
    const { guard, advance } = guardAt()
    guard.onClose(false)
    expect(guard.reply('wait')).toBe(false)
    advance(CLOSE_REPLY_TIMEOUT * 3)
    expect(guard.onClose(false)).toEqual({ allow: false, ask: false })
  })

  it('«cancel» annulla: la chiusura successiva chiede di nuovo', () => {
    const { guard } = guardAt()
    guard.onClose(false)
    guard.reply('wait')
    expect(guard.reply('cancel')).toBe(false)
    expect(guard.onClose(false)).toEqual({ allow: false, ask: true })
  })

  it('renderer muto oltre il tempo massimo o terminato: la finestra si chiude comunque', () => {
    const { guard, advance } = guardAt()
    guard.onClose(false)
    advance(CLOSE_REPLY_TIMEOUT - 1)
    expect(guard.onClose(false)).toEqual({ allow: false, ask: true })
    // Il clic ripetuto non fa ripartire il tempo.
    advance(2)
    expect(guard.onClose(false).allow).toBe(true)
    expect(new CloseGuard().onClose(true)).toEqual({ allow: true, ask: false })
  })
})
