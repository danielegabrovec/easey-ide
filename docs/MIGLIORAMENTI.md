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
| 9 | **Esporta il sito pronto da pubblicare** (ZIP con tutte le pagine, TypeScript compilato, CSS e script incorporati, immagini e altri file copiati) | Lo ZIP attuale contiene i `.ts` sorgente (non si aprono nel browser) e la «pagina HTML unica» esporta solo la pagina d'ingresso: un sito di più pagine non si poteva pubblicare (Netlify Drop, GitHub Pages, hosting) senza passaggi manuali | A | M | da fare |
| 10 | **Immagini del progetto**: aprendo un `.png/.jpg/.svg` dall'albero c'è solo l'avviso «non è un file di testo» → visualizzatore con dimensioni | VS Code/Replit mostrano l'immagine; i principianti controllano così le immagini importate | B | M | da fare |
| 11 | **Menu dell'applicazione tradotto** e con le voci mancanti (Designer, Database, Diagrammi, Esporta sito): oggi il menu nativo è scritto in italiano nel main e ignora la lingua scelta | i18n incompleta; scopribilità delle funzioni | B | M | da fare |
| 12 | Blocchi Blockly, terminale SQL e messaggi del terminale ancora solo in italiano | i18n per chi usa l'inglese | C | M | da fare |
| 13 | Ispettore del designer: nel menu «Carattere» la variabile del tema appare come `--font-titoli` invece di «Carattere dei titoli (tema)» | Rifinitura | C | S | da fare |
| 14 | Designer: spostare un elemento a flusso con la tastiera (Alt+↑/↓ = prima/dopo il fratello), oggi solo trascinando nei Livelli o con le frecce dei Livelli | Tastiera e accessibilità | C | S | da fare |
| 15 | Prestazioni: il bundle del renderer supera 6 MB (Monaco, Blockly, PGlite client, React Flow nello stesso chunk) → caricare a richiesta Blockly/diagrammi/SQL | Avvio più rapido sui PC lenti delle scuole | C | L | da fare |
| 16 | Esportazione «pagina HTML unica»: le immagini di sfondo nel CSS (`url(...)`) non vengono incorporate | Pagina esportata senza sfondi | C | S | da fare |

## Note

- Ogni voce fatta ha i suoi test: unitari (`close-guard.test.ts`, `designer-pages.test.ts`) ed e2e
  (`tests/e2e/shell.mjs` nuova suite del guscio; scenario «pagine» in `designer.mjs`).
- Il canale IPC nuovo segue la regola della whitelist: `app:closeReply` (invoke) e `app:closeRequested` (evento)
  in `src/shared/contracts/ipc.ts`; la logica di attesa è pura in `src/main/close-guard.ts`.
