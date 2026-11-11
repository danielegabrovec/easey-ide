# ADR 0005 — Didattica: pacchetti-corso e verifica automatica

**Stato:** accettata (2026-11-11)

## Contesto
Gli esercizi devono potersi verificare da soli (JS, TS, HTML/CSS, SQL), dare suggerimenti graduati,
una soluzione sbloccabile e salvare i progressi. Devono anche nascere dai manuali della Collana
"Imparare a programmare" (cartelle di capitoli `NN - Titolo.md` con gli esercizi nei riquadri `> 🧪`).

## Decisione
1. **Formato su disco** (cartella, versionabile con git) — vedi [CORSI.md](../CORSI.md):
   `corso.json` + `lezioni/*.md` + `esercizi/<id>/{esercizio.md, starter/, soluzione/, verifica.json, setup.sql}`.
   Il corso incluso sta in `resources/courses/` (dentro `app.asar`, sola lettura); quelli importati
   in `userData/courses/`; i progressi in `userData/learn-progress.json`.
2. **Cartella di lavoro per esercizio** (`Documenti/Easey IDE/Corsi/<corso>/<esercizio>`), aperta
   come progetto normale: lo studente usa editor, anteprima, terminale e SQL Lab di sempre.
3. **Verifica**
   - JS/TS (main): esbuild `bundle` in `cjs` con `treeShaking: false` (le funzioni di primo livello
     restano visibili per nome), eseguito in `node:vm` con console catturata, `require` bloccato e
     tempo massimo di 3 s (ciclo infinito → messaggio chiaro). `vm` **non** è una sandbox di
     sicurezza: è il codice dello studente, come nel terminale.
   - SQL (main): SQLite in memoria = `setup.sql` + query dello studente, confrontata con la query
     della soluzione (colonne, righe, ordine facoltativo).
   - HTML/CSS (renderer): documento statico (script e `on*` tolti, CSS esterni incorporati) in un
     iframe nascosto `sandbox="allow-same-origin"`; regole su selettori, testi, attributi e
     **stili calcolati** (il valore atteso si normalizza con un elemento-sonda: `green` → `rgb(0, 128, 0)`).
   - La logica di confronto è pura (`src/shared/learn/checks.ts`) e si collauda con jsdom.
4. **Manuali della Collana**: ogni capitolo → lezione, ogni riquadro 🧪 → esercizio ad
   *autovalutazione* («Ho finito» + revisione del tutor AI), linguaggio dedotto da manuale ed esercizio.
5. **Tutor AI**: riceve consegna, file dello studente ed esito della verifica con l'istruzione di non
   dare la soluzione completa (un indizio alla volta).

## Conseguenze
- Un corso nuovo si scrive a mano (o lo si genera) senza toccare il codice dell'IDE.
- Gli esercizi dei manuali non hanno verifica automatica finché qualcuno non aggiunge `verifica.json`
  al pacchetto importato.
