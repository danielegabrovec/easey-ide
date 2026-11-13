// Comandi rapidi nella casella della chat AI (/spiega, /correggi, /commenta, /test, /errore):
// riconoscimento e suggerimenti della tendina. Logica pura, collaudata in tests/unit.

/** Azioni rapide dell'assistente (le stesse del tasto destro dell'editor). */
export type QuickActionKind = 'explain' | 'fix' | 'comment' | 'tests' | 'error'

export interface SlashCommand {
  action: QuickActionKind
  /** Nome mostrato in italiano (primo) e alias inglese: entrambi funzionano in ogni lingua. */
  it: string
  en: string
}

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { action: 'explain', it: 'spiega', en: 'explain' },
  { action: 'fix', it: 'correggi', en: 'fix' },
  { action: 'comment', it: 'commenta', en: 'comment' },
  { action: 'tests', it: 'test', en: 'tests' },
  { action: 'error', it: 'errore', en: 'error' }
]

export interface ParsedSlash {
  action: QuickActionKind
  /** Testo scritto dopo il comando (istruzioni in più), già ripulito. */
  extra: string
}

/**
 * Riconosce un comando all'inizio del testo: «/correggi» o «/correggi usa const».
 * Restituisce null se il testo non inizia con un comando noto (allora è una domanda normale).
 */
export function parseSlash(input: string): ParsedSlash | null {
  const match = /^\/([\p{L}]+)(?:\s+([\s\S]*))?$/u.exec(input.trim())
  if (!match) return null
  const name = match[1]!.toLowerCase()
  const command = SLASH_COMMANDS.find((c) => c.it === name || c.en === name)
  if (!command) return null
  return { action: command.action, extra: (match[2] ?? '').trim() }
}

/**
 * Comandi da proporre nella tendina mentre si scrive: solo finché il testo è «/» seguito da lettere
 * (niente spazi). Il nome mostrato è quello della lingua scelta; il filtro guarda entrambi i nomi.
 */
export function slashSuggestions(input: string, language: 'it' | 'en'): { action: QuickActionKind; name: string }[] {
  const match = /^\/([\p{L}]*)$/u.exec(input)
  if (!match) return []
  const prefix = match[1]!.toLowerCase()
  return SLASH_COMMANDS.filter((c) => c.it.startsWith(prefix) || c.en.startsWith(prefix)).map((c) => ({ action: c.action, name: c[language] }))
}
