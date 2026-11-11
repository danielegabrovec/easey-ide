Una **funzione** è un pezzo di codice con un nome: riceve dei valori (i *parametri*), fa un lavoro e restituisce un risultato con `return`.

```js
function doppio(n) {
  return n * 2
}

console.log(doppio(21)) // 42
```

Per lavorare su un elenco di valori si usa un **array** e lo si percorre con `for … of`:

```js
const minuti = [30, 45, 60]
let totale = 0
for (const m of minuti) {
  totale += m
}
```

> 💡 La proprietà `length` dice quanti elementi ha l'array: `minuti.length` vale 3.

> ⚠️ Attenzione alla divisione per zero: se l'array è vuoto, `totale / minuti.length` dà `NaN`. Controlla prima la lunghezza!
