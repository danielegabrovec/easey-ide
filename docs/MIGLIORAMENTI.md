# Miglioramenti — Easey IDE

## Confronto con Easey DB 1.0 — analisi del 15/11/2026 (verso la 1.5.0)

Easey DB nasce da una copia di Easey IDE ed è stato rifatto in 12 fasi (0.5 → 1.0). Questa analisi confronta
Easey IDE 1.4.0 con ciò che Easey DB ha adesso, dal punto di vista di chi impara a programmare e non è esperto.
Metodo: lettura del codice dei due progetti (file:riga qui sotto), dei documenti di Easey DB (VISIONE, ROADMAP,
MIGLIORAMENTI, CHANGELOG) e delle note del vault. Priorità: **A** = fa perdere lavoro o confonde,
**B** = utile e visibile, **C** = rifinitura o lavoro grosso. Le voci «roadmap» sono in [ROADMAP](ROADMAP.md).

| # | Area | Cosa manca o è rotto (riferimento) | Come lo risolve Easey DB | Pri. | Stato |
|---|---|---|---|---|---|
| E1 | Lavoro perso | Blocchi, nodi e diagrammi salvano con un ritardo (`BlocksPanel.tsx:60` 500 ms, `NodesPanel.tsx:200` 500 ms, `DiagramPanel.tsx:200` 400 ms) e non ascoltano `app:closing`: chiudendo la finestra o cambiando progetto in quel momento l'ultima modifica si perde. La guardia di chiusura conosce solo i file modificati (`close-guard.tsx:56-60`) | `workbench/unsaved.tsx`: ogni modulo dichiara il lavoro non salvato con `registerUnsavedWork` (anche salvandolo da sé); la chiusura elenca tutto | A | ✅ 1.5.0 |
| E2 | Lavoro perso | Il database in memoria (`sql-store.ts:9`, quello di partenza senza progetto) si svuota chiudendo l'app senza avviso | Avviso nell'elenco del lavoro non salvato | A | ✅ 1.5.0 |
| E3 | Eliminazioni | «Elimina» nell'Esplora cancella per sempre (`workspace-service.ts:177-181`, `rm` ricorsivo); «Elimina il database» cancella anche le sue istantanee (`db-service.ts:108-116`) | Tutto nel Cestino di Windows; le istantanee restano | A | ✅ 1.5.0 |
| E4 | Errori | Gli avvisi d'errore spariscono dopo 7 s (`notifications.ts:28`), si chiudono con un clic qualsiasi (`Workbench.tsx:149`), non si possono copiare e non resta traccia | Errori fissi finché non si chiudono, «Copia», «Dettagli», **registro delle attività** nella barra di stato | A | ✅ 1.5.0 |
| E5 | Robustezza | Nessun error boundary: un errore in un pannello (designer, nodi, SQL…) rende bianca tutta la finestra (`main.tsx:36`, `layout.ts:41` registra i pannelli senza barriera) | `ErrorBoundary.tsx`: «Il pannello si è bloccato — Riapri», barriera della radice con «Ricarica la finestra» | A | ✅ 1.5.0 |
| E6 | Dialoghi | Un clic fuori chiude il dialogo e perde ciò che si è scritto (`dialogs.tsx:101`); niente ✕ nell'intestazione né «Vuoi scartare le modifiche?». (Esc chiude già solo quello in cima, voce 3 della revisione del 13/11) | `Modal` con `dirty`, clic fuori ignorato se si è scritto qualcosa, ✕, conferma | A | ✅ 1.5.0 |
| E7 | Disposizione | **Pannelli che finiscono nella colonna di sinistra**: chiusa la scheda Benvenuto il gruppo centrale sparisce e `showPanel` ripiega sul gruppo attivo (`layout.ts:215`), cioè l'Esplora appena cliccata: il file aperto con un clic finisce nella colonna dell'albero. Stesso difetto per le differenze di Git, il designer, i diagrammi, l'ER e il costruttore SQL aperti da una colonna laterale; e `rememberArea` (`EditorPanel.tsx:111,116`) prende per «centro» qualunque gruppo in cui si trascini un editor, anche l'Esplora | (In Easey DB il difetto c'è ancora con il doppio clic sulle tabelle: stessa riga di `layout.ts`) | A | ✅ 1.5.0 |
| E8 | Guida | Nessun percorso guidato, nessun «prossimo passo», nessun glossario, F1 non fa niente | `ui/Tour.tsx` + `src/shared/guide/` (percorsi, suggerimenti, aiuto F1), glossario con ricerca | A | ✅ 1.5.0 (3 percorsi, «Cosa fare adesso», glossario di 26 voci, 10 pagine F1; aiuto F1 solo in italiano) |
| E9 | AI | Formule LaTeX mostrate come testo nelle risposte (`$\rightarrow$`, `\frac{a}{b}`): `Markdown.tsx:48` non le riconosce e il prompt di sistema (`it.ts:202`) non le vieta | — (non c'è nemmeno in Easey DB) | B | ✅ 1.5.0 |
| E10 | AI | Suggerimenti d'avvio della chat sempre uguali («let e const», «centrare con CSS», «Promise», `AiChatPanel.tsx:383`) anche con un file Python o C aperto | `starterPrompts(schema)` presi dal lavoro aperto | B | ✅ 1.5.0 |
| E11 | Completamento | Due motori di completamento AI in linea (doppione): quello dei file del progetto (`inline-completion.ts`) vale solo per 9 linguaggi web (`:7`), niente Python, C, C++, C#, Java, Rust, e non usa la misura e la pulizia di quello della Scrittura rapida (`assist.ts:42`); parole chiave e modelli rapidi dei linguaggi senza servizio di Monaco esistono solo nella Scrittura rapida (`assist.ts:105,131`) | Un contesto AI solo; completamento AI in grigio spento di serie dove non serve | B | ✅ 1.5.0 (`services/inline-ai.ts` unico, tutti i linguaggi; parole chiave e modelli rapidi anche nei file) |
| E12 | AI | Se Ollama non ha modelli si dice solo «Scarica Ollama»: manca «Scarica il modello consigliato» con la barra (`ai:pull`) | `ai:pull` annullabile, `AiUnavailableCard.tsx` | B | roadmap |
| E13 | Errori | Gli errori dei programmi (console, terminale, compilatori) restano grezzi e in inglese; Easey DB ne spiega 40 in italiano con «Cosa fare» | `explain-error.ts` | B | roadmap (catalogo per JS/TS/Python/C/Java da costruire) |
| E14 | Interfaccia | Nessuna «Modalità avanzata»: Git, terminale, Problemi e strumenti sempre visibili anche al primo giorno | Esplora file, terminale e Problemi solo in Modalità avanzata | C | roadmap (da decidere col titolare: in un IDE per imparare il terminale serve presto) |
| E15 | Impostazioni | `settings.json` scritto direttamente: un file rovinato riparte da zero in silenzio | Scrittura sicura con `.bak` | C | roadmap |
| E16 | Linguaggi | Nei progetti i file `.py`, `.c`, `.cpp`, `.cs`, `.java`, `.rs` non erano file di testo (`paths.ts` `LANGUAGE_BY_EXTENSION`): aprendoli «non è un file di testo», niente colori né suggerimenti, anche se l'IDE insegna quei linguaggi | — | A | ✅ 1.5.0 (si aprono, colorati, con parole chiave, modelli rapidi e suggerimento AI; eseguirli dal progetto resta in roadmap) |
| E17 | Comandi | Un comando non disponibile (es. «Designer» senza progetto, dal menu o dalla palette) non fa niente e non dice perché (`commands.ts` `when`) | `unavailable()` con l'avviso | C | roadmap |

Collaudi: `tests/e2e/safety.mjs` (E1, E2, E4, E6, E7, E16), `tests/e2e/guide.mjs` (E8), `tests/e2e/ai-side.mjs` (E9, E10);
unitari `layout-areas`, `math-text`, `starters`, `guide`, `activity-log`, Cestino in `workspace` e `db`.
Le barriere dei pannelli (E5) non hanno un collaudo e2e: manca un modo pulito per far rompere un pannello a comando.

Già allo stesso livello (verificato): menu nativo tradotto dal renderer (`app-menu.ts` + `app:setMenu`), Esc sul
solo dialogo in cima con il fuoco intrappolato (`dialogs.tsx`), chiusura che chiede per i file modificati,
progetti recenti ripulibili, chat AI nella colonna destra, vista affiancata grafica ↔ codice.

---

## Analisi del 13/11/2026 (dopo la 1.3.0)

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
| P2-2 | Zoom del canvas del designer (con Esplora e chat aperte la pagina scendeva a scala ~0,3): Ctrl+rotellina attorno al puntatore, Ctrl+0 adatta, Ctrl+1 100 %, Ctrl+= / Ctrl+- a gradini (solo col designer attivo), percentuale con menu nella barra, spazio + trascina (o tasto centrale) per spostare la vista; maniglie, etichette e guide della stessa misura sullo schermo a ogni zoom; un clic su una maniglia senza trascinare non scrive niente | ✅ fatto | `designer-zoom.test.ts`, `designer-zoom.mjs` |
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

## Design migliore (13/11/2026, piano «designer che producono design belli»)

Obiettivo dell'utente: «migliorare la grafica di design… per riuscire a creare design migliori». Piano fatto
sull'app vera (landing costruita con il designer e screenshot); qui la parte Easey delle prime tre fette.
Il design kit (`src/shared/design-kit/`) è codice puro, protetto da `src/shared/design-kit.lock`: IDE Next lo
copierà identico (`node scripts/design-kit-lock.mjs` dopo ogni modifica).

| # | Cosa | Stato | Test |
|---|---|---|---|
| D1 | **Pagina intera a tutta larghezza**: clic su una «Pagina intera» con la pagina già piena → «Sostituisci la pagina» (consigliato; gli script restano) o «Aggiungi in fondo»; il body perde la griglia centrata; `img { max-width: 100% }` | ✅ fatto | `designer-page.test.ts`, `designer-page.mjs` (larghezza a 1200/820/390) |
| D2 | Il `body` (e `html`) si stilano sul loro tag: niente più `#body-1` | ✅ fatto | `designer-page.mjs` |
| D3 | Modelli di progetto sui token `--colore-*` (`--accento`, `--sfondo`, `--testo` diventano alias); il tema li collega anche nei progetti vecchi: pulsanti e moduli seguono il tema | ✅ fatto | `designer-page.test.ts`, `designer-page.mjs` (Oceano, Tramonto) |
| D4 | Segnaposto SVG locali (`img/segnaposto-*.svg`, nei colori del tema) al posto di picsum; ispettore immagine: Riempi / Adatta / Allunga, proporzione 16:9…3:4, punto a fuoco | ✅ fatto | `designer-page.test.ts`, `designer-page.mjs` |
| D5 | Canvas: una ricostruzione lenta non sovrascrive più quella nuova (pagina «senza stile» dopo un inserimento) | ✅ fatto | `designer-page.mjs` |
| D6 | **Design kit**: colori OKLCH (scale 50–900, armonie), contrasto WCAG con correzione, scala tipografica fluida (`clamp`), spazi 4/8, raggi, elevazioni, temi (anche «dal mio colore», con contrasti verificati) | ✅ fatto | `design-kit.test.ts`, `design-kit-lock.test.ts` |
| D7 | Scheda Sito: tema dal mio colore, scala del testo (Compatta/Equilibrata/Editoriale), **coppie di caratteri inclusi** (8 woff2 OFL in `resources/fonts`, copiati in `fonts/` del progetto, offline), colori con nomi umani | ✅ fatto | `designer-kit.mjs` |
| D8 | Ispettore: gradino della scala del testo, peso 300–900 (con 800) secondo il carattere, campioni solo del tema con il nome, contrasto con «Correggi» | ✅ fatto | `designer-kit.mjs` |
| D9 | Icone lucide (56, ricerca in italiano) come SVG in linea con `currentColor`: blocco «Icona», caratteristiche con icone vere, scelta icona nella scheda Elemento | ✅ fatto | `design-kit.test.ts`, `designer-kit.mjs` |
| D10 | **Ritocchi consigliati** (scheda dell'ispettore + pulsante nella barra): contrasto, griglia con una scheda orfana, spazi fuori scala, titoli e righe troppo lunghi, overflow sul telefono (misurato in una copia a 390 px), immagini senza alt o da Internet, pulsanti sotto 44 px; «Correggi» a un clic, annullabile | ✅ fatto | `design-kit-lint.test.ts`, `designer-quality.mjs` |
| D11 | Blocchi e stili pronti sulla scala degli spazi; sezioni pronte inserite dopo la sezione selezionata (non dentro una scheda); galleria con titolo; ritmo fra sezioni; invito all'azione con margini sul telefono | ✅ fatto | `design-kit-lint.test.ts`, `designer-drop.test.ts` |
| — | Da fare (fette successive del piano): stati hover/focus (EA6), allinea a 9 punti e griglie senza orfani di serie (EA7), anteprima affiancata di 3 larghezze e menu a panino (EA8), proposte AI a token (EA10), varianti dei blocchi (EA11); un foglio di stile in una sottocartella non mostra i caratteri nel canvas (gli `url()` si risolvono dalla pagina) | da fare | |
