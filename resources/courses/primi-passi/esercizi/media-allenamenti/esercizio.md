---
titolo: Media dei minuti di allenamento
linguaggio: js
livello: base
capitolo: JavaScript, cap. 5
file: allenamenti.js
---

Un cliente del centro fitness segna i minuti di ogni allenamento della settimana.

Completa nel file `allenamenti.js`:

1. la funzione `totaleMinuti(minuti)`, che restituisce la **somma** dei valori dell'array;
2. la funzione `mediaMinuti(minuti)`, che restituisce la **media**; se l'array è vuoto deve restituire `0`.

Poi stampa con `console.log` la media della settimana di prova `[30, 45, 60, 45]`.

Premi **Verifica** quando hai finito: controllerò le funzioni con diversi elenchi.

## Suggerimenti

- Parti da una variabile `let totale = 0` e aggiungi ogni valore con un ciclo `for (const m of minuti)`.
- La media è il totale diviso per il numero di elementi: `minuti.length`.
- Per l'array vuoto metti all'inizio di `mediaMinuti` un controllo: `if (minuti.length === 0) return 0`.
