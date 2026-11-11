// Minuti di allenamento di un cliente: somma e media.

function totaleMinuti(minuti) {
  let totale = 0
  for (const m of minuti) {
    totale += m
  }
  return totale
}

function mediaMinuti(minuti) {
  if (minuti.length === 0) return 0
  return totaleMinuti(minuti) / minuti.length
}

console.log('Media della settimana:', mediaMinuti([30, 45, 60, 45]))
