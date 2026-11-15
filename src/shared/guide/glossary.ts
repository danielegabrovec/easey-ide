// Glossario della programmazione in parole semplici (pannello «Glossario», menu Aiuto e pagine F1): una voce per
// termine, in italiano e in inglese, con un esempio. Fonte unica dei termini; la ricerca ignora accenti e maiuscole.

export type GlossaryLanguage = 'it' | 'en'

export interface GlossaryText {
  /** Il nome semplice («Variabile»). */
  plain: string
  explanation: string
  example?: string
}

export interface GlossaryEntry {
  id: string
  /** Il termine tecnico com'è nel codice o nei libri (let, <div>, SELECT…). */
  term: string
  it: GlossaryText
  en: GlossaryText
}

export const GLOSSARY: GlossaryEntry[] = [
  { id: 'variabile', term: 'let / var / =', it: { plain: 'Variabile', explanation: 'Una scatola con un nome in cui il programma tiene un valore che può cambiare.', example: 'let punti = 0; punti = punti + 10' }, en: { plain: 'Variable', explanation: 'A named box where the program keeps a value that can change.', example: 'let points = 0; points = points + 10' } },
  { id: 'costante', term: 'const', it: { plain: 'Costante', explanation: 'Come una variabile, ma il valore non si può riassegnare dopo averlo scritto.', example: 'const PI = 3.14' }, en: { plain: 'Constant', explanation: 'Like a variable, but the value cannot be reassigned once written.', example: 'const PI = 3.14' } },
  { id: 'tipo', term: 'number, string, boolean…', it: { plain: 'Tipo di dato', explanation: 'Che genere di valore è: un numero, un testo (stringa), vero/falso, un elenco… Il tipo decide cosa ci puoi fare.', example: '"ciao" è una stringa, 42 è un numero' }, en: { plain: 'Data type', explanation: 'What kind of value it is: a number, a text (string), true/false, a list… The type decides what you can do with it.', example: '"hello" is a string, 42 is a number' } },
  { id: 'stringa', term: 'string / "…"', it: { plain: 'Stringa', explanation: 'Un testo fra virgolette. Si può unire ad altri testi e misurare.', example: '"Ciao " + nome' }, en: { plain: 'String', explanation: 'A piece of text in quotes. It can be joined with other text and measured.', example: '"Hello " + name' } },
  { id: 'funzione', term: 'function / def', it: { plain: 'Funzione', explanation: 'Un pezzo di codice con un nome che si scrive una volta e si usa quando serve; può ricevere dati e restituire un risultato.', example: 'function doppio(n) { return n * 2 }' }, en: { plain: 'Function', explanation: 'A named piece of code written once and used whenever needed; it can receive data and return a result.', example: 'function double(n) { return n * 2 }' } },
  { id: 'parametro', term: 'parametro / argomento', it: { plain: 'Parametro', explanation: 'Il dato che una funzione riceve fra parentesi. Il valore che le passi quando la chiami si dice argomento.', example: 'doppio(5): 5 è l’argomento, n il parametro' }, en: { plain: 'Parameter', explanation: 'The data a function receives in brackets. The value you pass when calling it is the argument.', example: 'double(5): 5 is the argument, n the parameter' } },
  { id: 'condizione', term: 'if / else', it: { plain: 'Condizione', explanation: 'Fa una cosa solo se una domanda è vera, altrimenti un’altra.', example: 'if (eta >= 18) { … } else { … }' }, en: { plain: 'Condition', explanation: 'Does something only if a question is true, otherwise something else.', example: 'if (age >= 18) { … } else { … }' } },
  { id: 'ciclo', term: 'for / while', it: { plain: 'Ciclo', explanation: 'Ripete le stesse istruzioni più volte: un certo numero di volte (for) o finché una condizione resta vera (while).', example: 'for (let i = 1; i <= 10; i++) console.log(i)' }, en: { plain: 'Loop', explanation: 'Repeats the same instructions several times: a set number of times (for) or while a condition stays true (while).', example: 'for (let i = 1; i <= 10; i++) console.log(i)' } },
  { id: 'array', term: 'array / lista / [ ]', it: { plain: 'Array (lista)', explanation: 'Un elenco ordinato di valori; ognuno ha una posizione (indice) che parte da 0.', example: 'const frutti = ["mela", "pera"]; frutti[0] è "mela"' }, en: { plain: 'Array (list)', explanation: 'An ordered list of values; each has a position (index) starting from 0.', example: 'const fruit = ["apple", "pear"]; fruit[0] is "apple"' } },
  { id: 'oggetto', term: 'oggetto / dizionario / { }', it: { plain: 'Oggetto', explanation: 'Un insieme di coppie nome → valore che descrivono una cosa.', example: '{ nome: "Anna", eta: 12 }' }, en: { plain: 'Object', explanation: 'A set of name → value pairs that describe one thing.', example: '{ name: "Anna", age: 12 }' } },
  { id: 'classe', term: 'class', it: { plain: 'Classe', explanation: 'Lo stampo per creare oggetti dello stesso tipo, con i loro dati e le loro funzioni (metodi).', example: 'class Cane { abbaia() { … } }' }, en: { plain: 'Class', explanation: 'The mould for creating objects of the same kind, with their data and functions (methods).', example: 'class Dog { bark() { … } }' } },
  { id: 'tag', term: '<p>, <h1>, <div>', it: { plain: 'Tag HTML', explanation: 'Le etichette fra parentesi angolari che dicono al browser cos’è ogni parte della pagina: un titolo, un paragrafo, un’immagine…', example: '<h1>Il mio sito</h1>' }, en: { plain: 'HTML tag', explanation: 'The labels in angle brackets that tell the browser what each part of the page is: a heading, a paragraph, an image…', example: '<h1>My site</h1>' } },
  { id: 'attributo', term: 'id, class, src, href', it: { plain: 'Attributo', explanation: 'Un’informazione in più scritta dentro un tag, come il nome di un’immagine o un link.', example: '<img src="gatto.png" alt="Un gatto">' }, en: { plain: 'Attribute', explanation: 'Extra information written inside a tag, like an image file or a link.', example: '<img src="cat.png" alt="A cat">' } },
  { id: 'selettore', term: 'h1, .classe, #id', it: { plain: 'Selettore CSS', explanation: 'Dice a quali elementi della pagina si applica uno stile: per tag, per classe (.) o per id (#).', example: '.pulsante { color: white; }' }, en: { plain: 'CSS selector', explanation: 'Tells which page elements a style applies to: by tag, by class (.) or by id (#).', example: '.button { color: white; }' } },
  { id: 'dom', term: 'DOM / document', it: { plain: 'DOM', explanation: 'La pagina vista da JavaScript: un albero di elementi che il codice può leggere e cambiare.', example: 'document.querySelector("#titolo").textContent = "Ciao"' }, en: { plain: 'DOM', explanation: 'The page as JavaScript sees it: a tree of elements the code can read and change.', example: 'document.querySelector("#title").textContent = "Hi"' } },
  { id: 'evento', term: 'click, input, addEventListener', it: { plain: 'Evento', explanation: 'Qualcosa che succede nella pagina (un clic, un tasto) a cui il codice può rispondere.', example: 'pulsante.addEventListener("click", saluta)' }, en: { plain: 'Event', explanation: 'Something that happens on the page (a click, a key press) that code can respond to.', example: 'button.addEventListener("click", greet)' } },
  { id: 'console', term: 'console.log / print', it: { plain: 'Console', explanation: 'Il posto dove il programma scrive messaggi per chi lo sta costruendo: serve a vedere i valori e a capire gli errori.', example: 'console.log("punti:", punti)' }, en: { plain: 'Console', explanation: 'Where the program writes messages for its builder: useful to see values and understand errors.', example: 'console.log("points:", points)' } },
  { id: 'terminale', term: 'terminale / PowerShell', it: { plain: 'Terminale', explanation: 'Una finestra in cui si scrivono comandi al computer; i programmi senza pagina web leggono e scrivono qui.', example: 'node main.js' }, en: { plain: 'Terminal', explanation: 'A window where you type commands to the computer; programs without a web page read and write here.', example: 'node main.js' } },
  { id: 'compilatore', term: 'gcc, javac, rustc', it: { plain: 'Compilatore', explanation: 'Il programma che traduce il codice (C, C++, C#, Java, Rust) in un programma eseguibile e segnala gli errori prima di partire.', example: 'gcc main.c -o main' }, en: { plain: 'Compiler', explanation: 'The program that translates code (C, C++, C#, Java, Rust) into an executable program and reports errors before it starts.', example: 'gcc main.c -o main' } },
  { id: 'sintassi', term: 'SyntaxError', it: { plain: 'Errore di sintassi', explanation: 'Il codice non è scritto secondo le regole del linguaggio (una parentesi o una virgoletta che manca): il programma non parte.', example: 'console.log("ciao"   ← manca la )' }, en: { plain: 'Syntax error', explanation: 'The code does not follow the language rules (a missing bracket or quote): the program does not start.', example: 'console.log("hi"   ← missing )' } },
  { id: 'eccezione', term: 'TypeError, Exception', it: { plain: 'Errore durante l’esecuzione', explanation: 'Il programma è partito ma a un certo punto fa una cosa impossibile (usare qualcosa che non esiste): si ferma e dice la riga.', example: 'undefined is not a function' }, en: { plain: 'Runtime error', explanation: 'The program started but at some point does something impossible (using something that does not exist): it stops and shows the line.', example: 'undefined is not a function' } },
  { id: 'debug', term: 'debug / passo-passo', it: { plain: 'Esecuzione passo-passo', explanation: 'Far andare il programma una riga alla volta guardando le variabili, per capire dove sbaglia.', example: 'Esegui passo passo (Ctrl+F10)' }, en: { plain: 'Step-by-step run', explanation: 'Running the program one line at a time while watching the variables, to find where it goes wrong.', example: 'Run step by step (Ctrl+F10)' } },
  { id: 'promise', term: 'Promise / async / await', it: { plain: 'Promise (attesa)', explanation: 'Un risultato che arriverà più tardi (da Internet, da un file); con await il codice aspetta senza bloccare la pagina.', example: 'const dati = await fetch(indirizzo)' }, en: { plain: 'Promise (waiting)', explanation: 'A result that will arrive later (from the Internet, a file); with await the code waits without freezing the page.', example: 'const data = await fetch(url)' } },
  { id: 'modulo', term: 'import / export', it: { plain: 'Modulo', explanation: 'Un file di codice che mette a disposizione funzioni ad altri file, che le prendono con import.', example: 'import { somma } from "./calcoli.js"' }, en: { plain: 'Module', explanation: 'A code file that makes functions available to other files, which take them with import.', example: 'import { sum } from "./maths.js"' } },
  { id: 'query', term: 'SELECT … FROM …', it: { plain: 'Query SQL', explanation: 'Una domanda scritta in SQL a un database: quali righe, di quali tabelle, in che ordine.', example: 'SELECT nome FROM clienti WHERE citta = \'Trieste\'' }, en: { plain: 'SQL query', explanation: 'A question written in SQL to a database: which rows, from which tables, in what order.', example: 'SELECT name FROM customers WHERE city = \'Trieste\'' } },
  { id: 'commit', term: 'git commit', it: { plain: 'Commit (Git)', explanation: 'Una fotografia salvata del progetto con una frase che dice cosa è cambiato; si può sempre tornare indietro.', example: '«Aggiunto il menu»' }, en: { plain: 'Commit (Git)', explanation: 'A saved snapshot of the project with a sentence saying what changed; you can always go back.', example: '“Added the menu”' } }
]

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Voci con il testo nella lingua scelta, filtrate dalla ricerca (nome, termine, spiegazione, esempio). */
export function searchGlossary(query: string, language: GlossaryLanguage): (GlossaryText & { id: string; term: string })[] {
  const needle = fold(query.trim())
  return GLOSSARY.map((entry) => ({ id: entry.id, term: entry.term, ...entry[language] }))
    .filter((entry) => !needle || fold(`${entry.plain} ${entry.term} ${entry.explanation} ${entry.example ?? ''}`).includes(needle))
    .sort((a, b) => a.plain.localeCompare(b.plain, language))
}

export function glossaryEntry(id: string): GlossaryEntry | undefined {
  return GLOSSARY.find((entry) => entry.id === id)
}
