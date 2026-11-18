import { describe, expect, it } from 'vitest'
import { friendlyPath, relativeWhen } from '../../src/shared/start-kit/when'

// Mercoledì 18 novembre 2026, 10:30.
const now = new Date(2026, 10, 18, 10, 30).getTime()
const at = (y: number, m: number, d: number, h = 9, min = 5) => new Date(y, m - 1, d, h, min).getTime()

describe('quando, in parole', () => {
  it('oggi e ieri con l’ora', () => {
    expect(relativeWhen(at(2026, 11, 18, 9, 5), now)).toBe('oggi, 9:05')
    expect(relativeWhen(at(2026, 11, 17, 18, 40), now)).toBe('ieri, 18:40')
    expect(relativeWhen(at(2026, 11, 17, 18, 40), now, 'en')).toBe('yesterday, 18:40')
  })
  it('nella settimana il giorno, poi la data', () => {
    expect(relativeWhen(at(2026, 11, 16), now)).toBe('lunedì')
    expect(relativeWhen(at(2026, 11, 12), now)).toBe('giovedì')
    expect(relativeWhen(at(2026, 11, 11), now)).toBe('11 novembre')
    expect(relativeWhen(at(2025, 12, 3), now)).toBe('3 dicembre 2025')
    expect(relativeWhen(at(2026, 11, 2), now, 'en')).toBe('November 2')
  })
  it('un orologio avanti non dà date nel futuro strane', () => {
    expect(relativeWhen(at(2026, 11, 19, 8, 0), now)).toBe('oggi, 8:00')
  })
  it('cartella utente abbreviata', () => {
    expect(friendlyPath('C:\\Users\\ada\\Documents\\Sito', 'C:\\Users\\ada')).toBe('~\\Documents\\Sito')
    expect(friendlyPath('D:\\Lavoro\\Sito', 'C:\\Users\\ada')).toBe('D:\\Lavoro\\Sito')
  })
})
