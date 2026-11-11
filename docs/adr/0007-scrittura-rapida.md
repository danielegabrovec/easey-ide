# ADR 0007 — Scrittura rapida (senza progetto)

**Stato:** accettata (2026-11-11)

## Contesto
Per provare un'idea al volo serviva un modo di scrivere ed eseguire codice **senza creare un progetto**,
con risultati immediati, aiuto alla scrittura regolabile e la possibilità di salvare. Linguaggi:
JavaScript, TypeScript e SQL (richiesta iniziale), poi Python e HTML (con CSS e JS nella pagina).

## Decisioni
- **Modulo `quick-code`** con un pannello che si apre a tutta finestra (Ctrl+Shift+Q, Benvenuto,
  barra in alto): editor, raccolta, risultati. Un solo modello Monaco vivo alla volta, con schema `quick:`
  (non `file:`): niente marcatori fra i Problemi del progetto, niente autocompletamento AI dei file.
- **Esecuzione sempre in un worker che si può terminare** (`services/quick/quick-runner.ts`): il tempo
  massimo (5 s, regolabile) parte quando parte il codice dell'utente; un ciclo infinito o una memoria
  esaurita fermano solo il worker. Un programma alla volta: uno nuovo ferma il precedente.
  - **JS/TS**: strumentazione testuale con Babel (`shared/quick/instrument.ts`), sulle stesse righe:
    espressioni di primo livello → `__v(riga, valore)`, variabili → `__vd(riga, nome, valore)`,
    `console.x` → `__con(riga).x`; tutto dentro `(async () => {…})()` sulla riga 1 (await di primo
    livello). TypeScript: esbuild `transform` con source map per la riga degli errori. Nel worker un
    contesto `vm` pulito: timer tracciati (id numerici come nel browser), `fetch`, niente `require`.
  - **Python**: **Pyodide** (CPython 3.14 in WebAssembly, ~14 MB, MPL 2.0 + PSF). Nessuna installazione
    e nessuna rete. La strumentazione la fa Python con `ast` (stesso schema di JS) e `print` conosce la
    riga di chi stampa (`sys._getframe`). Pyodide impiega ~1 s a caricarsi: il main tiene **un worker
    di riserva già caricato** e ne prepara un altro a ogni esecuzione; `input()` non è disponibile.
  - Scartato: Python di sistema (non sempre installato, versioni diverse) e un unico worker Pyodide
    riusato (un ciclo infinito obbligherebbe comunque a ricaricarlo, e lo stato resterebbe sporco).
- **SQL**: SQLite o PGlite **in memoria** (`quick-sql.ts`), senza progetto. Opzione predefinita
  «database pulito a ogni esecuzione» (+ dati d'esempio): rieseguire non duplica le righe e l'esecuzione
  automatica è sicura; senza, l'automatico parte solo per script di sola lettura (`isReadOnlySql`).
- **HTML**: pagina in memoria servita da `ide-preview://quick/pagina.html` con lo stesso script ponte
  dell'anteprima (console, errori, scorciatoie): origine separata dall'IDE.
- **Risultati accanto alle righe** con decorazioni `after` di Monaco (serve `showIfCollapsed`), più
  l'elenco a destra con il numero di riga cliccabile; «Chiedi all'AI» sugli errori (`ai.ask`).
- **Livelli di aiuto** (`ASSIST_LEVELS` in `shared/contracts/quick.ts`): Spento (solo Ctrl+Spazio),
  Leggero (suggerimenti + AI di una riga a fine riga), Intermedio (snippet + AI di qualche riga),
  Forte (AI fino a blocchi interi, anche a metà riga, anteprima dei suggerimenti). L'AI usa il modello
  FIM già scelto per l'editor; il suggerimento parte dall'inizio della parola, così convive con
  l'elenco dei suggerimenti aperto. **Ctrl+I** «Genera con AI» usa il modello di chat.
- **Raccolta = file veri** in `Documenti\Easey IDE\Scrittura rapida` (`snippet-store.ts`): il nome del
  file è l'identificativo, cambiare titolo rinomina, eliminare sposta nel Cestino. La bozza in corso
  (per linguaggio) sta nel `localStorage` del renderer e si ritrova al riavvio.
- **Scorciatoie di pannello**: `Command.panel` — con la Scrittura rapida attiva Ctrl+S, Ctrl+Invio,
  F5 e Ctrl+I vanno a lei e non all'editor dei file o al SQL Lab (`commandForChord` nel workbench).
- **SQL condiviso**: i suggerimenti (tabelle, colonne, alias, parole chiave, modelli) sono in
  `shared/sql/completion.ts`, usati dal SQL Lab e dalla Scrittura rapida (prima erano solo nel SQL Lab).

## Conseguenze
- Due worker come entry di build a sé (`out/main/quick-worker.mjs`, `quick-python-worker.mjs`), in
  `asarUnpack` insieme a `node_modules/pyodide`; importano solo moduli di Node (e pyodide).
- L'installer cresce di ~14 MB (Pyodide). I pacchetti Python extra (numpy…) non sono inclusi.
- Collaudo: `tests/unit/quick.test.ts`, `tests/e2e/quick.mjs` (46 controlli, AI con Ollama vero).
