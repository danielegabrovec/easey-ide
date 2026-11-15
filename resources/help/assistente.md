# L'assistente AI

L'assistente gira **sul tuo PC** (Ollama o LM Studio): niente del tuo codice esce dal computer.

- **Ctrl+Alt+B** mostra o nasconde la colonna; **Ctrl+Maiusc+A** porta il cursore nella casella.
- Sa quale file hai aperto e quali righe hai selezionato (i «chip» sopra la casella); con errori nel file li legge.
- Scrivi **/** per i comandi rapidi: `/spiega`, `/correggi`, `/commenta`, `/test`, `/errore`.
- Ogni blocco di codice ha **Applica**: vedi prima/dopo e confermi.
- Il **tutor** (cappello da laureato) ti guida con domande e indizi invece di darti la soluzione.

## Se non risponde

1. Serve **Ollama** installato e avviato (ollama.com): il pulsante «Scarica Ollama» porta alla pagina.
2. Serve almeno un modello: nel terminale `ollama pull qwen2.5-coder:1.5b`.
3. Impostazioni → Assistente AI → **Aggiorna** per ricontrollare.
