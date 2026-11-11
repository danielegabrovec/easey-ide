# Roadmap — Easey IDE

Piano completo approvato il 2026-11-11. Ogni fase è un vertical slice con il suo "Fatto quando"
(build, test unitari e collaudo e2e verdi).

| Fase | Contenuto | Stato |
|---|---|---|
| F0 | Fondamenta: Electron, workbench a pannelli, progetti da modello, Monaco, autosalvataggio, cronologia locale, installer | ✅ v0.1 |
| F1 | Esecuzione: anteprima web con console e source map, terminale reale, esegui JS/TS nel terminale, REPL | ✅ v0.1 |
| F1.5 | Assistente AI locale con Ollama: autocompletamento inline (FIM), chat con contesto, azioni rapide (spiega, errore, correggi con confronto, commenti, test), modalità tutor | ✅ v0.2 |
| F2 | SQL Lab: SQLite (`node:sqlite`) e PostgreSQL incorporato (PGlite), file .sql con Ctrl+Invio, risultati ed export, terminale SQL, designer tabelle, diagramma ER, costruttore visuale ↔ SQL, EXPLAIN didattico, istantanee sandbox, SQL da linguaggio naturale | ✅ v0.3 |
| F3 | **Editor grafico stile Canva/Wix** (dettaglio sotto): tavole libere con guide magnetiche e maniglie, sezioni a flusso, palette e blocchi pronti, ispettore stili con bersaglio e punti di interruzione, testo in linea, livelli, stile del sito, modifiche chirurgiche al codice | ✅ v0.4 |
| F4 | Programmazione visuale: blocchi (Blockly, con blocchi "Pagina" sugli id reali) e nodi con flusso e dati (anche chiamate alle funzioni esportate dei file TS/JS), codice generato accanto, passi evidenziati durante l'esecuzione, Converti in codice | ✅ v0.5 |
| F5 | Diagrammi con connettori (flowchart, ER, UML), export SVG/PNG/Mermaid, flowchart ↔ codice, mappe mentali, Vai al file (Ctrl+P) | ✅ v0.6 |
| F6 | Didattica: lezioni ed esercizi con verifica automatica, legati ai manuali della Collana; corso incluso, importatore dei manuali, tutor AI | ✅ v0.7 |
| F7 | Crescita: esecuzione passo-passo JS/TS con variabili e pila delle chiamate, Git integrato (stato, differenze, commit, cronologia), esportazione ZIP e pagina HTML unica, fornitore AI compatibile OpenAI (LM Studio, llama.cpp, vLLM) | ✅ v0.8 |
| 1.0 | **Easey IDE**: nuovo nome e icona, note legali e privacy, licenza MIT, elenco dei componenti di terze parti, finestra Informazioni, README con screenshot, pubblicazione su GitHub | ✅ v1.0.0 |
| F8 | Prossimi passi (a richiesta): Python nel browser (Pyodide), driver PostgreSQL/MySQL/SQL Server su server veri, aggiornamenti automatici (electron-updater + canale di pubblicazione), API pubblica per plugin sugli stessi punti di estensione, verifiche automatiche per gli esercizi importati dai manuali | da fare |

## F3 — Editor grafico stile Canva/Wix

Un'area di lavoro visuale dove si costruisce la pagina **senza scrivere codice**, mentre il codice
HTML/CSS si aggiorna in tempo reale (e modificando il codice si aggiorna il disegno).

**Due modalità, stesso documento:**
- **Libera (stile Canva)**: tavola da disegno con elementi posizionati dove li trascini — testi,
  immagini, forme, icone, pulsanti, riquadri; guide magnetiche e allineamento, livelli (porta
  avanti/indietro), raggruppa, ruota, ridimensiona con le maniglie, blocca. Produce CSS con
  posizionamento assoluto dentro un contenitore, leggibile e commentato.
- **A sezioni (stile Wix/Webflow)**: pagina composta da sezioni e blocchi pronti (intestazione,
  hero, galleria, modulo contatti, schede prezzi, piè di pagina) che si impilano e si adattano al
  telefono; layout flex/grid regolabili a mano.

**Strumenti comuni:**
- Pannello elementi (testi, form: input, select, checkbox, pulsanti; media; componenti) da trascinare.
- Ispettore stili visuale: colori (contagocce e tavolozza del progetto), tipografia, spaziature con
  il box model disegnato, bordi, ombre, sfumature, angoli, opacità; classi CSS o stile del singolo elemento.
- Kit di stile del progetto (colori, caratteri, pulsanti) salvato come variabili CSS e riusato ovunque.
- Modelli di pagina pronti, galleria immagini/icone locale, inserimento immagini da disco.
- Punti di interruzione responsive (telefono/tablet/desktop) con modifiche per dimensione.
- Albero dei livelli, annulla/ripeti, copia/incolla stile, scorciatoie.
- **Sincronizzazione bidirezionale con il codice** (parse5 + postcss): il designer modifica solo le
  righe interessate, il codice dell'utente non viene riformattato; selezionare un elemento nel disegno
  evidenzia il codice e viceversa.
- Esporta la pagina (cartella o HTML unico) e anteprima reale con la stessa console di F1.
- Gli elementi creati hanno `id` che F4 (blocchi e nodi) usa per collegare eventi e funzioni.

**Fatto quando:** e2e — trascino un titolo e un pulsante in modalità libera e in una sezione,
cambio colore e carattere dall'ispettore, il codice mostra solo quelle modifiche; modifico il CSS a
mano e il disegno si aggiorna; test round-trip HTML/CSS su fixture.
