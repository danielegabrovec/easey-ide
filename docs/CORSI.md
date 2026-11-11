# Scrivere un corso per Easey IDE

Un corso è una **cartella** (si importa con *Lezioni → Importa un pacchetto*). Esempio completo:
[`resources/courses/primi-passi`](../resources/courses/primi-passi).

```
mio-corso/
  corso.json
  lezioni/
    funzioni.md
  esercizi/
    media/
      esercizio.md        consegna + suggerimenti
      starter/…           file di partenza
      soluzione/…         soluzione (sbloccabile)
      verifica.json       come si verifica
      setup.sql           solo per SQL: tabelle e dati
```

## corso.json

```json
{
  "id": "mio-corso",
  "titolo": "Il mio corso",
  "descrizione": "A che cosa serve.",
  "lezioni": [
    { "id": "funzioni", "titolo": "Le funzioni", "capitolo": "JavaScript, cap. 5", "testo": "lezioni/funzioni.md", "esercizi": ["media"] }
  ]
}
```

## esercizio.md

```markdown
---
titolo: Media dei voti
linguaggio: js            (js | ts | html | sql)
livello: base
capitolo: JavaScript, cap. 5
file: media.js            (file principale, aperto all'inizio)
---

Consegna in Markdown (anche tabelle e riquadri > 💡 > ⚠️).

## Suggerimenti

- Primo indizio (il più vago).
- Secondo indizio.
- Terzo indizio (quasi la soluzione).
```

## verifica.json

**JavaScript / TypeScript** — espressioni valutate dopo aver eseguito il file (le funzioni sono visibili
per nome, esportate o no) e testi attesi nella console:

```json
{ "tipo": "js", "test": [
  { "descrizione": "media di tre voti", "espressione": "media([6, 7, 8])", "atteso": 7 },
  { "descrizione": "stampa il risultato", "output": "Media: 7" }
] }
```

**HTML / CSS** — regole sulla pagina (il CSS collegato con `<link>` viene incluso):

```json
{ "tipo": "html", "regole": [
  { "descrizione": "un titolo", "selettore": "h1", "testo": "Yoga" },
  { "descrizione": "tre voci", "selettore": "ul > li", "minimo": 3 },
  { "descrizione": "link", "selettore": "a", "attributo": { "nome": "href", "valore": "orari.html" } },
  { "descrizione": "titolo verde", "selettore": "h1", "stile": { "color": "green" } }
] }
```

**SQL** — la query dello studente si confronta con quella in `soluzione/*.sql`, sui dati di `setup.sql`:

```json
{ "tipo": "sql", "ordine": true }
```

**Autovalutazione** (nessuna verifica automatica: «Ho finito» e revisione del tutor AI):

```json
{ "tipo": "autovalutazione" }
```

## Dai manuali della Collana
*Lezioni → Importa un manuale* accetta la cartella di un manuale (`README.md`, `NN - Titolo.md`):
ogni capitolo diventa una lezione, ogni riquadro `> 🧪` un esercizio ad autovalutazione. Il pacchetto
generato sta in `%APPDATA%/Easey IDE/courses/manuale-<nome>`: si può arricchire a mano con
`verifica.json` e `soluzione/` per renderlo verificabile.
