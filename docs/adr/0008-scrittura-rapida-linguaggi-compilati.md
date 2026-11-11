# ADR 0008 — Scrittura rapida: C, C++, C#, Java e Rust

**Stato:** accettata (2026-11-11)

## Contesto
Dopo JavaScript, TypeScript, Python, SQL e HTML ([ADR 0007](0007-scrittura-rapida.md)) servivano per le
esercitazioni anche C, C++, C#, Java e Rust, sempre senza progetto.

## Decisioni
- **Compilatori del PC, non inclusi nell'app.** GCC, JDK, .NET SDK e Rust pesano centinaia di MB ciascuno;
  le alternative in WebAssembly (clang/tcc, JVM, Roslyn in WASM) sono incomplete o enormi. `NativeToolchains`
  (`services/quick/native-runner.ts`) li cerca nel PATH del processo, nel PATH del registro (programmi installati
  dopo l'avvio dell'IDE) e nelle cartelle note (MSYS2, WinLibs di winget, `%USERPROFILE%\.cargo\bin`, JDK in
  Programmi, `JAVA_HOME`, `Program Files\dotnet`). Se manca, il renderer mostra il comando **winget** da copiare
  (`TOOLCHAIN_INSTALL`) e «Ricontrolla»: l'IDE non installa nulla da solo.
- **Come si esegue** (cartella temporanea per linguaggio, mai attraverso una shell):
  - C: `gcc -std=c17 -g -O0 -Wall … -static -lm`; C++: `g++ -std=c++20 … -static` (statico = niente DLL di MSYS2 da trovare);
  - Rust: `rustc --edition 2024|2021 -g --error-format=short` (edizione dalla versione di rustc);
  - C#: `dotnet build app.cs` (file-based app di **.NET 10**, istruzioni di primo livello) con `-p:PublishAot=false`,
    poi l'eseguibile prodotto; telemetria disattivata; in coda al file un `ModuleInitializer` mette la console in
    UTF-8 (sotto il codice dell'utente: le righe non cambiano; errori oltre l'ultima riga riportati sull'ultima);
  - Java: lanciatore dei file sorgente `java Main.java` (JDK 11+; con Java 25 anche il `void main()` compatto),
    con `-Dstdout.encoding=UTF-8`. Il tempo massimo ha 4 s in più (compila in memoria).
- **Fasi e tempi**: la compilazione ha un limite largo (180 s, la prima build .NET è lenta), il tempo massimo
  dell'utente parte con il programma; Ferma e il tempo scaduto chiudono l'**albero** dei processi (`taskkill /T`).
- **Errori sulle righe**: lettura dell'output dei compilatori (`shared/quick/native.ts`) per gcc, rustc (formato
  breve), javac, C#; crash a runtime: panic di Rust e eccezioni Java/C# con la riga, codici NTSTATUS di Windows
  spiegati in italiano (accesso a memoria non valida, stack overflow, divisione per zero…). Gli errori di
  compilazione si segnano accanto alle righe anche nell'esecuzione automatica (pausa più lunga: 1,3 s).
- **Input da tastiera**: riquadro «Input» per Python e i linguaggi nativi (`QuickRunRequest.stdin`); in Python
  `input()` legge quelle righe e, finite, dà `EOFError` con la spiegazione.
- **Aiuto alla scrittura**: Monaco non ha servizi di completamento per questi linguaggi (né per Python): parole
  chiave e modelli rapidi in `shared/quick/snippets.ts` (modelli dal livello Intermedio), più l'AI come per gli altri.
- Niente valori accanto alle righe per i linguaggi compilati (servirebbe strumentarli uno per uno): si mostrano
  le stampe nell'ordine, gli errori e i crash sulle righe.

## Conseguenze
- L'installer non cresce. Chi non ha i compilatori vede come installarli; i collaudi saltano i linguaggi assenti.
- Collaudo: `tests/unit/quick-native.test.ts` (lettura degli errori + integrazione vera con i 5 compilatori:
  input, errori, crash, ciclo infinito), `tests/e2e/quick-native.mjs` (22 controlli, `LAB_IDE_NO_TOOLCHAINS=rust`
  per la scheda d'installazione).
