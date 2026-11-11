# ADR 0004 — Esecuzione dei programmi JS/TS nel terminale

**Stato:** accettata (2026-11-11)

## Contesto
"Esegui nel terminale" deve funzionare anche su un PC senza Node.js installato e supportare l'input
interattivo (`readline`), TypeScript, import fra file e top-level await.

## Decisione
1. Lo script viene compilato con `esbuild.build` (bundle, `platform: node`, `format: esm`,
   `packages: external`, source map inline) in un `.mjs` temporaneo e lanciato con `--enable-source-maps`
   (gli errori indicano il file .ts originale).
2. **Runtime**: se nel sistema c'è Node ≥ 18 si usa quello, dentro node-pty (TTY completo: colori,
   tasti freccia, `setRawMode`). Altrimenti si usa il Node incluso in Electron (`ELECTRON_RUN_AS_NODE=1`).
3. Il Node di Electron è un eseguibile "grafico" di Windows: dentro una pseudo-console stampa (se
   lanciato tramite `cmd /c`) ma **non riceve lo stdin**. Per questo, in quel caso, si usano le pipe e
   l'IDE fa la disciplina di riga (eco, Backspace, Invio, Ctrl+C, Ctrl+D).
4. `LAB_IDE_FORCE_BUNDLED_NODE=1` forza il ripiego: il collaudo e2e prova entrambe le strade.

## Conseguenze
- Senza Node installato i programmi che usano `setRawMode` (menu a frecce) non funzionano e
  `console.log` di oggetti non è colorato. Possibile evoluzione: includere `node.exe` nell'installer.
