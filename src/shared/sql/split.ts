// Divide uno script SQL in istruzioni, rispettando stringhe, identificatori fra virgolette,
// commenti, dollar-quoting di PostgreSQL ($$ … $$) e i blocchi BEGIN … END dei trigger SQLite.

export interface SqlStatement {
  text: string
  /** Posizione (offset) del primo carattere dell'istruzione nello script originale. */
  start: number
  end: number
}

export function splitStatements(script: string): SqlStatement[] {
  const statements: SqlStatement[] = []
  let start = 0
  let i = 0
  let triggerDepth = 0
  const length = script.length

  const push = (end: number) => {
    const raw = script.slice(start, end)
    // I commenti iniziali non fanno parte dell'istruzione (titoli più puliti, EXPLAIN corretto).
    const leading = /^(\s+|--[^\n]*(\n|$)|\/\*[\s\S]*?\*\/)*/.exec(raw)?.[0].length ?? 0
    const text = raw.slice(leading).trim()
    if (text) statements.push({ text, start: start + leading, end })
    start = end + 1
  }

  while (i < length) {
    const char = script[i]!
    const next = script[i + 1]
    if (char === '-' && next === '-') {
      const newline = script.indexOf('\n', i)
      i = newline < 0 ? length : newline + 1
      continue
    }
    if (char === '/' && next === '*') {
      const close = script.indexOf('*/', i + 2)
      i = close < 0 ? length : close + 2
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      let j = i + 1
      while (j < length) {
        if (script[j] === char) {
          if (script[j + 1] === char) {
            j += 2
            continue
          }
          break
        }
        j++
      }
      i = j + 1
      continue
    }
    if (char === '[') {
      const close = script.indexOf(']', i)
      i = close < 0 ? length : close + 1
      continue
    }
    if (char === '$') {
      const tag = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(script.slice(i))
      if (tag) {
        const close = script.indexOf(tag[0], i + tag[0].length)
        i = close < 0 ? length : close + tag[0].length
        continue
      }
    }
    if (/[A-Za-z_]/.test(char) && (i === 0 || !/[A-Za-z0-9_$]/.test(script[i - 1]!))) {
      const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(script.slice(i))![0]
      const upper = word.toUpperCase()
      const before = script.slice(start, i).toUpperCase()
      if (upper === 'BEGIN' && /\bCREATE\s+(TEMP\s+|TEMPORARY\s+)?TRIGGER\b/.test(before)) triggerDepth++
      else if (upper === 'CASE' && triggerDepth > 0) triggerDepth++
      else if (upper === 'END' && triggerDepth > 0) triggerDepth--
      i += word.length
      continue
    }
    if (char === ';' && triggerDepth === 0) {
      push(i)
      i++
      continue
    }
    i++
  }
  push(length)
  return statements
}

/** Istruzione che contiene (o precede immediatamente) la posizione del cursore. */
export function statementAt(script: string, offset: number): SqlStatement | null {
  const statements = splitStatements(script)
  return statements.find((s) => offset >= s.start && offset <= s.end + 1) ?? statements.filter((s) => s.start <= offset).at(-1) ?? statements[0] ?? null
}
