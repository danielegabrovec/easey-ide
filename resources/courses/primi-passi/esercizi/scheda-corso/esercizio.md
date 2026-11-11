---
titolo: La scheda di un corso
linguaggio: html
livello: base
capitolo: HTML cap. 3 · CSS cap. 2
file: index.html
---

Crea la scheda del corso di **Yoga** del centro fitness.

In `index.html`:

1. un titolo `<h1>` con la parola **Yoga**;
2. almeno **due** sezioni con un titolo `<h2>` (per esempio «Descrizione» e «Cosa portare»);
3. un elenco puntato `<ul>` con almeno **tre** voci `<li>`;
4. un link `<a>` che porta a `orari.html`.

In `style.css` (è già collegato):

5. dai al `<h1>` la classe `titolo` e colorala di **verde** (`green`);
6. fai in modo che le voci dell'elenco siano in **grassetto** (`font-weight: bold`).

## Suggerimenti

- Il link si scrive `<a href="orari.html">Orari</a>`.
- La classe si aggiunge così: `<h1 class="titolo">Yoga</h1>`; nel CSS il selettore è `.titolo`.
- Per il grassetto delle voci basta la regola `li { font-weight: bold; }`.
