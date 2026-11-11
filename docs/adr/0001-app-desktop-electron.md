# ADR 0001 — App desktop Electron con nucleo web

**Stato:** accettata (2026-11-11)

## Contesto
L'IDE deve avere un terminale reale, file su disco, esecuzione di programmi Node e, in seguito,
connessioni a database server (PostgreSQL, MySQL, SQL Server). Nel solo browser questo non è possibile.

## Decisione
Electron 44 + electron-vite + React 19 + TypeScript strict, come le altre app desktop già costruite
(PDF Editor, Capture Studio). L'interfaccia resta pura web dietro il ponte `window.ide`, così un domani
può esistere anche una versione browser con servizi diversi dietro gli stessi contratti.

## Conseguenze
- Installer NSIS da ~150 MB (Electron + Monaco).
- Moduli nativi (node-pty) ed eseguibili (esbuild) vanno tenuti fuori dall'asar.
- Per SQLite si userà `node:sqlite` (incluso in Electron 44, nessun modulo nativo da ricompilare).
