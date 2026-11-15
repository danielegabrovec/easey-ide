// Parole sbagliate nei linguaggi didattici (1.6, come «Volevi dire EXISTS?» di Easey DB): pritn → print,
// consle → console, Sytem → System, retrun → return, esle → else, FORM → FROM… L'editor ne fa un avviso con la
// correzione rapida (Ctrl+.). Regola d'oro: meglio un errore non segnalato che un falso allarme a chi impara, quindi
//   - solo parole a UN ritocco (una lettera in più, in meno, cambiata o due scambiate) da una parola importante;
//   - mai dentro stringhe e commenti, mai sulle COSTANTI in maiuscolo (tranne in SQL);
//   - mai su un nome dichiarato nel file (variabile, funzione, parametro, import, chiave…) né usato 3 volte o più.
// TypeScript non c'è: il suo controllo lo fa già (con la sua correzione). Codice puro.

export interface Typo {
  /** Posizione della parola nel testo. */
  start: number
  end: number
  word: string
  suggestion: string
}

/** Come sono fatti commenti e stringhe: stile C (// e blocchi), Python (# e triple virgolette), SQL (--). */
export type CommentFamily = 'c' | 'python' | 'sql'
type Family = CommentFamily

const COMMON = ['return', 'while', 'else', 'break', 'continue', 'switch', 'case', 'default', 'true', 'false', 'static', 'const']

/**
 * Parole importanti di ogni linguaggio: `free` = scritte da sole (print, return…), `member` = dopo «.», «::» o «->»
 * (console.log, System.out.println). Dopo il punto si propongono solo le seconde: i nomi delle librerie che non
 * conosciamo (t.width, obj.value) non diventano mai «errori».
 */
const DICTIONARY: Record<string, { free: string[]; member: string[] }> = {
  javascript: {
    free: [...COMMON, 'class', 'function', 'console', 'document', 'undefined', 'null', 'typeof', 'async', 'await', 'export', 'import', 'new', 'this', 'let', 'Math', 'JSON', 'setTimeout', 'alert', 'prompt', 'Number', 'String', 'Array', 'Object'],
    member: ['log', 'error', 'warn', 'querySelector', 'querySelectorAll', 'getElementById', 'addEventListener', 'textContent', 'innerHTML', 'length', 'push', 'filter', 'reduce', 'forEach', 'includes', 'parse', 'stringify', 'toUpperCase', 'toLowerCase', 'split', 'join']
  },
  python: {
    free: ['print', 'input', 'range', 'len', 'return', 'while', 'else', 'elif', 'import', 'from', 'class', 'True', 'False', 'None', 'lambda', 'break', 'continue', 'pass', 'sorted', 'enumerate', 'float', 'list', 'dict', 'tuple', 'with', 'open', 'except', 'finally', 'raise', 'global', 'format', 'round', 'abs', 'sum', 'max', 'min', 'isinstance', 'self'],
    member: ['append', 'split', 'join', 'upper', 'lower', 'strip', 'format', 'keys']
  },
  c: {
    free: [...COMMON, 'struct', 'printf', 'scanf', 'include', 'define', 'main', 'void', 'char', 'float', 'double', 'long', 'short', 'unsigned', 'sizeof', 'malloc', 'free', 'strlen', 'strcpy', 'strcmp', 'puts', 'NULL', 'typedef', 'enum'],
    member: []
  },
  cpp: {
    free: [...COMMON, 'struct', 'class', 'include', 'define', 'std', 'cout', 'cin', 'endl', 'vector', 'string', 'main', 'void', 'char', 'float', 'double', 'long', 'auto', 'namespace', 'using', 'nullptr', 'public', 'private', 'template', 'typename', 'printf'],
    member: ['cout', 'cin', 'endl', 'vector', 'string', 'push_back', 'size', 'begin', 'end']
  },
  csharp: {
    free: [...COMMON, 'struct', 'class', 'Console', 'string', 'foreach', 'var', 'new', 'public', 'private', 'void', 'using', 'namespace', 'null', 'bool', 'double', 'decimal', 'char', 'List'],
    member: ['WriteLine', 'Write', 'ReadLine', 'Count', 'Length', 'Parse', 'Add']
  },
  java: {
    free: [...COMMON, 'class', 'System', 'public', 'private', 'protected', 'void', 'main', 'String', 'args', 'new', 'import', 'Scanner', 'boolean', 'double', 'char', 'ArrayList', 'List', 'final', 'extends', 'implements', 'null', 'this'],
    member: ['out', 'println', 'print', 'printf', 'nextInt', 'nextLine', 'length', 'size', 'add', 'get']
  },
  rust: {
    free: ['return', 'while', 'else', 'break', 'continue', 'true', 'false', 'struct', 'println', 'print', 'format', 'loop', 'match', 'impl', 'String', 'Vec', 'vec', 'main', 'mut', 'const', 'static', 'self', 'Self', 'enum', 'trait', 'Some', 'None', 'Option', 'Result', 'use'],
    member: ['push', 'len', 'iter', 'collect', 'unwrap', 'new']
  },
  sql: {
    free: ['SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'DELETE', 'CREATE', 'TABLE', 'ALTER', 'DROP', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT', 'EXISTS', 'BETWEEN', 'PRIMARY', 'FOREIGN', 'REFERENCES', 'DEFAULT', 'UNIQUE', 'INTEGER', 'NULL', 'COUNT', 'UNION', 'INDEX', 'WHEN', 'THEN', 'ELSE', 'CASE', 'LIKE', 'DESC', 'WITH', 'AUTOINCREMENT', 'TEXT', 'REAL'],
    member: []
  }
}

