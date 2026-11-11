# ADR 0003 — Anteprima web con il protocollo `ide-preview://`

**Stato:** accettata (2026-11-11)

## Contesto
Chi impara scrive pagine con script classici (`onclick="saluta()"`, funzioni globali) e moduli
TypeScript con `import`. L'anteprima deve comportarsi come un browser vero e riportare gli errori
sulla riga giusta del file originale.

## Decisione
- Il main registra lo schema privilegiato `ide-preview://project/…` che serve i file del progetto aperto.
- HTML: servito com'è con lo **script ponte** iniettato come primo figlio di `<head>`
  (`/__ide__/bridge.js`): cattura console, errori, promesse rifiutate e li invia con `postMessage`.
- TS/TSX/JSX: **un file alla volta** con `esbuild.transform` (niente bundle, come fa il browser con i
  moduli) + source map; il renderer riporta le posizioni sul sorgente con `SourceMapReader`.
- JS e CSS: serviti invariati (le funzioni globali degli script classici restano globali).
- Risoluzione "da bundler": `./modulo` e `./modulo.js` trovano anche `modulo.ts`.
- Import di pacchetti npm → `https://esm.sh/<pacchetto>` (serve la rete).
- L'iframe ha `allow-scripts allow-same-origin`: l'origine `ide-preview://project` è diversa da quella
  dell'IDE, quindi la pagina non può toccare l'IDE, ma gli errori degli script non vengono oscurati
  ("Script error.") e `localStorage` funziona.
- Un file che non compila diventa un modulo che segnala l'errore e lancia un'eccezione marcata
  `[errore di compilazione]`, che il ponte non riporta due volte.

## Conseguenze
- Nessun controllo dei tipi all'esecuzione (come Vite): gli errori di tipo stanno nel pannello Problemi.
