# ADR 0006 — Crescita: passo-passo, Git, esportazione, fornitori AI

**Stato:** accettata (2026-11-11)

## Esecuzione passo-passo (stile "Python Tutor")
- **Strumentazione testuale** del sorgente (`src/shared/trace/instrument.ts`, Babel solo per leggere
  l'AST): prima di ogni istruzione `__s(riga, () => [["x", () => x, ambito]…])`; ogni funzione avvolta
  da `__e(nome) try { … } finally { __x() }` per la pila. Le inserzioni sono per posizione, quindi
  TypeScript resta TypeScript (i tipi li toglie esbuild dopo) e le righe sono quelle del file.
- I getter in `try/catch` mostrano «non ancora inizializzata» per la zona morta di `let/const`.
  Senza `import` si usa `esbuild.transform` (il bundle trasformerebbe i `const` globali in `var`).
- Esecuzione in `node:vm` nel main con 3000 passi al massimo e 4 s di tempo: i cicli infiniti si
  fermano con un messaggio. Valori mostrati come anteprime testuali (`util.inspect`).
- Limiti noti: funzioni `async`/generatori tracciate solo come istruzioni (niente pila), nessun
  "valore restituito", moduli di Node non disponibili.

## Git
- Si usa il `git` di sistema con `execFile` (argomenti separati, niente shell). Se manca, il pannello
  lo dice con il link per installarlo. Il commit fa `add -A`; senza identità configurata usa il nome
  utente del PC (`-c user.name=…`), così chi impara non si blocca al primo commit.
- Differenze: `git show HEAD:./percorso` contro il file su disco, nel diff editor di Monaco.

## Esportazione
- ZIP scritto in casa (`services/export/zip.ts`, deflate di zlib + CRC32): nessuna dipendenza.
- Pagina HTML unica: CSS collegati → `<style>`, script locali impacchettati con esbuild (TS e import),
  immagini piccole → data URI. `absWorkingDir` = progetto, così nei commenti non finiscono percorsi del disco.

## Fornitori AI
- `AiProvider` resta l'unico contratto; `AiService` riceve una funzione che sceglie il fornitore a ogni
  richiesta (Ollama o compatibile OpenAI), così il cambio nelle impostazioni vale subito.
- Compatibile OpenAI: `/v1/models`, `/v1/chat/completions` in SSE (anche `reasoning_content`),
  `/v1/completions` con `suffix` per l'autocompletamento. La chiave API, facoltativa, resta nelle
  impostazioni locali.
- Lo stato dei modelli usa un numero di sequenza: una risposta lenta del server precedente non
  sovrascrive quella del server appena scelto.
