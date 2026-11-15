import { describe, expect, it } from 'vitest'
import { chooseCenterGroup, isSideGroup, newCenterPosition } from '@shared/layout-areas'

const sides = { left: 'esplora', right: 'anteprima', bottom: 'console' }

describe('pannelli del centro', () => {
  it('non scelgono mai una colonna laterale, nemmeno se è il gruppo attivo', () => {
    // Chiusa la scheda Benvenuto: restano solo i gruppi laterali e l'Esplora è attiva (ci si è appena cliccato).
    expect(chooseCenterGroup(['esplora', 'anteprima', 'console'], sides, 'benvenuto', 'esplora')).toBeNull()
    expect(chooseCenterGroup(['esplora', 'editor', 'console'], sides, undefined, 'esplora')).toBe('editor')
  })
  it('preferiscono il gruppo ricordato, poi quello attivo', () => {
    expect(chooseCenterGroup(['esplora', 'a', 'b'], sides, 'b', 'a')).toBe('b')
    expect(chooseCenterGroup(['esplora', 'a', 'b'], sides, 'sparito', 'a')).toBe('a')
    // Un gruppo laterale ricordato per sbaglio (editor trascinato nell'Esplora) non vale.
    expect(chooseCenterGroup(['esplora', 'a'], sides, 'esplora', 'esplora')).toBe('a')
  })
  it('quando manca, il centro nasce sopra la console, poi accanto all’anteprima o all’Esplora', () => {
    expect(newCenterPosition(sides)).toEqual({ referenceGroup: 'console', direction: 'above' })
    expect(newCenterPosition({ left: 'esplora', right: 'anteprima' })).toEqual({ referenceGroup: 'anteprima', direction: 'left' })
    expect(newCenterPosition({ left: 'esplora' })).toEqual({ referenceGroup: 'esplora', direction: 'right' })
    expect(newCenterPosition({})).toBeNull()
    expect(isSideGroup('console', sides)).toBe(true)
    expect(isSideGroup('editor', sides)).toBe(false)
  })
})
