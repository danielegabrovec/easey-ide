# Note legali — Easey IDE

## Autore e diritti d'autore

**Easey IDE** è stato ideato e realizzato interamente da **Daniele Gabrovec**.

© 2026 Daniele Gabrovec. Tutti i diritti riconosciuti dalla licenza qui sotto.

## Licenza

Easey IDE è software libero distribuito con **licenza MIT** (testo completo nel file [LICENSE](LICENSE)).
In breve, chiunque può usarlo, copiarlo, modificarlo, unirlo ad altri programmi, pubblicarlo,
distribuirlo e venderlo, anche per scopi commerciali, **a condizione di mantenere** in tutte le copie
l'avviso di copyright («Copyright (c) 2026 Daniele Gabrovec») e il testo della licenza.

## Nessuna garanzia

Il software è fornito **«così com'è»**, senza garanzie di alcun tipo, esplicite o implicite. L'autore
non risponde di danni, perdite di dati o altri problemi derivanti dal suo uso. Easey IDE è pensato per
**imparare a programmare**: non è uno strumento certificato per ambienti di produzione.

## Componenti di terze parti

Easey IDE usa componenti open source di altri autori (fra cui Electron, Monaco Editor, React, Blockly,
xterm.js, esbuild, PGlite, React Flow). Ognuno resta proprietà dei rispettivi autori ed è distribuito
con la propria licenza (MIT, Apache 2.0, ISC, BSD e simili): l'elenco completo con i testi delle
licenze è in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), incluso anche nell'installer.

## Marchi

Nomi e marchi citati — fra cui Windows, Visual Studio Code e Monaco (Microsoft), Electron (OpenJS
Foundation), Ollama, LM Studio, Gemma (Google), gpt-oss (OpenAI), Qwen (Alibaba Cloud), SQLite,
PostgreSQL, Git, GitHub — appartengono ai rispettivi proprietari e sono usati solo per indicare la
compatibilità. Easey IDE non è affiliato né approvato da nessuno di loro.

## Intelligenza artificiale locale

- Easey IDE **non contiene modelli di intelligenza artificiale**: si collega a un server installato
  dall'utente (Ollama o un server compatibile con l'API di OpenAI, come LM Studio).
- I modelli scaricati dall'utente hanno **licenze e condizioni d'uso proprie** (per esempio le
  condizioni d'uso di Gemma di Google, la licenza Apache 2.0 di gpt-oss e di molti modelli Qwen):
  rispettarle è responsabilità di chi li scarica e li usa.
- Le risposte dell'AI possono essere **sbagliate, incomplete o non aggiornate**: vanno sempre
  verificate, soprattutto il codice proposto, prima di usarlo.

## Privacy

- Nessuna telemetria, nessun account, nessuna raccolta di dati: l'autore non riceve nulla.
- Progetti, impostazioni, cronologia dei file, corsi e progressi restano sul PC (cartella del
  progetto, `Documenti\Easey IDE` e `%APPDATA%\Easey IDE`).
- Easey IDE si collega alla rete solo in questi casi:
  1. **AI**: all'indirizzo del server configurato (predefinito `127.0.0.1`, cioè il PC stesso). Se
     l'utente indica un server remoto o sceglie un modello «cloud» di Ollama, i testi inviati
     all'assistente (domande, codice, errori) escono dal PC verso quel servizio.
  2. **Anteprima web**: se una pagina importa un pacchetto npm (es. `import x from 'lodash'`) il
     pacchetto viene scaricato da `esm.sh`; le pagine dell'utente caricano inoltre le risorse
     internet che contengono (i blocchi pronti del designer usano immagini segnaposto da `picsum.photos`).
  3. **Collegamenti** (installare Ollama o Git): si aprono nel browser predefinito.
- Git lavora solo in locale: Easey IDE non invia nulla a GitHub o ad altri server.

## Codice eseguito

I programmi scritti dall'utente (anteprima, terminale, verifica degli esercizi, esecuzione passo
passo) girano sul PC con i permessi dell'utente. La verifica e il passo-passo limitano tempo e moduli
disponibili, ma **non sono una sandbox di sicurezza**: eseguire solo codice di cui ci si fida.

## Contenuti didattici

Il corso incluso («Primi passi») fa parte di Easey IDE ed è distribuito con la stessa licenza MIT.
L'importatore dei manuali legge cartelle presenti sul PC dell'utente: i contenuti importati restano
dei rispettivi autori e non vengono distribuiti con l'app.

## Contatti

Segnalazioni e proposte: <https://github.com/danielegabrovec/easey-ide/issues>
