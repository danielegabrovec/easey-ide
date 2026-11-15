# Novità di Easey IDE

## 1.5.0 — 2026-11-15

Easey IDE allo stesso livello di Easey DB ([analisi](docs/MIGLIORAMENTI.md)): niente lavoro perso, errori che si
capiscono, e chi comincia sa sempre cosa fare dopo.

**Il lavoro non si perde**
- Blocchi, nodi e diagrammi salvano subito anche se chiudi la finestra o cambi progetto un attimo dopo una modifica.
- Alla chiusura l'app elenca anche il lavoro che non è un file (il database in memoria con le sue tabelle).
- «Elimina» nell'Esplora e «Elimina il database» spostano nel Cestino di Windows; le istantanee del database restano.
- Le finestre di dialogo non si chiudono più con un clic fuori se ci hai scritto qualcosa; ✕ nell'intestazione;
  Esc chiede «Vuoi scartare le modifiche?».

**Errori che si leggono**
- Gli avvisi d'errore restano finché non li chiudi, con «Copia» e «Dettagli», in alto a destra (non coprono più la
  console).
- **Attività** nella barra di stato: il registro di tutti gli avvisi ed errori della sessione, con il pallino rosso.
- Un pannello che va in errore mostra «Il pannello si è bloccato — Riapri» invece di una finestra bianca.

**I pannelli al loro posto**: chiusa la scheda Benvenuto, un file aperto dall'albero (o una differenza di Git, il
designer, un diagramma) va al centro, non più nella colonna di sinistra.

**Assistente AI**
- Formule scritte in LaTeX nelle risposte (frecce, potenze, frazioni) mostrate come simboli: →, n², a/b.
- I suggerimenti per cominciare parlano del file aperto («Cosa fa main.py?»), degli errori e delle righe selezionate,
  nel linguaggio giusto.
- Un solo suggerimento in grigio per i file e per la Scrittura rapida, ora anche in Python, C, C++, C#, Java e Rust.

**Tutti i linguaggi anche nei progetti**: i file .py, .c, .cpp, .cs, .java e .rs si aprono nell'editor, colorati, con
le parole chiave e i modelli rapidi.

**Guide**
- **Percorsi guidati** (Aiuto → Percorsi guidati): «La tua prima pagina web» (proposto al primo avvio), «Il tuo primo
  programma», «Disegna una pagina senza codice». Il passo va avanti da solo quando fai l'azione vera.
- **Cosa fare adesso** nel Benvenuto: errori da guardare, file da salvare, «premi Esegui», il designer, la Scrittura
  rapida, i corsi, l'assistente da installare.
- **Glossario** della programmazione con la ricerca (variabile, ciclo, selettore, DOM, compilatore…) e **F1** con
  l'aiuto della parte in cui sei.

## 1.4.0 — 2026-11-13

**Assistente AI nella colonna destra** (Ctrl+Alt+B), come la chat di VS Code: si allarga e si stringe, conosce
il file aperto o le righe selezionate, ogni blocco di codice si applica al documento col confronto prima/dopo;
comandi `/spiega /correggi /commenta /test /errore`.

**Vista affiancata grafica ↔ codice** (Ctrl+Alt+K) nel designer, nei blocchi e nei nodi.

**Designer**
- Un elemento lasciato nello spazio vuoto di un contenitore ci entra dentro; anteprima del trascinamento,
  contenitore di arrivo evidenziato, etichetta «dentro … › dopo …», scorrimento automatico, Esc annulla.
- Tavola libera: gli elementi non escono più dai bordi; tirati fuori tornano nella pagina, portati dentro
  diventano liberi.
- Zoom del canvas (Ctrl+rotellina, Ctrl+0, Ctrl+1, spazio + trascina).
- Pagine intere a tutta larghezza, colori che seguono il tema, segnaposto locali, Riempi/Adatta delle immagini.
- Design kit: tema dal tuo colore, scala del testo, 6 coppie di caratteri OFL incluse, contrasto con
  «Correggi», 56 icone.
- «Ritocchi consigliati» con correzione a un clic.

**Albero dei file sempre raggiungibile**: designer, blocchi, nodi, diagrammi e Scrittura rapida non
ingrandiscono più il pannello; Ctrl+B / Ctrl+J; file e cartelle trascinabili; tastiera (frecce, Invio, F2, Canc).

**Nodi**: un filo per uscita di flusso, Ctrl+Z / Ctrl+Y, fili ricollegabili, filo nel vuoto che apre il menu,
la vista non salta più a ogni nodo aggiunto.

**Altro**: chiusura senza perdere lavoro, progetti recenti senza errori, dialoghi accessibili, pagine del sito
nel designer, sito pronto da pubblicare (ZIP), visualizzatore di immagini, menu tradotto, finestra stretta
senza parti fuori schermo.

## 1.3.0 — 2026-11-13
Designer più semplice e completo (palette con ricerca, sezioni e pagine pronte, stili pronti, temi),
«Chiedi suggerimento» dal tasto destro.

## 1.2.0 — 2026-11-11
Scrittura rapida in C, C++, C#, Java e Rust con i compilatori del PC.

## 1.1.0 — 2026-11-11
Scrittura rapida senza progetto (JS, TS, Python, SQL, HTML).

## 1.0.0 — 2026-11-11
Prima versione pubblica.