const FAMILY: Record<string, Family> = { javascript: 'c', c: 'c', cpp: 'c', csharp: 'c', java: 'c', rust: 'c', python: 'python', sql: 'sql' }

/** Linguaggi in cui si cercano le parole sbagliate (id di Monaco). */
export const TYPO_LANGUAGES = Object.keys(DICTIONARY)

interface Word {
  text: string
  start: number
  end: number
}

/**
 * Testo con stringhe e commenti sostituiti da spazi (stesse posizioni): ciò che resta è solo codice.
 * Le stringhe non chiuse sulla stessa riga non si considerano stringhe (apostrofi di Rust, testo rotto).
 */
export function codeOnly(text: string, family: Family): string {
  const out = text.split('')
  const blank = (from: number, to: number) => {
    for (let i = from; i < to && i < out.length; i++) if (out[i] !== '\n') out[i] = ' '
  }
  let i = 0
  while (i < text.length) {
    const rest = text.slice(i, i + 3)
    const lineComment = family === 'python' ? rest.startsWith('#') : family === 'sql' ? rest.startsWith('--') : rest.startsWith('//')
    if (lineComment) {
      const end = text.indexOf('\n', i)
      blank(i, end < 0 ? text.length : end)
      i = end < 0 ? text.length : end
      continue
    }
    if (family !== 'python' && rest.startsWith('/*')) {
      const end = text.indexOf('*/', i + 2)
      blank(i, end < 0 ? text.length : end + 2)
      i = end < 0 ? text.length : end + 2
      continue
    }
    if (family === 'python' && (rest === '"""' || rest === "'''")) {
      const end = text.indexOf(rest, i + 3)
      blank(i, end < 0 ? text.length : end + 3)
      i = end < 0 ? text.length : end + 3
      continue
    }
    const char = text[i]!
    const quotes = family === 'c' ? '"\'`' : family === 'sql' ? "'" : '"\''
    if (quotes.includes(char)) {
      // La stringa finisce alla virgoletta uguale non preceduta da \ (i `…` di JavaScript anche su più righe).
      let j = i + 1
      while (j < text.length && text[j] !== char && (char === '`' || text[j] !== '\n')) j += text[j] === '\\' ? 2 : 1
      if (j < text.length && text[j] === char) {
        blank(i, j + 1)
        i = j + 1
        continue
      }
    }
    i++
  }
  return out.join('')
}

function words(code: string): Word[] {
  const out: Word[] = []
  for (const match of code.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) out.push({ text: match[0], start: match.index!, end: match.index! + match[0].length })
  return out
}

