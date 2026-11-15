import { describe, expect, it } from 'vitest'
import { cleanContext, fimPrompt, fimStyle, insideComment, ollamaGenerateBody, planInline, postProcess, typedThrough } from '../../src/shared/ai/inline'

const at = (text: string) => ({ text: text.replace('|', ''), offset: text.indexOf('|') })
const plan = (text: string, language = 'python', extra: Partial<{ maxLines: number; midLine: boolean; prefixChars: number }> = {}) =>
  planInline({ ...at(text), language, prefixChars: extra.prefixChars ?? 3000, maxLines: extra.maxLines ?? 6, midLine: extra.midLine ?? false })

describe('quando suggerire', () => {
  it('a fine riga sì; a metà parola e dentro un commento no', () => {
    expect(plan('numeri = [1, 2]\ntotale = |')).not.toBeNull()
    expect(plan('pri|nt(1)')).toBeNull()
    expect(plan('# somma dei |')).toBeNull()
    expect(plan('// commento |', 'javascript')).toBeNull()
    expect(plan('x = "testo |"')).toBeNull()
  })

  it('riga vuota: sì dentro un blocco, dopo un’apertura o sotto un commento; no dopo un’istruzione finita', () => {
    expect(plan('def somma(a, b):\n    |')).not.toBeNull()
    expect(plan('function f() {\n|', 'javascript')).not.toBeNull()
    expect(plan('# stampa i numeri pari\n|')).not.toBeNull()
    expect(plan('print(1)\n|')).toBeNull()
  })

  it('a metà riga solo al livello che lo permette (e completando solo quella riga)', () => {
    expect(plan('print(|"ciao")')).toBeNull()
    expect(plan('totale = somma(|)')).not.toBeNull()
    const mid = plan('if x | and y:', 'python', { midLine: true })
    expect(mid?.singleLine).toBe(true)
    expect(mid?.stop).toContain('\n')
  })

  it('finestra a righe intere; stop alla misura del livello', () => {
    const long = `${'x = 1\n'.repeat(400)}y = |\nz = 2\n`
    const p = plan(long, 'python', { prefixChars: 100 })!
    expect(p.prefix.startsWith('x = 1')).toBe(true)
    expect(p.prefix.length).toBeLessThanOrEqual(100)
    expect(p.suffix.startsWith('\nz = 2')).toBe(true)
    expect(plan('a = |', 'python', { maxLines: 1 })!.stop).toContain('\n')
    expect(plan('a = |', 'python', { maxLines: 6 })!.stop).toContain('\n\n')
    expect(plan('a = |', 'python', { maxLines: 40 })!.blankStops).toBe(false)
  })

  it('commenti: il cursore subito dopo una stringa chiusa non è dentro la stringa', () => {
    const { text, offset } = at('print("ciao")|')
    expect(insideComment(text, offset, 'python')).toBe(false)
    expect(insideComment('a = 1 # nota', 12, 'python')).toBe(true)
    expect(insideComment('<p>|</p>', 3, 'html')).toBe(false)
  })
})

describe('riempimento al centro per il modello giusto', () => {
  it('formato dei modelli da codice; il suffix di Ollama per gli altri che lo sanno fare', () => {
    expect(fimStyle('qwen2.5-coder:1.5b-base')).toBe('qwen')
    expect(fimStyle('deepseek-coder:1.3b')).toBe('deepseek')
    expect(fimStyle('starcoder2:3b')).toBe('starcoder')
    expect(fimStyle('llama3.2:3b', { capabilities: ['completion', 'insert'] })).toBe('ollama-suffix')
    expect(fimStyle('gemma3:4b', { capabilities: ['completion'] })).toBe('prefix')
    expect(fimPrompt('qwen', 'a = ', '\nb')).toBe('<|fim_prefix|>a = <|fim_suffix|>\nb<|fim_middle|>')
  })

  it('corpo di /api/generate: raw con i token, oppure prompt + suffix', () => {
    const qwen = ollamaGenerateBody('qwen2.5-coder:1.5b', {}, { prefix: 'a', suffix: 'b', stop: ['\n'], maxTokens: 32 })
    expect(qwen).toMatchObject({ raw: true, prompt: '<|fim_prefix|>a<|fim_suffix|>b<|fim_middle|>' })
    expect((qwen['options'] as { stop: string[]; num_predict: number }).stop).toEqual(expect.arrayContaining(['\n', '<|endoftext|>']))
    expect((qwen['options'] as { num_predict: number }).num_predict).toBe(32)
    const other = ollamaGenerateBody('llama3.2', { capabilities: ['insert'] }, { prefix: 'a', suffix: 'b' })
    expect(other).toMatchObject({ prompt: 'a', suffix: 'b' })
    expect(other['raw']).toBeUndefined()
  })
})

describe('pulizia della risposta', () => {
  it('token speciali, blocchi ```, riga riscritta, doppio spazio', () => {
    expect(postProcess('sum(numeri)<|endoftext|>altro', cleanContext('totale = ', ''))).toBe('sum(numeri)')
    expect(postProcess('```python\nsum(numeri)\n```', cleanContext('totale = ', ''))).toBe('sum(numeri)')
    expect(postProcess('console.log(totale)', cleanContext('console.log(', ')'))).toBe('totale')
    expect(postProcess('  1', cleanContext('x = ', ''))).toBe('1')
  })

  it('riga vuota: chiude al livello intermedio, non al Forte', () => {
    expect(postProcess('a = 1\n\nb = 2', cleanContext('', '', true))).toBe('a = 1')
    expect(postProcess('a = 1\n\nb = 2', cleanContext('', '', false))).toBe('a = 1\n\nb = 2')
  })

  it('mentre si scrive il suggerimento, il resto vale ancora', () => {
    const last = { prefix: 'totale = ', completion: 'sum(numeri)' }
    expect(typedThrough(last, 'totale = su')).toBe('m(numeri)')
    expect(typedThrough(last, 'totale = x')).toBeNull()
    expect(typedThrough(last, 'totale = sum(numeri)')).toBeNull()
  })
})
