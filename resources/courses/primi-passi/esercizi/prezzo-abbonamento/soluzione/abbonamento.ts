type Durata = 'mensile' | 'trimestrale' | 'annuale'

const PREZZO_MENSILE = 40
const MESI: Record<Durata, number> = { mensile: 1, trimestrale: 3, annuale: 12 }
const SCONTO: Record<Durata, number> = { mensile: 0, trimestrale: 0.1, annuale: 0.25 }

export function prezzoAbbonamento(durata: Durata, studente: boolean): number {
  let prezzo = MESI[durata] * PREZZO_MENSILE * (1 - SCONTO[durata])
  if (studente) prezzo -= 5
  return Math.round(prezzo * 100) / 100
}

console.log('Annuale per studenti:', prezzoAbbonamento('annuale', true))
