# CONVENTION — dove va cosa e come si lavora

Principi: **trovabilità** (un concetto = un posto), **confini stabili** (shell ≠ moduli, si parla solo
via contratti), **consolidamento** (mai due modi di fare la stessa cosa).

## Mappa del repository

| Cartella | Contiene | Non contiene |
|---|---|---|
| `src/shared/contracts/` | Tipi e interfacce condivisi: canali IPC (`ipc.ts`), esecuzione (`runner.ts`), workspace, impostazioni | Codice con effetti |
| `src/shared/*.ts` | Utilità **pure** usate da main e renderer (percorsi, source map, stack) | Import di Electron, React o Node |
| `src/main/index.ts` | Ciclo di vita dell'app, finestra, registrazione dei gestori IPC | Logica dei servizi |
| `src/main/ipc/router.ts` | Unico punto di registrazione IPC, con controllo del mittente | — |
| `src/main/services/<servizio>/` | Un servizio nativo per cartella: `workspace`, `preview`, `terminal`, `settings`, `db`, `ai`, `learn`, `trace`, `git`, `export`, `quick` (Scrittura rapida: worker JS/TS e Python come entry di build a sé) | UI |
| `src/preload/` | Ponte `window.ide` con la whitelist dei canali presa dai contratti | Logica |
| `src/renderer/workbench/` | **Shell**: layout dockview, comandi, palette, eventi, stato condiviso, notifiche | Logica di dominio |
| `src/renderer/services/` | Client condivisi da più moduli senza interfaccia (es. `ai-client.ts`: stato di Ollama, chat in streaming) | Componenti |
| `src/renderer/ui/` | Primitive di interfaccia (dialoghi, menu contestuale, Markdown) | Stato di dominio |
| `src/renderer/modules/<modulo>/` | Un modulo per cartella: `explorer`, `editor`, `run-web`, `run-terminal`, `ai-assist`, `sql-lab`, `designer`, `visual-code`, `diagrams`, `learn`, `step-run`, `git`, `quick-code` | Import di altri moduli |
| `src/renderer/modules/index.ts` | **Unico** punto in cui i moduli vengono attivati | — |
| `src/renderer/i18n/` | Testi: `it.ts` (fonte), `en.ts` (stesse chiavi, verificato da TypeScript) | Testi sparsi nei componenti |
| `resources/courses/` | Corsi inclusi nell'app, nel formato pacchetto ([CORSI.md](CORSI.md)) | Codice |
| `tests/unit/` | Vitest su codice puro e servizi senza Electron | — |
| `tests/e2e/` | Collaudo Playwright sull'app Electron vera | — |
| `docs/adr/` | Una decisione architetturale = un file | — |

## Regole

1. **I moduli non si importano a vicenda.** Si parlano con i comandi (`executeCommand('editor.open', …)`)
   e con gli eventi del workbench (`emit('file:saved', …)`). Lo stato condiviso minimo sta in
   `workbench/store.ts`, con il proprietario di ogni campo indicato nel commento.
2. **Ogni azione è un comando** registrato con `registerCommand` (id, titolo, categoria, scorciatoia).
   Menu, palette, pulsanti e tastiera chiamano lo stesso comando: una sola fonte.
3. **Nuovo canale IPC** = una voce in `InvokeChannels`/`EventChannels` + `INVOKE_CHANNELS`/`EVENT_CHANNELS`
   (`src/shared/contracts/ipc.ts`) + il gestore in `src/main/index.ts`. TypeScript segnala ciò che manca.
4. **Percorsi**: fra renderer e main sempre relativi alla radice del progetto, con `/`; il main li
   valida (`WorkspaceService.absolute`) e rifiuta le uscite con `..`.
5. **Zustand**: selettori primitivi o `useShallow` (un selettore che crea un oggetto nuovo manda React
   in ciclo infinito e la finestra resta bianca).
6. **Testi**: mai stringhe nei componenti; chiave in `i18n/it.ts` e `i18n/en.ts`.
7. **Sicurezza**: `contextIsolation` + `sandbox`, niente `nodeIntegration`; il codice dell'utente gira
   nell'iframe `ide-preview://` (origine diversa dall'IDE) o in un processo separato.
8. **Fatto quando**: `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` verdi;
   per i rilasci anche il collaudo sull'exe pacchettizzato.

## Punti di estensione del workbench

- `registerPanel` / `showPanel` (aree: left, center, right, bottom).
- `registerCommand` (+ `palette: false` per i comandi interni con argomenti, es. `editor.getContext`, `editor.replaceRange`, `editor.insertText`;
  + `panel: '<id>'` per una scorciatoia che vale solo con quel pannello attivo e lì vince su quelle generiche,
  es. Ctrl+S / Ctrl+Invio / F5 nella Scrittura rapida).
- `setStatusItem` per una voce nella barra di stato (es. `✦ modello AI`).
- `registerSettingsSection` per una sezione nel dialogo Impostazioni.

## Aggiungere un modulo (es. SQL Lab)

1. `src/shared/contracts/<area>.ts` con le interfacce (es. `DbDriver`) e i canali IPC in `ipc.ts`.
2. `src/main/services/<area>/` con l'implementazione nativa e i suoi test in `tests/unit/`.
3. `src/renderer/modules/<modulo>/index.tsx` con `activate<Modulo>()`: registra pannelli (`registerPanel`)
   e comandi; aggiungerlo in `src/renderer/modules/index.ts`.
4. Testi in `i18n`, scenario "Fatto quando" in `tests/e2e/`.

## Trappole note

- Il main è ESM: niente `__dirname` (si ricava da `import.meta.url`).
- `electron.exe` usato come Node (`ELECTRON_RUN_AS_NODE`) è un'app "grafica": dentro la pseudo-console
  non riceve lo stdin. Per i programmi si usa il Node di sistema se c'è, altrimenti pipe + gestione di riga (ADR 0004).
- esbuild nell'app installata: il binario sta in `app.asar.unpacked`; `ESBUILD_BINARY_PATH` va impostato
  prima di caricare il modulo (`services/esbuild-loader.ts`).
- Gli URI dei modelli Monaco hanno un prefisso per progetto: progetti diversi con `src/main.ts` non
  devono condividere marcatori.
- Worker in `out/main/*.mjs` (Scrittura rapida): importano solo moduli di Node (e `pyodide`), stanno in
  `asarUnpack` e il main li cerca in `app.asar.unpacked`. Un import da `@shared` creerebbe un chunk condiviso dentro asar.
- Monaco mostra le decorazioni `after` su intervalli vuoti solo con `showIfCollapsed`; i modelli della Scrittura
  rapida usano lo schema `quick:` (fuori dai Problemi e dai suggerimenti dei file del progetto).
- Linguaggi compilati della Scrittura rapida: si usano i compilatori del PC (`native-runner.ts`), mai
  attraverso una shell; il PATH dei figli è quello del registro + le cartelle note (MSYS2, `.cargo`, JDK);
  si chiude l'albero dei processi con `taskkill /T`. Java va forzato a UTF-8 (`-Dstdout.encoding`), C# riceve
  in coda al file un `ModuleInitializer` che imposta la console in UTF-8. `LAB_IDE_NO_TOOLCHAINS` simula i mancanti.
- Fermare `npm run dev` prima di `npm run dist`; `release/` e `*.exe` non vanno in git.
