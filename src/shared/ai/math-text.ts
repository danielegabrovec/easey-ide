// Formule LaTeX nelle risposte dell'AI ($\rightarrow$, \frac{a}{b}, $O(n^2)$) trasformate in testo leggibile
// con i simboli Unicode (→, a/b, O(n²)). I modelli locali le scrivono spesso anche quando si chiede di non farlo;
// l'interfaccia non ha un motore di formule e mostrarle grezze confonde chi impara. Codice puro (test in
// tests/unit/math-text.test.ts); lo usa src/renderer/ui/Markdown.tsx fuori dai blocchi e dagli span di codice.

const SYMBOLS: Record<string, string> = {
  rightarrow: '→', to: '→', longrightarrow: '⟶', Rightarrow: '⇒', implies: '⇒', Longrightarrow: '⟹',
  leftarrow: '←', gets: '←', Leftarrow: '⇐', leftrightarrow: '↔', Leftrightarrow: '⇔', iff: '⇔', mapsto: '↦',
  uparrow: '↑', downarrow: '↓',
  times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', ast: '∗', star: '⋆', circ: '∘', bullet: '•',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', sim: '∼', simeq: '≃',
  ll: '≪', gg: '≫', propto: '∝',
  infty: '∞', partial: '∂', nabla: '∇', sum: '∑', prod: '∏', int: '∫',
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇', cup: '∪', cap: '∩',
  emptyset: '∅', varnothing: '∅', forall: '∀', exists: '∃', neg: '¬', lnot: '¬', land: '∧', wedge: '∧',
  lor: '∨', vee: '∨', oplus: '⊕', otimes: '⊗', top: '⊤', bot: '⊥', vdash: '⊢', models: '⊨',
  ldots: '…', dots: '…', cdots: '⋯', vdots: '⋮',
  lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', langle: '⟨', rangle: '⟩', mid: '|', vert: '|', Vert: '‖',
  degree: '°', checkmark: '✓', prime: '′',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ',
  sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  quad: '  ', qquad: '    ', bmod: 'mod', mod: 'mod'
}

/** Comandi che non si vedono (dimensioni delle parentesi, spazi sottili). */
const INVISIBLE = new Set(['left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'displaystyle', 'textstyle', 'limits', 'nolimits'])
/** Comandi che tengono solo il testo fra graffe. */
const WRAPPERS = new Set(['text', 'textrm', 'textbf', 'textit', 'texttt', 'mathrm', 'mathbf', 'mathit', 'mathtt', 'mathsf', 'mathcal', 'mathbb', 'operatorname', 'boldsymbol', 'emph', 'hat', 'bar', 'vec', 'overline', 'underline', 'tilde'])

const SUPER: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ', x: 'ˣ', k: 'ᵏ', m: 'ᵐ', T: 'ᵀ' }
const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ' }

/** Legge un argomento: `{…}` (con graffe annidate) o un solo carattere/comando. Restituisce [testo, fine]. */
function readArgument(source: string, start: number): [string, number] {
  let i = start
  while (source[i] === ' ') i++
  if (source[i] === '{') {
    let depth = 0
    for (let j = i; j < source.length; j++) {
      if (source[j] === '{') depth++
      else if (source[j] === '}' && --depth === 0) return [source.slice(i + 1, j), j + 1]
    }
    return [source.slice(i + 1), source.length]
  }
  if (source[i] === '\\') {
    const command = /^\\([A-Za-z]+|.)/.exec(source.slice(i))
    if (command) return [command[0], i + command[0].length]
  }
  return [source[i] ?? '', Math.min(i + 1, source.length)]
}

function script(text: string, table: Record<string, string>, mark: string): string {
  const chars = [...text]
  if (chars.length && chars.every((c) => table[c] !== undefined)) return chars.map((c) => table[c]).join('')
  return chars.length === 1 ? `${mark}${text}` : `${mark}(${text})`
}

const simple = (text: string) => /^[\w.²³]+$/u.test(text)

/** Converte il contenuto di una formula LaTeX in testo con simboli Unicode. */
export function latexToText(source: string): string {
  let out = ''
  let i = 0
  while (i < source.length) {
    const char = source[i]!
    if (char === '\\') {
      const match = /^\\([A-Za-z]+|.)/.exec(source.slice(i))
      if (!match) {
        i++
        continue
      }
      const name = match[1]!
      i += match[0].length
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        const [top, afterTop] = readArgument(source, i)
        const [bottom, afterBottom] = readArgument(source, afterTop)
        const a = latexToText(top)
        const b = latexToText(bottom)
        out += `${simple(a) ? a : `(${a})`}/${simple(b) ? b : `(${b})`}`
        i = afterBottom
      } else if (name === 'sqrt') {
        const [inner, after] = readArgument(source, i)
        const text = latexToText(inner)
        out += simple(text) ? `√${text}` : `√(${text})`
        i = after
      } else if (WRAPPERS.has(name)) {
        const [inner, after] = readArgument(source, i)
        out += latexToText(inner)
        i = after
      } else if (INVISIBLE.has(name)) {
        // \left( → «(»: la parentesi resta, il comando no.
      } else if (name === ',' || name === ';' || name === ':' || name === ' ') out += ' '
      else if (name === '!') out += ''
      else if (name === '\\') out += ' '
      else if (/^[{}%_&#$|]$/.test(name)) out += name
      else out += SYMBOLS[name] ?? name
      continue
    }
    if (char === '^' || char === '_') {
      const [arg, after] = readArgument(source, i + 1)
      out += script(latexToText(arg), char === '^' ? SUPER : SUB, char)
      i = after
      continue
    }
    if (char === '{' || char === '}') {
      i++
      continue
    }
    if (char === '~') out += ' '
    else out += char
    i++
  }
  return out.replace(/[ \t]{2,}(?![ \t]*$)/g, (spaces) => (spaces.length >= 4 ? spaces : ' ')).trim()
}

/** Un `$…$` in linea è una formula? (non «costa $5 e $10», non variabili di shell come «$HOME»). */
function looksLikeMath(content: string, after: string): boolean {
  if (!content || content.length > 300) return false
  if (/^\s|\s$/.test(content)) return false
  if (/^\d/.test(after)) return false
  return /\\[A-Za-z]+|[\^_{}]|^[A-Za-z]$|^[\w.]+\s*[=<>+\-*/]\s*[\w.]+/.test(content) && !/^[A-Z_][A-Z0-9_]*$/.test(content)
}

/**
 * Trasforma le formule di un testo (fuori dal codice): `$$…$$`, `\[…\]`, `\(…\)` sempre, `$…$` solo se
 * sembra una formula. Il testo senza formule resta identico.
 */
export function mathToText(text: string): string {
  if (!/[$\\]/.test(text)) return text
  let out = text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, inner: string) => latexToText(inner))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_m, inner: string) => latexToText(inner))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_m, inner: string) => latexToText(inner))
  out = out.replace(/(^|[^\\$\w])\$([^$\n]+?)\$(?!\$)(.?)/g, (whole, before: string, inner: string, after: string) =>
    looksLikeMath(inner, after) ? `${before}${latexToText(inner)}${after}` : whole
  )
  return out
}
