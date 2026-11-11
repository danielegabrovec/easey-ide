TypeScript è JavaScript **con i tipi**: dichiari che cosa contiene una variabile o un parametro e l'editor ti segnala gli errori prima ancora di eseguire.

```ts
function saluta(nome: string): string {
  return `Ciao ${nome}!`
}
```

Un **tipo unione** elenca i soli valori ammessi:

```ts
type Durata = 'mensile' | 'trimestrale' | 'annuale'
```

Con un oggetto `Record` associ a ogni valore un dato:

```ts
const mesi: Record<Durata, number> = { mensile: 1, trimestrale: 3, annuale: 12 }
```

> 💡 Se scrivi `prezzo('settimanale')` l'editor sottolinea subito l'errore in rosso: è il bello dei tipi.
