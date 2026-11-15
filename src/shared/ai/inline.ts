// Suggerimento AI in grigio (Tab accetta, Ctrl+→ una parola): logica pura condivisa fra il renderer (quando chiedere
// e cosa mandare) e il main (prompt per il modello, pulizia della risposta). Come in Easey DB 1.1, per tutti i
// linguaggi dell'IDE:
//   - quando: mai dentro i commenti, mai a metà parola; su una riga vuota solo se il codice non è finito (dentro un
//     blocco, dopo «{ ( [ : , =») o se sopra c'è un commento che dice cosa si vuole («# somma dei pari»);
//   - cosa: una finestra attorno al cursore (prima e dopo, a righe intere), più il contesto di chi chiede (lo schema SQL);
//   - come: riempimento al centro vero con i token del modello (Qwen2.5-Coder: <|fim_prefix|>…<|fim_suffix|>…
//     <|fim_middle|>, via /api/generate con raw: true), il `suffix` di Ollama per gli altri modelli che lo sanno fare,
//     altrimenti solo il testo prima del cursore; temperatura bassa, stop alla misura del livello;
//   - pulizia: niente blocchi ```, niente token speciali, niente ripetizione di ciò che c'è già prima o dopo il cursore.
import { codeOnly, type CommentFamily } from '../editor/typos'

/** Token speciali dei modelli da codice: fermano la generazione e non devono mai finire nell'editor. */
export const SPECIAL_TOKENS = ['<|endoftext|>', '<|fim_pad|>', '<|fim_prefix|>', '<|fim_suffix|>', '<|fim_middle|>', '<|file_sep|>', '<|repo_name|>', '<|im_end|>', '<｜fim▁begin｜>', '<｜fim▁hole｜>', '<｜fim▁end｜>', '<｜end▁of▁sentence｜>', '<fim_prefix>', '<fim_suffix>', '<fim_middle>', '<EOT>', '<|end_of_text|>']

const WINDOW_AFTER = 600
const LINES_AFTER = 12

/** Commenti e stringhe di ogni linguaggio (per non suggerire dentro un commento). */
const COMMENTS: Record<string, CommentFamily> = {
  javascript: 'c', typescript: 'c', c: 'c', cpp: 'c', csharp: 'c', java: 'c', rust: 'c', go: 'c', php: 'c', css: 'c', scss: 'c', less: 'c', json: 'c',
  python: 'python',
  sql: 'sql'
}

/** Il cursore è dentro un commento (o una stringa chiusa)? */
export function insideComment(text: string, offset: number, language: string): boolean {
  const family = COMMENTS[language]
  if (!family) return false
  // Un carattere segnaposto al posto del cursore: se sparisce, era dentro un commento o una stringa.
  const probe = codeOnly(`${text.slice(0, offset)}\u0001${text.slice(offset, offset + 200)}`, family)
  return probe[offset] !== '\u0001'
}

export interface InlineInput {
  /** Tutto il testo dell'editor. */
  text: string
  offset: number
  language: string
  /** Quanto testo prima del cursore (dal livello di aiuto). */
  prefixChars: number
  /** Righe al massimo del suggerimento (1 = solo il resto della riga). */
  maxLines: number
  /** Si può suggerire anche a metà riga (livello Forte)? */
  midLine: boolean
}

export interface InlinePlan {
  /** Testo prima del cursore (finestra, a righe intere). */
  prefix: string
  /** Testo dopo il cursore (finestra). */
  suffix: string
  linePrefix: string
  lineSuffix: string
  /** true: il cursore è a metà di una riga con altro testo dopo: si completa solo quella riga. */
  singleLine: boolean
  /** Una riga vuota chiude il suggerimento (non al livello Forte, dove si scrivono funzioni intere). */
  blankStops: boolean
  stop: string[]
  /** Chiave della cache. */
  key: string
}

/** Dopo il cursore, sulla stessa riga, ci sono solo parentesi, virgolette o punteggiatura che chiude? */
const onlyClosers = (lineSuffix: string) => /^[\s)\]}'"`;,]*$/.test(lineSuffix)

