// Istruzioni di sistema della chat adattate al linguaggio aperto (1.6, come le regole del dialetto di Easey DB 1.1):
// oltre al testo base (i18n `ai.systemPrompt`, risposte brevi), le regole che i modelli piccoli sbagliano più spesso
// in quel linguaggio, così il codice proposto gira davvero nell'IDE (Scrittura rapida compresa). Codice puro.

type Lang = 'it' | 'en'

const NOTES: Record<string, Record<Lang, string[]>> = {
  python: {
    it: ['Python 3, solo la libreria standard: print() con le parentesi, f-string per inserire i valori.', 'input() restituisce sempre testo: int(input()) per i numeri.', 'Rientri di 4 spazi; niente punto e virgola.'],
    en: ['Python 3, standard library only: print() with parentheses, f-strings to insert values.', 'input() always returns text: int(input()) for numbers.', '4-space indentation; no semicolons.']
  },
  javascript: {
    it: ['JavaScript moderno: const e let (mai var), === per confrontare, console.log per scrivere.', 'Nel browser document.querySelector; in Node e nella Scrittura rapida niente document né window.'],
    en: ['Modern JavaScript: const and let (never var), === to compare, console.log to print.', 'In the browser document.querySelector; in Node and in Quick code no document or window.']
  },
  typescript: {
    it: ['TypeScript con tipi espliciti per parametri e valori restituiti; interface per gli oggetti; niente any.'],
    en: ['TypeScript with explicit types for parameters and return values; interface for objects; no any.']
  },
  c: {
    it: ['C17: #include <stdio.h>, int main(void) che finisce con return 0;, printf con \\n alla fine.', 'scanf vuole & davanti alle variabili (non agli array di char); niente librerie fuori dalla standard.'],
    en: ['C17: #include <stdio.h>, int main(void) ending with return 0;, printf with \\n at the end.', 'scanf needs & before variables (not char arrays); standard library only.']
  },
  cpp: {
    it: ['C++20: #include <iostream>, std::cout << … << "\\n"; std::vector e std::string invece degli array C.'],
    en: ['C++20: #include <iostream>, std::cout << … << "\\n"; std::vector and std::string instead of C arrays.']
  },
  csharp: {
    it: ['C# per .NET 10 con istruzioni di primo livello (niente classe Program da scrivere): Console.WriteLine, $"… {x}" per inserire i valori.'],
    en: ['C# for .NET 10 with top-level statements (no Program class to write): Console.WriteLine, $"… {x}" to insert values.']
  },
  java: {
    it: ['Java: una classe pubblica Main con public static void main(String[] args) (o void main() di Java 25); System.out.println; Scanner per leggere.'],
    en: ['Java: a public class Main with public static void main(String[] args) (or Java 25 void main()); System.out.println; Scanner to read input.']
  },
  rust: {
    it: ['Rust: fn main(), println!("{}", x) col punto esclamativo, let mut per ciò che cambia; solo la libreria standard (niente crate).'],
    en: ['Rust: fn main(), println!("{}", x) with the exclamation mark, let mut for what changes; standard library only (no crates).']
  },
  sql: {
    it: ['SQL per SQLite: id INTEGER PRIMARY KEY AUTOINCREMENT, testi uniti con ||, righe con LIMIT n; niente NOW() (usa datetime(\'now\')).'],
    en: ["SQL for SQLite: id INTEGER PRIMARY KEY AUTOINCREMENT, concatenate with ||, rows with LIMIT n; no NOW() (use datetime('now'))."]
  },
  html: {
    it: ['HTML5 valido; il CSS in <style> o in un file .css, il JavaScript in <script> alla fine del body.'],
    en: ['Valid HTML5; CSS in <style> or a .css file, JavaScript in <script> at the end of the body.']
  },
  css: {
    it: ['CSS moderno: flexbox o grid per disporre, variabili --colore per i colori ripetuti.'],
    en: ['Modern CSS: flexbox or grid for layout, --colour variables for repeated colours.']
  }
}

const TITLES: Record<string, string> = { python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', c: 'C', cpp: 'C++', csharp: 'C#', java: 'Java', rust: 'Rust', sql: 'SQL', html: 'HTML', css: 'CSS' }

/** Regole del linguaggio aperto per l'AI (vuoto per i linguaggi senza regole o senza documento). */
export function languageNotes(language: string | null | undefined, lang: Lang = 'it'): string {
  const notes = language ? NOTES[language]?.[lang] : undefined
  if (!notes?.length) return ''
  const title = TITLES[language!] ?? language
  const head = lang === 'it' ? `Linguaggio del documento aperto: ${title}. Scrivi codice che gira così com'è:` : `Language of the open document: ${title}. Write code that runs as it is:`
  return [head, ...notes.map((note) => `- ${note}`)].join('\n')
}

/** Istruzioni di sistema: il testo base, la modalità tutor (se c'è) e le regole del linguaggio aperto. */
export function chatSystemPrompt(base: string, language: string | null | undefined, options: { tutor?: string; lang?: Lang } = {}): string {
  return [base, options.tutor ?? '', languageNotes(language, options.lang)].filter(Boolean).join('\n\n')
}
