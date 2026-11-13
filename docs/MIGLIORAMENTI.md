# Miglioramenti — analisi del 13/11/2026 (dopo la 1.3.0)

Analisi fatta leggendo README, CONVENTION, ROADMAP, ADR, i moduli in `src/renderer/modules/` e le suite e2e
(eseguite con gli screenshot), confrontando i flussi con VS Code, Webflow/Framer (designer), Replit/StackBlitz
(progetto → anteprima → pubblicazione) e Thonny (principianti).
Punto di partenza: typecheck, 186 test unitari, 10/10 suite e2e verdi (211 controlli).

Priorità: **A** = buco in un flusso principale o rischio di perdere lavoro; **B** = utile e visibile;
**C** = rifinitura o lavoro grosso da pianificare. Costo: S (ore), M (mezza giornata), L (giorni).

## Elenco

| # | Cosa | Perché | Pri. | Costo | Stato |
|---|---|---|---|---|---|
| 1 | **Chiusura senza perdere lavoro**: alla chiusura della finestra il main chiede al renderer di salvare (salvataggi automatici in sospeso, bozza della Scrittura rapida); col salvataggio automatico spento chiede «Salva e chiudi / Chiudi senza salvare / Annulla» | Chiudendo entro 0,7 s dall'ultima modifica il salvataggio automatico non partiva più; senza salvataggio automatico le modifiche sparivano senza avviso (VS Code chiede sempre) | A | M | ✅ fatto |
| 2 | **Progetti recenti spariti**: all'avvio un ultimo progetto cancellato non mostra più l'errore `ENOENT`; aprendone uno sparito si propone di toglierlo; X per togliere una voce | Errore criptico a ogni avvio, elenco recenti non ripulibile | A | S | ✅ fatto |
| 3 | **Dialoghi accessibili**: il fuoco entra nel dialogo, Tab/Maiusc+Tab restano dentro, Esc chiude solo quello in cima, alla chiusura il fuoco torna dov'era; `aria-labelledby`; etichette delle Impostazioni e dei prompt collegate ai campi | Con la tastiera il fuoco restava sotto il dialogo; con due dialoghi Esc li chiudeva tutti; lettori di schermo senza nomi dei campi | A | S | ✅ fatto |
| 4 | **Testi fuori da i18n**: validazione dei nomi di file, «Impossibile aprire», «Documento non disponibile», «Nessun modello AI», «Errore di compilazione» della console | Con l'interfaccia in inglese comparivano frasi italiane | B | S | ✅ fatto |
| 5 | **Benvenuto**: i pulsanti vanno a capo (il quarto, «Corsi ed esercizi», era tagliato con la barra di scorrimento nel pannello centrale stretto) | Visibile nello screenshot del primo avvio | B | S | ✅ fatto |
| 6 | **Scorciatoie da tastiera**: ricerca nell'elenco e colonna della categoria | Elenco lungo (60+ voci) senza filtro | B | S | ✅ fatto |
| 7 | **Designer: pagine del sito** (Webflow «Pages»): selettore della pagina nella barra del designer e «Nuova pagina…» che crea `chi-sono.html` accanto alla pagina aperta con la stessa testa (fogli di stile), la stessa intestazione/navigazione e lo stesso piè di pagina | Il flusso crea progetto → designer si fermava a una pagina: il modello «Sito» ha i link Home/Chi sono/Contatti ma le altre pagine andavano create a mano nel codice | A | M | ✅ fatto |
| 8 | Consolidamento: una sola funzione `filePaths()` (in `shared/paths.ts`) al posto di due copie di `flatten` (palette dei comandi, programmazione visuale) | Regola «una sola fonte» | C | S | ✅ fatto |
| 9 | **Esporta il sito pronto da pubblicare** (ZIP con tutte le pagine, TypeScript compilato, CSS e script incorporati, immagini e altri file copiati) | Lo ZIP attuale contiene i `.ts` sorgente (non si aprono nel browser) e la «pagina HTML unica» esporta solo la pagina d'ingresso: un sito di più pagine non si poteva pubblicare (Netlify Drop, GitHub Pages, hosting) senza passaggi manuali | A | M | ✅ fatto |
| 10 | **Immagini del progetto**: aprendo un `.png/.jpg/.svg` dall'albero c'è solo l'avviso «non è un file di testo» → visualizzatore con dimensioni | VS Code/Replit mostrano l'immagine; i principianti controllano così le immagini importate | B | M | ✅ fatto |
| 11 | **Menu dell'applicazione tradotto** e con le voci mancanti (Designer, Database, Diagrammi, Esporta sito): oggi il menu nativo è scritto in italiano nel main e ignora la lingua scelta | i18n incompleta; scopribilità delle funzioni | B | M | ✅ fatto (menu descritto dal renderer, `app:setMenu`; nuova sezione «Crea») |
| 12 | Blocchi Blockly, terminale SQL e messaggi del terminale ancora solo in italiano | i18n per chi usa l'inglese | C | M | da fare |
| 13 | Ispettore del designer: nel menu «Carattere» la variabile del tema appare come `--font-titoli` invece di «Carattere dei titoli (tema)» | Rifinitura | C | S | ✅ fatto |
| 14 | Designer: spostare un elemento a flusso con la tastiera (Alt+↑/↓ = prima/dopo il fratello), oggi solo trascinando nei Livelli o con le frecce dei Livelli | Tastiera e accessibilità | C | S | da fare |
| 15 | Prestazioni: il bundle del renderer supera 6 MB (Monaco, Blockly, PGlite client, React Flow nello stesso chunk) → caricare a richiesta Blockly/diagrammi/SQL | Avvio più rapido sui PC lenti delle scuole | C | L | da fare |
| 16 | Esportazione «pagina HTML unica»: le immagini di sfondo nel CSS (`url(...)`) non vengono incorporate | Pagina esportata senza sfondi | C | S | ✅ fatto |

