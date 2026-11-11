---
titolo: Il prezzo dell'abbonamento
linguaggio: ts
livello: base
capitolo: TypeScript, cap. 3
file: abbonamento.ts
---

Il centro fitness costa **40 €** al mese. Gli abbonamenti più lunghi hanno uno sconto:

| Durata | Mesi | Sconto |
|---|---|---|
| mensile | 1 | 0% |
| trimestrale | 3 | 10% |
| annuale | 12 | 25% |

Nel file `abbonamento.ts` scrivi la funzione

```ts
prezzoAbbonamento(durata: Durata, studente: boolean): number
```

che restituisce il prezzo totale (mesi × 40, meno lo sconto). Gli **studenti** hanno 5 € in meno sul totale. Il risultato va **arrotondato a 2 decimali**.

## Suggerimenti

- Usa due oggetti `Record<Durata, number>`: uno per i mesi e uno per lo sconto (0, 0.1, 0.25).
- Il prezzo scontato è `mesi * 40 * (1 - sconto)`; poi togli 5 se `studente` è vero.
- Per arrotondare: `Math.round(prezzo * 100) / 100`.
