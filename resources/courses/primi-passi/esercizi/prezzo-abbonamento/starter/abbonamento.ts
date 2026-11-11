type Durata = 'mensile' | 'trimestrale' | 'annuale'

const PREZZO_MENSILE = 40

export function prezzoAbbonamento(durata: Durata, studente: boolean): number {
  // scrivi qui
  return 0
}

console.log('Annuale per studenti:', prezzoAbbonamento('annuale', true))