## Note

- Ogni voce fatta ha i suoi test: unitari (`close-guard.test.ts`, `designer-pages.test.ts`, `menu.test.ts`,
  esportazione del sito in `growth.test.ts`) ed e2e (`tests/e2e/shell.mjs` nuova suite del guscio: chiusura, dialoghi,
  recenti, immagini, menu anche in inglese; scenario «pagine» in `designer.mjs`; «sito pronto» in `growth.mjs`).
- Rimasti (priorità C): 12 (anche le etichette degli stili pronti in `shared/designer/presets.ts` sono solo in
  italiano), 14, 15. Sono rifiniture o lavori lunghi (code splitting del renderer) da pianificare a parte.
- Il canale IPC nuovo segue la regola della whitelist: `app:closeReply` (invoke) e `app:closeRequested` (evento)
  in `src/shared/contracts/ipc.ts`; la logica di attesa è pura in `src/main/close-guard.ts`.

## Revisione sull'app vera (13/11/2026, dopo la chat laterale)

Revisione severa con l'app costruita e avviata (playwright), più due richieste dell'utente: «la programmazione
grafica non permette di trascinare quell'elemento nel posto giusto una volta che finisce sotto» e «non c'è il
diagramma ad albero per i file». P0 = rotto, P1 = fa male all'uso, P2 = rifinitura.

