import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chatSystemPrompt, languageNotes } from '../../src/shared/ai/chat-prompt'

describe('istruzioni della chat', () => {
  it('le regole del linguaggio aperto, in italiano e in inglese', () => {
    expect(languageNotes('python')).toContain('Linguaggio del documento aperto: Python')
    expect(languageNotes('python')).toContain('int(input())')
    expect(languageNotes('csharp', 'en')).toContain('top-level statements')
    expect(languageNotes('markdown')).toBe('')
    expect(languageNotes(null)).toBe('')
  })

  it('base, tutor e regole nell’ordine; niente righe vuote di troppo', () => {
    expect(chatSystemPrompt('BASE', 'rust', { tutor: 'TUTOR' })).toMatch(/^BASE\n\nTUTOR\n\nLinguaggio del documento aperto: Rust/)
    expect(chatSystemPrompt('BASE', null)).toBe('BASE')
  })

  it('il testo base chiede risposte brevi e niente LaTeX (italiano e inglese)', () => {
    const it18n = readFileSync(join(__dirname, '../../src/renderer/i18n/it.ts'), 'utf8')
    const en18n = readFileSync(join(__dirname, '../../src/renderer/i18n/en.ts'), 'utf8')
    const prompt = (text: string) => /'ai\.systemPrompt':\s*'([^']*(?:\\'[^']*)*)'/.exec(text)?.[1] ?? ''
    expect(prompt(it18n)).toMatch(/in breve/)
    expect(prompt(it18n)).toMatch(/Niente LaTeX/)
    expect(prompt(en18n)).toMatch(/briefly/)
  })
})
