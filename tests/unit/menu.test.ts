// Menu dell'applicazione: solo scorciatoie che il menu nativo sa mostrare.
import { describe, expect, it } from 'vitest'
import { isMenuAccelerator, MENU_ROLES } from '../../src/shared/contracts/menu'

describe('menu', () => {
  it('accetta le scorciatoie semplici e scarta accordi e valori vuoti', () => {
    for (const ok of ['Ctrl+S', 'Ctrl+Shift+N', 'F5', 'Ctrl+F5', 'Ctrl+Shift+`', 'Ctrl+=', 'Ctrl+-', 'Ctrl+,', 'Alt+Shift+F', 'Ctrl+Alt+S']) expect(isMenuAccelerator(ok), ok).toBe(true)
    for (const ko of [undefined, '', 'Ctrl+K Ctrl+C', 'Ctrl+', 'Cmd+S', 'Ctrl+Shift+Invio']) expect(isMenuAccelerator(ko), String(ko)).toBe(false)
  })
  it('ruoli nativi ammessi: niente azioni pericolose fuori elenco', () => {
    expect(MENU_ROLES).toContain('quit')
    expect(MENU_ROLES).not.toContain('reload' as never)
  })
})
