# Novità di Easey IDE

## 0.1.0 — 2026-11-18

**Nuova numerazione.** Easey IDE è ancora in costruzione: le versioni ripartono da 0.1 e arriveranno alla 1.0 quando
sarà pronto da rilasciare davvero. Le vecchie versioni 1.x non sono più pubblicate.

**Tela libera stile Figma (designer)**
- **Righelli** in alto e a sinistra con il mirino del cursore; trascinando dal righello metti delle **guide** (restano
  solo nell'editor, non nella pagina) a cui gli elementi si agganciano.
- **Aggancio a più guide insieme** (bordi e centri degli elementi vicini e del contenitore), a **distanze uguali** e
  anche **mentre ridimensioni**; le distanze in px compaiono mentre sposti, e con Alt sopra un altro elemento.
- **Strumenti di disegno**: Seleziona V, Mano H, Tavola F, Rettangolo R, Ellisse O, Testo T, Bottone B, Immagine I
  (un clic = misura base, trascinando = la misura che disegni).
- **Allinea, distribuisci, stessa larghezza/altezza** in cima all'ispettore; per gli elementi in fila «Mettili liberi
  e allinea», senza salti.
- **Livelli** (porta avanti/indietro, in primo piano, in fondo), **maniglia di rotazione** (Maiusc = scatti di 15°),
  **occhio e lucchetto** nei Livelli (solo nell'editor).
- **Da libero a layout**: gli elementi messi a mano diventano righe, colonne o griglia che si adattano allo schermo
  (Ctrl+Z torna com'era).

**Studio 3D (Three.js)**
- File `*.scene3d.json` (menu Crea, tasto destro in Esplora): vista 3D con orbita, maniglie sposta/ruota/scala (W/E/R),
  albero degli oggetti con i gruppi, ispettore (posizione, materiale, luci, animazioni, sfondo e nebbia), scene pronte,
  annulla/ripeti, «Mostra codice» e «Salva immagine»; senza scheda grafica un'anteprima 2D.
- Blocco **Scena 3D** nella Tavolozza: la scena entra nella pagina e gira nell'Anteprima; Three è copiato nel progetto
  (`vendor/three`), niente internet.
- Parti comuni con IDE Next nei kit condivisi `src/shared/canvas-kit/` e `src/shared/scene3d/`.

**Una schermata iniziale vera** (richiesta del titolare: «quelle presenti sono pessime»; stesso disegno di Easey DB e
IDE Next). Senza progetto aperto occupa **tutta la finestra**: niente più pannello «Benvenuto» schiacciato fra
Esplora, Anteprima e Console vuote. Appena apri o crei un progetto torna la disposizione di lavoro com'era; il
**logo** in alto (o «Schermata iniziale» nel menu Aiuto) la riporta, con «Torna a «progetto»» ed Esc.
- In alto: nome, versione, stato dell'AI locale, «Cosa costruiamo oggi?» e un disegno vero dell'idea dell'app (il
  codice a sinistra e la pagina che funziona a destra).
- **Tre strade**: Nuovo progetto, Apri cartella, Corsi ed esercizi; sotto «Oppure» Scrittura rapida, Laboratorio,
  Percorsi guidati, Tutti i comandi con le scorciatoie.
- **Riprendi da dove eri rimasto**: i progetti recenti con quando («ieri, 18:40», «lunedì», «12 novembre») e «Apri».
- **Impara**: il Manuale con l'avanzamento vero, l'invito al primo percorso (poi i percorsi guidati fatti), le novità.
- I modelli di progetto in una riga; tema chiaro e scuro; da 1024×700 in su senza testo spezzato.
- L'assistente AI non copre la schermata: si apre col nuovo pulsante «AI» nella barra.
- Con un progetto aperto e nessun file, al centro c'è «Inizio» (Esegui, Apri un file, strumenti visuali).
- Parte comune con IDE Next nel kit condiviso `src/shared/start-kit/`.

## Prima della 0.1 (vecchia numerazione)

Fino al 15/11/2026 le versioni erano numerate 1.x; quelle release non sono più pubblicate.

## 1.6.0 — 2026-11-15

Ciò che Easey DB ha fatto nella 1.1 serve anche qui, più le richieste del titolare sul designer.

**Designer: metti le cose dove vuoi**
- **Sposta liberamente** (pulsante nella barra del designer, ricordato): trascini un elemento e resta esattamente dove
  lo lasci, nel contenitore sotto il puntatore, che fa da riferimento e non si accorcia. Poi lo sposti trascinandolo
  (guide magnetiche), con le frecce (Maiusc = 10 px), con X/Y nel pannello «Posizione libera». Alt = in fila come prima.
- Tasto destro: **Mettilo dove vuoi** (libero dov'è) e **Rimetti in fila**.
- **Rettangolo di selezione**: trascinando sullo sfondo prendi tutti gli elementi che ci stanno dentro; **Maiusc o
  Ctrl + clic** aggiunge e toglie. Gli stili cambiati valgono per tutti gli scelti, Canc li toglie tutti, quelli liberi
  si spostano insieme.

**Laboratorio** (pulsante nella barra, menu Visualizza): la disposizione per esercitarsi, come il Laboratorio SQL di
Easey DB. Al centro la Scrittura rapida con sopra gli **esempi da provare** nei dieci linguaggi (clic = lo scrive, ▶ =
lo scrive e lo esegue), sotto **Output**, Console, Terminale e Problemi, a sinistra Raccolta e File, a destra le
**Esecuzioni** (clic = di nuovo nell'editor, doppio clic = di nuovo eseguito) sopra l'**Assistente AI**. Tornando
alla Standard i documenti aperti restano. Percorso guidato «Il laboratorio».

**Tasto destro completo nell'albero dei file**: gruppi e sottomenu (Apri con, Esegui, Chiedi all'AI, Nuovo, Copia
percorso/percorso completo/nome), Duplica, Apri il terminale qui, Espandi/Comprimi; le voci spente dicono perché;
da tastiera con Maiusc+F10 o il tasto Menu, frecce, → per i sottomenu.

**Completamento e AI**
- Il suggerimento in grigio usa il formato giusto per i modelli da codice (riempimento al centro) e una finestra
  attorno al cursore; mai nei commenti né a metà parola; su una riga vuota solo dentro un blocco o sotto un commento
  che dice cosa vuoi.
- **Parole sbagliate** (pritn, consle, Sytem, retrun, FORM…) sottolineate con «Forse volevi scrivere…»: **Ctrl+.** le
  corregge, in Python, JavaScript, C, C++, C#, Java, Rust e SQL, nei file e nella Scrittura rapida.
- Chat: risposte brevi con le regole del linguaggio aperto; conosce il codice della Scrittura rapida (niente più
  «nessun file aperto»); frecce e confronti LaTeX diventano simboli anche senza dollari.

**Aprire un file o una cartella da fuori** (per «Apri in Easey IDE» di Easey DB): `Easey IDE.exe <percorso>` apre
una cartella come progetto, un file del progetto nell'editor, un file .py/.js/.sql… fuori dal progetto nella
Scrittura rapida; con l'app già aperta il percorso arriva alla finestra che c'è. Le opzioni di Electron e Chromium
si ignorano.

**Guida e Manuale separati**: la **Guida** (pulsante nella barra) spiega come si usa Easey IDE e lo dice in cima; il
**Manuale** (pulsante suo, Ctrl+Alt+L) è per imparare un linguaggio: corsi e manuali della Collana.

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
