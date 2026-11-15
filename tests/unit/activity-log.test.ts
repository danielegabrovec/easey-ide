import { describe, expect, it } from 'vitest'
import { ACTIVITY_LIMIT, activityEntryText, activityText, appendBounded, formatActivityTime, type ActivityEntry } from '@shared/activity-log'

const entry = (id: number, extra: Partial<ActivityEntry> = {}): ActivityEntry => ({ id, at: new Date(2026, 10, 14, 9, 5, id % 60).getTime(), kind: 'info', message: `voce ${id}`, ...extra })

describe('registro delle attività', () => {
  it('appendBounded aggiunge in coda senza toccare l’elenco ricevuto', () => {
    const list = [1, 2]
    const next = appendBounded(list, 3, 5)
    expect(next).toEqual([1, 2, 3])
    expect(list).toEqual([1, 2])
  })
  it('tiene al massimo il limite: escono le più vecchie', () => {
    let list: number[] = []
    for (let i = 1; i <= 7; i++) list = appendBounded(list, i, 3)
    expect(list).toEqual([5, 6, 7])
    expect(appendBounded([1], 2, 0)).toEqual([])
  })
  it('il limite predefinito è 200', () => {
    let list: ActivityEntry[] = []
    for (let i = 1; i <= 250; i++) list = appendBounded(list, entry(i))
    expect(ACTIVITY_LIMIT).toBe(200)
    expect(list).toHaveLength(200)
    expect(list[0]!.id).toBe(51)
    expect(list.at(-1)!.id).toBe(250)
  })
  it('ora locale leggibile', () => {
    expect(formatActivityTime(new Date(2026, 0, 2, 3, 4, 5).getTime())).toBe('2026-01-02 03:04:05')
  })
  it('testo da copiare: ora, tipo, fonte, titolo, messaggio, dettagli', () => {
    const text = activityEntryText(entry(7, { kind: 'error', title: 'La tabella "clientii" non esiste', message: 'no such table: clientii', details: '1. Forse intendevi "clienti"?', source: 'SQL' }))
    expect(text.split('\n')).toEqual(['[2026-11-14 09:05:07] ERRORE · SQL', 'La tabella "clientii" non esiste', 'no such table: clientii', '1. Forse intendevi "clienti"?'])
  })
  it('tutto il registro dalla più recente', () => {
    const text = activityText([entry(1), entry(2)])
    expect(text.indexOf('voce 2')).toBeLessThan(text.indexOf('voce 1'))
  })
})
