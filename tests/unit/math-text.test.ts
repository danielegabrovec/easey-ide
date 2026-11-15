import { describe, expect, it } from 'vitest'
import { latexToText, mathToText } from '@shared/ai/math-text'

describe('formule LaTeX nelle risposte dell’AI', () => {
  it('frecce, operatori e lettere greche diventano simboli', () => {
    expect(mathToText('Il valore passa $\\rightarrow$ alla funzione')).toBe('Il valore passa → alla funzione')
    expect(mathToText('Se $a \\leq b$ e $b \\neq 0$')).toBe('Se a ≤ b e b ≠ 0')
    expect(latexToText('\\alpha + \\beta \\times \\pi')).toBe('α + β × π')
  })
  it('potenze, indici, frazioni e radici', () => {
    expect(mathToText('complessità $O(n^2)$ e $O(n \\log n)$')).toBe('complessità O(n²) e O(n log n)')
    expect(latexToText('x_i + x_{10}')).toBe('xᵢ + x₁₀')
    expect(latexToText('\\frac{a}{b}')).toBe('a/b')
    expect(latexToText('\\frac{n(n+1)}{2}')).toBe('(n(n+1))/2')
    expect(latexToText('\\sqrt{2}')).toBe('√2')
    expect(latexToText('2^{x+y}')).toBe('2^(x+y)')
  })
  it('formule a blocco e con le parentesi \\( \\) \\[ \\]', () => {
    expect(mathToText('$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$')).toBe('∑ᵢ₌₁ⁿ i = (n(n+1))/2')
    expect(mathToText('vale \\(x \\geq 0\\) sempre')).toBe('vale x ≥ 0 sempre')
    expect(mathToText('\\[ \\text{area} = \\pi r^2 \\]')).toBe('area = π r²')
  })
  it('non tocca i prezzi, le variabili di shell e il testo normale', () => {
    expect(mathToText('costa $5 e poi $10')).toBe('costa $5 e poi $10')
    expect(mathToText('usa $HOME e $PATH')).toBe('usa $HOME e $PATH')
    expect(mathToText('In jQuery si scrive $(".classe")')).toBe('In jQuery si scrive $(".classe")')
    expect(mathToText('Nessuna formula qui.')).toBe('Nessuna formula qui.')
    expect(mathToText('il prezzo è $x$ euro')).toBe('il prezzo è x euro')
  })

  it('frecce e confronti anche senza dollari, ma mai \\n, \\t o altri comandi', () => {
    expect(mathToText('`EXIST` \\rightarrow `EXISTS`')).toBe('`EXIST` → `EXISTS`')
    expect(mathToText('vale se a \\le b e b \\neq 0')).toBe('vale se a ≤ b e b ≠ 0')
    expect(mathToText('usa \\n per andare a capo e \\t per il tab')).toBe('usa \\n per andare a capo e \\t per il tab')
    expect(mathToText('\\leftarrows non è un simbolo')).toBe('\\leftarrows non è un simbolo')
  })
})