| # | Cosa | Stato | Test |
|---|---|---|---|
| P0-1 | Designer: rilascio nel padding o nello spazio vuoto di un contenitore = **dentro** (accanto al figlio più vicino); prima/dopo il contenitore solo in una fascia sottile sul bordo (≤ 10 px della pagina) o con Alt; lo sfondo non va mai dopo `<script>`; clic nella palette senza selezione = nel contenitore in vista o in `<main>`, poi portato in vista | ✅ fatto | `designer-drop.test.ts`, `designer-drag.mjs` (scenario dell'utente) |
| P0-2 | Designer, blocchi, nodi, diagrammi e Scrittura rapida non ingrandiscono più il gruppo: l'Esplora resta; anteprima e console si fanno da parte da sole e tornano aprendo un file; Ctrl+B / Ctrl+J e due pulsanti nella barra | ✅ fatto | `layout.mjs` |
| P0-3 | Tavola libera: posizione limitata ai bordi (un elemento più grande della tavola resta visibile almeno 40 px); tirato ben fuori esce dalla tavola e torna nel flusso; «Porta fuori dalla tavola» nel menu | ✅ fatto | `designer-drop.test.ts`, `designer-drag.mjs` |
| P0-4 | Al rilascio si sposta l'elemento trascinato (non la selezione); Esc annulla il trascinamento | ✅ fatto | `designer-drag.mjs` |
| P1-1 | Dopo uno spostamento la selezione resta sull'elemento spostato anche senza id (`moveElementAt`) | ✅ fatto | `designer-drop.test.ts`, `designer-drag.mjs` |
| P1-2 | Righe flex e griglie: prima/dopo con la X e linea verticale; scheda su scheda sorella dello stesso tipo = riordino | ✅ fatto | `designer-drop.test.ts`, `designer-drag.mjs` |
| P1-3 | Entrando in una tavola un elemento diventa libero, uscendo perde `position/left/top/width/height` (anche dai Livelli) | ✅ fatto | `designer-drop.test.ts`, `designer-drag.mjs` |
| P1-4 | Esplora: trascinamento di file e cartelle (`workspace:rename`), tastiera (frecce, Home/Fine, Invio, F2, Canc con conferma, tabindex a rotazione), «Sposta in…», «Copia percorso» | ✅ fatto (manca «Duplica», filtro nell'albero, guide di rientro) | `file-tree.test.ts`, `layout.mjs` |
| P1-5 | Finestra stretta: `minmax(0, 1fr)` nel guscio, barra che non sborda, solo icone sotto i 1200 px | ✅ fatto | `layout.mjs` (1100 e 1024 px) |
| P1-6 | Nodi: un'uscita di flusso ha un solo filo (il nuovo sostituisce il vecchio) | ✅ fatto | `graph-edit.test.ts`, `visual.mjs` |
| P1-7 | Nodi: niente ricentramento a ogni nodo, nodi nuovi al centro della vista, Ctrl+Z/Ctrl+Y, fili ricollegabili (capo nel vuoto = filo staccato), filo nel vuoto → menu dei nodi compatibili | ✅ fatto (manca: inserire un nodo su un filo esistente) | `graph-edit.test.ts`, `visual.mjs` |
| P1-8 | Trascinamento con fantasma dell'elemento, contenitore evidenziato, etichetta «dentro main.scheda › dopo button#pulsante», scorrimento automatico ai bordi e ricalcolo con la rotellina | ✅ fatto | `designer-drag.mjs` |
| P2-1 | Livelli sempre visibili sotto la palette | da fare (M) | |
| P2-2 | Zoom del canvas del designer (con Esplora e chat aperte la pagina scende a scala ~0,3) | da fare (M) — ora più urgente | |
| P2-3 | Codice generato di blocchi e nodi mostrato pulito, senza `__labStep` | ✅ fatto | `code-map.test.ts`, `split-code.mjs` |
| P2-4 | «Nuovo programma a blocchi/nodi» nel Benvenuto | ✅ fatto | `layout.mjs` |
| P2-5 | Barra delle attività fissa (Esplora / Database / Git in schede separate) | da fare (M) | |
| P2-6 | Scrittura rapida: colonna dell'editor stretta | da fare (S) | |
| P2-7 | Ctrl+Shift+G apre il Designer (in VS Code è Git) | da decidere | |
| P2-8 | Ctrl+B fatto; ricerca nei file (Ctrl+Shift+F) da fare | in parte | |
| P2-9 | «Questo elemento» aggiunge `id="titolo-1"` senza dirlo | da fare (S) | |
| P2-10 | Benvenuto con Designer, Blocchi, Nodi, Database e le scorciatoie nuove | ✅ fatto | `layout.mjs` |
| — | La chat laterale parte **aperta** al primo avvio (poi vale lo stato salvato) | ✅ fatto | `side-chat.test.ts`, `ai-side.mjs` |
| — | **Vista affiancata grafica ↔ codice** (standard del vault): «Affianca codice» e `view.splitCode` (Ctrl+Alt+K); designer → file `.html` in un gruppo a destra; clic su un elemento = codice selezionato e illuminato senza rubare il fuoco; cursore nel codice = elemento selezionato; blocchi e nodi = codice generato in sola lettura accanto, collegato nei due sensi; scelta ricordata per tipo | ✅ fatto (il CSS della regola selezionata non è ancora affiancato) | `code-map.test.ts`, `split-code.mjs` |