/** Nomi dichiarati nel file: variabili, funzioni, parametri, import, chiavi, colonne… (mai da correggere). */
function declaredNames(code: string, language: string): Set<string> {
  const names = new Set<string>()
  const add = (text: string | undefined) => text && names.add(text)
  if (language === 'sql') {
    // Colonne di CREATE TABLE (parola dopo «(» o «,»), nomi delle tabelle e alias (dopo TABLE, FROM, JOIN, INTO, UPDATE, AS).
    for (const m of code.matchAll(/[(,]\s*([A-Za-z_]\w*)/g)) add(m[1]!.toUpperCase())
    for (const m of code.matchAll(/\b(?:TABLE(?:\s+IF\s+NOT\s+EXISTS)?|FROM|JOIN|INTO|UPDATE|AS)\s+([A-Za-z_]\w*)(?:\s+(?:AS\s+)?([A-Za-z_]\w*))?/gi)) {
      add(m[1]!.toUpperCase())
      if (m[2]) add(m[2].toUpperCase())
    }
    return names
  }
  const declarations = /\b(?:def|function|class|fn|let|const|var|struct|enum|interface|type|trait|impl|mut|static|void|int|char|float|double|long|short|bool|boolean|String|string|auto|final|public|private|protected|as|import|use|using|package|namespace|typedef|extends|implements|foreach|except|global|nonlocal|record|val)\s+(?=(?:mut\s+)?\*?&?([A-Za-z_]\w*))/g
  for (const m of code.matchAll(declarations)) add(m[1])
  // Assegnazioni (x = …, x += …, x := …) e, in JavaScript/TypeScript, chiavi degli oggetti (nome: …).
  for (const m of code.matchAll(/([A-Za-z_]\w*)\s*(?:[-+*/%]?=(?!=)|:=)/g)) add(m[1])
  if (language === 'javascript') for (const m of code.matchAll(/([A-Za-z_]\w*)\s*:(?!:)/g)) add(m[1])
  // Parametri: tutto ciò che sta fra le parentesi dopo una funzione dichiarata, o prima di =>.
  for (const m of code.matchAll(/(?:\b(?:def|function|fn)\s+\w+|\b\w+[ \t]+\w+)\s*\(([^()]*)\)/g)) for (const w of m[1]!.matchAll(/[A-Za-z_]\w*/g)) add(w[0])
  for (const m of code.matchAll(/\(([^()]*)\)\s*=>|([A-Za-z_]\w*)\s*=>/g)) {
    if (m[2]) add(m[2])
    for (const w of (m[1] ?? '').matchAll(/[A-Za-z_]\w*/g)) add(w[0])
  }
  // Variabili dei cicli: for x in · for a, b in (for (int i e for (const x of sono già sopra).
  for (const m of code.matchAll(/\bfor\s+\(?\s*([\w\s,()]+?)\s+in\b/g)) for (const w of m[1]!.matchAll(/[A-Za-z_]\w*/g)) add(w[0])
  // Python: from x import a, b · import a, b · lambda a, b:
  for (const m of code.matchAll(/\b(?:import|lambda)\s+([\w\s,.]+)/g)) for (const w of m[1]!.matchAll(/[A-Za-z_]\w*/g)) add(w[0])
  return names
}

/** Una sola modifica (inserimento, cancellazione, sostituzione o scambio di due lettere vicine)? E quale. */
export function oneEdit(a: string, b: string): 'insert' | 'delete' | 'replace' | 'swap' | null {
  if (a === b) return null
  const la = a.length
  const lb = b.length
  if (Math.abs(la - lb) > 1) return null
  if (la === lb) {
    const diff: number[] = []
    for (let i = 0; i < la && diff.length <= 2; i++) if (a[i] !== b[i]) diff.push(i)
    if (diff.length === 1) return 'replace'
    if (diff.length === 2 && diff[1] === diff[0]! + 1 && a[diff[0]!] === b[diff[1]!] && a[diff[1]!] === b[diff[0]!]) return 'swap'
    return null
  }
  const [short, long] = la < lb ? [a, b] : [b, a]
  let i = 0
  while (i < short.length && short[i] === long[i]) i++
  return short.slice(i) === long.slice(i + 1) ? (la < lb ? 'delete' : 'insert') : null
}

function suggestionFor(word: string, dictionary: string[], sql: boolean): string | null {
  const compare = sql ? word.toUpperCase() : word
  for (const entry of dictionary) {
    const edit = oneEdit(compare, entry)
    if (!edit) continue
    // Parole corte: solo lo scambio di due lettere (lgo → log), il resto darebbe troppi falsi allarmi.
    if (edit === 'swap' ? entry.length >= 3 : entry.length >= 4 && compare.length >= 4) return entry
  }
  return null
}

/** La parola viene dopo «.», «::» o «->» (un membro: console.log, std::cout, p->nome)? */
function isMember(code: string, start: number): boolean {
  let i = start - 1
  while (i >= 0 && (code[i] === ' ' || code[i] === '\t')) i--
  return code[i] === '.' || (code[i] === ':' && code[i - 1] === ':') || (code[i] === '>' && code[i - 1] === '-')
}

/** Le parole sbagliate del testo (vuoto per i linguaggi che non si controllano). */
export function findTypos(text: string, language: string): Typo[] {
  const dictionary = DICTIONARY[language]
  const family = FAMILY[language]
  if (!dictionary || !family) return []
  const sql = family === 'sql'
  const known = new Set([...dictionary.free, ...dictionary.member])
  const code = codeOnly(text, family)
  // #include <stdio.h>: il nome del file non è codice.
  const cleaned = family === 'c' ? code.replace(/(#[ \t]*include[ \t]*)<[^>\n]*>/g, (all, head: string) => head + ' '.repeat(all.length - head.length)) : code
  const list = words(cleaned)
  const declared = declaredNames(cleaned, language)
  const counts = new Map<string, number>()
  for (const w of list) counts.set(w.text, (counts.get(w.text) ?? 0) + 1)
  const out: Typo[] = []
  for (const w of list) {
    const key = sql ? w.text.toUpperCase() : w.text
    if (known.has(key) || declared.has(key) || (counts.get(w.text) ?? 0) >= 3) continue
    if (!sql && /^[A-Z0-9_]+$/.test(w.text)) continue
    const member = isMember(cleaned, w.start)
    // In SQL dopo il punto c'è una colonna (t.nome): mai da correggere.
    if (sql && member) continue
    const suggestion = suggestionFor(w.text, member ? dictionary.member : dictionary.free, sql)
    if (!suggestion) continue
    // In SQL la proposta si scrive come la parola (form → from, FORM → FROM).
    const written = sql && w.text === w.text.toLowerCase() ? suggestion.toLowerCase() : suggestion
    out.push({ start: w.start, end: w.end, word: w.text, suggestion: written })
  }
  return out
}