/** Cosa chiedere al modello per il punto del cursore, o null se qui non si suggerisce niente. */
export function planInline(input: InlineInput): InlinePlan | null {
  const { text, offset, language } = input
  const before = text.slice(0, offset)
  const after = text.slice(offset)
  if (!before.trim()) return null
  // A metà parola: niente (l'elenco dei suggerimenti dell'editor fa già il suo lavoro).
  if (/^[\w$]/.test(after)) return null
  const lineStart = before.lastIndexOf('\n') + 1
  const linePrefix = before.slice(lineStart)
  const lineEnd = after.indexOf('\n')
  const lineSuffix = lineEnd < 0 ? after : after.slice(0, lineEnd)
  // A metà riga solo se il livello lo permette.
  if (!input.midLine && !onlyClosers(lineSuffix)) return null
  if (insideComment(text, offset, language)) return null
  if (!linePrefix.trim()) {
    // Riga vuota: sì dentro un blocco (rientrata), dopo un'apertura o sotto un commento che dice cosa si vuole.
    const previous = before.slice(0, lineStart).replace(/\s+$/, '').split('\n').pop() ?? ''
    const indented = linePrefix.length > 0
    const opener = /[{([:,=\\]\s*$|=>\s*$/.test(previous)
    const comment = /^\s*(\/\/|#|--|\/\*|\*|<!--)/.test(previous)
    if (!indented && !opener && !comment) return null
  }
  // Finestra: le righe intere prima del cursore che stanno nel limite del livello; qualche riga dopo.
  let windowStart = Math.max(0, offset - input.prefixChars)
  if (windowStart > 0) windowStart = text.indexOf('\n', windowStart) + 1 || windowStart
  let windowEnd = offset
  for (let line = 0; line < LINES_AFTER && windowEnd < text.length && windowEnd - offset < WINDOW_AFTER; line++) {
    const next = text.indexOf('\n', windowEnd + 1)
    windowEnd = next < 0 ? text.length : next
  }
  const prefix = text.slice(windowStart, offset)
  const suffix = text.slice(offset, Math.min(windowEnd, offset + WINDOW_AFTER))
  const singleLine = input.maxLines <= 1 || (lineSuffix.trim() !== '' && !onlyClosers(lineSuffix))
  const blankStops = input.maxLines <= 6
  const stop = ['```', ...(singleLine ? ['\n'] : blankStops ? ['\n\n'] : ['\n\n\n'])]
  return { prefix, suffix, linePrefix, lineSuffix, singleLine, blankStops, stop, key: `${prefix.slice(-700)}\u0000${suffix.slice(0, 200)}` }
}

// ------------------------------------------------------------------ modello e prompt

export type FimStyle = 'qwen' | 'deepseek' | 'codellama' | 'starcoder' | 'codestral' | 'ollama-suffix' | 'prefix'

export interface ModelInfo {
  /** Famiglia dichiarata da Ollama (details.family): qwen2, llama, gemma… */
  family?: string
  /** Capacità dichiarate: «insert» = sa riempire in mezzo con il `suffix`. */
  capabilities?: string[]
}

/** Come chiedere il riempimento in mezzo a questo modello. */
export function fimStyle(model: string, info: ModelInfo = {}): FimStyle {
  const name = model.toLowerCase()
  if (/qwen[\d.]*-?coder|codeqwen|codegemma/.test(name)) return 'qwen'
  if (/deepseek-coder/.test(name)) return 'deepseek'
  if (/codellama|code-llama/.test(name)) return 'codellama'
  if (/starcoder|santacoder|stable-code/.test(name)) return 'starcoder'
  if (/codestral/.test(name)) return 'codestral'
  if (info.capabilities?.includes('insert')) return 'ollama-suffix'
  return 'prefix'
}

/** Il prompt grezzo per lo stile del modello (null per «ollama-suffix»: ci pensa il template di Ollama). */
export function fimPrompt(style: FimStyle, prefix: string, suffix: string): string | null {
  switch (style) {
    case 'qwen':
      return `<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`
    case 'deepseek':
      return `<｜fim▁begin｜>${prefix}<｜fim▁hole｜>${suffix}<｜fim▁end｜>`
    case 'codellama':
      return `<PRE> ${prefix} <SUF>${suffix} <MID>`
    case 'starcoder':
      return `<fim_prefix>${prefix}<fim_suffix>${suffix}<fim_middle>`
    case 'codestral':
      return `[SUFFIX]${suffix}[PREFIX]${prefix}`
    case 'prefix':
      return prefix
    default:
      return null
  }
}

export interface InlineRequest {
  prefix: string
  suffix: string
  stop?: string[]
  maxTokens?: number
}

/** Corpo di /api/generate di Ollama per il suggerimento in grigio. */
export function ollamaGenerateBody(model: string, info: ModelInfo, request: InlineRequest): Record<string, unknown> {
  const style = fimStyle(model, info)
  const stop = [...new Set([...(request.stop ?? ['\n\n\n', '```']), ...SPECIAL_TOKENS])]
  const options = { num_predict: request.maxTokens ?? 80, temperature: 0.1, top_p: 0.9, stop }
  const raw = fimPrompt(style, request.prefix, request.suffix)
  if (raw === null) return { model, prompt: request.prefix, suffix: request.suffix, stream: false, options }
  return { model, prompt: raw, raw: true, stream: false, options }
}

// ------------------------------------------------------------------ pulizia della risposta

/** Quanto basta della pianificazione per pulire una risposta (anche dal main, che ha solo prefisso e suffisso). */
export type CleanContext = Pick<InlinePlan, 'suffix' | 'linePrefix' | 'singleLine' | 'blankStops'>

/** Ricostruisce il contesto di pulizia da prefisso e suffisso (lato main). */
export function cleanContext(prefix: string, suffix: string, blankStops = true): CleanContext {
  const linePrefix = prefix.slice(prefix.lastIndexOf('\n') + 1)
  const newline = suffix.indexOf('\n')
  const lineSuffix = newline < 0 ? suffix : suffix.slice(0, newline)
  return { suffix, linePrefix, singleLine: lineSuffix.trim() !== '' && !onlyClosers(lineSuffix), blankStops }
}

/** Ripulisce un suggerimento: token speciali, blocchi ```, righe vuote, ripetizioni del testo prima e dopo. */
export function postProcess(text: string, context: CleanContext): string {
  let out = text.replace(/\r\n/g, '\n')
  // Token speciali: tutto ciò che segue non è codice.
  for (const token of SPECIAL_TOKENS) {
    const index = out.indexOf(token)
    if (index >= 0) out = out.slice(0, index)
  }
  // Blocchi ``` (i modelli «da chat» li aggiungono): resta il contenuto del primo.
  if (/^\s*```/.test(out)) out = out.replace(/^\s*```[\w-]*\n?/, '')
  const fence = out.indexOf('```')
  if (fence >= 0) out = out.slice(0, fence)
  // Una riga vuota chiude il suggerimento (tranne al livello Forte); a metà riga solo il resto della riga.
  const blank = context.blankStops ? /\n[ \t]*\n/.exec(out) : null
  if (blank) out = out.slice(0, blank.index)
  if (context.singleLine) out = out.split('\n')[0]!
  // Il modello a volte riscrive la riga da capo («console.log(» → «console.log(somma)»).
  const typed = context.linePrefix.trimStart()
  if (typed.length >= 3 && out.trimStart().startsWith(typed)) out = out.trimStart().slice(typed.length)
  // Niente doppio spazio: se prima del cursore c'è già uno spazio, si tolgono quelli iniziali.
  if (/[ \t]$/.test(context.linePrefix) && !out.startsWith('\n')) out = out.replace(/^[ \t]+/, '')
  // Ripetizione del testo che segue il cursore: dentro il suggerimento…
  const head = context.suffix.trimStart().slice(0, 40)
  if (head.length >= 8) {
    const index = out.indexOf(head)
    if (index > 0) out = out.slice(0, index)
  }
  // …o alla fine (es. «somma(a, b))» con «)» già dopo il cursore).
  out = out.replace(/\s+$/, (trailing) => (trailing.includes('\n') ? '' : trailing))
  const afterCursor = context.suffix.replace(/^[ \t]+/, '')
  for (let k = Math.min(out.length, afterCursor.length, 40); k >= 1; k--) {
    const piece = afterCursor.slice(0, k)
    if (out.endsWith(piece) && (k >= 3 || /^[\s;,)\]}'"`]+$/.test(piece))) {
      out = out.slice(0, out.length - k)
      break
    }
  }
  // Se dopo il cursore c'è già la parentesi che chiude il blocco, il suggerimento non la chiude di nuovo.
  const closing = context.suffix.trimStart().charAt(0)
  if (closing && '})]'.includes(closing)) {
    let depth = 0
    for (let i = 0; i < out.length; i++) {
      const char = out[i]!
      if ('{(['.includes(char)) depth++
      else if ('})]'.includes(char)) {
        depth--
        if (depth < 0) {
          out = out.slice(0, i)
          break
        }
      }
    }
  }
  out = out.replace(/\s+$/, (trailing) => (trailing.includes('\n') ? '' : trailing))
  return out.trim() ? out : ''
}

/**
 * Mentre si scrive proprio il testo suggerito, il resto del suggerimento vale ancora: niente nuova richiesta.
 * `previous` = prefisso e suggerimento dell'ultima risposta; null se il testo scritto se ne è allontanato.
 */
export function typedThrough(previous: { prefix: string; completion: string } | null, prefix: string): string | null {
  if (!previous || !prefix.startsWith(previous.prefix)) return null
  const typed = prefix.slice(previous.prefix.length)
  if (!typed || !previous.completion.startsWith(typed)) return null
  const rest = previous.completion.slice(typed.length)
  return rest.trim() ? rest : null
}
