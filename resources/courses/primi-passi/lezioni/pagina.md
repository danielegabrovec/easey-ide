Una pagina web ha due anime: l'**HTML** dice *che cosa* c'è (titoli, paragrafi, elenchi), il **CSS** dice *come* appare.

```html
<h1 class="titolo">Spinning</h1>
<p>Lezione di 45 minuti con musica.</p>
```

Il CSS sta in un file separato collegato con `<link rel="stylesheet" href="style.css">`:

```css
.titolo {
  color: crimson;
}
```

> 💡 Un **selettore di classe** inizia con il punto (`.titolo`) e vale per tutti gli elementi con `class="titolo"`.

> 🔍 Per vedere il risultato premi **Esegui** (F5): l'anteprima si apre a destra e si aggiorna a ogni salvataggio.
