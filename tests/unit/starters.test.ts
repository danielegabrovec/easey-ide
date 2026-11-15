import { describe, expect, it } from 'vitest'
import { planStarters, splitStarters, starterTopic } from '@shared/ai/starters'
import { readFileSync } from 'node:fs'

/** Le domande di un argomento lette dal file dei testi (i test non importano il renderer). */
function startersIn(file: string, topic: string): string[] {
  const source = readFileSync(new URL(`../../src/renderer/i18n/${file}`, import.meta.url), 'utf8')
  const match = new RegExp(`'ai\.starters\.${topic}': '([^']*)'`).exec(source)
  return match ? splitStarters(match[1]!) : []
}

describe('suggerimenti d’avvio della chat', () => {
  it('l’argomento segue il file aperto (e i linguaggi della Scrittura rapida)', () => {
    expect(starterTopic('src/main.py')).toBe('python')
    expect(starterTopic('Programma.java')).toBe('java')
    expect(starterTopic('main.rs')).toBe('rust')
    expect(starterTopic('index.html')).toBe('html')
    expect(starterTopic('cpp')).toBe('cpp')
    expect(starterTopic('note.md')).toBe('start')
    expect(starterTopic(null)).toBe('start')
  })
  it('prima la situazione: errori, poi righe selezionate, poi il file', () => {
    expect(planStarters({ file: 'src/app.ts', errors: 2, selection: true }).context).toEqual({ kind: 'errors', count: 2, file: 'app.ts' })
    expect(planStarters({ file: 'src/app.ts', errors: 0, selection: true }).context).toEqual({ kind: 'selection', file: 'app.ts' })
    expect(planStarters({ file: 'src/app.ts', errors: 0, selection: false }).context).toEqual({ kind: 'file', file: 'app.ts' })
    expect(planStarters({ file: null, errors: 0, selection: false })).toEqual({ context: null, topic: 'start' })
  })
  it('ogni argomento ha tre domande in italiano e in inglese', () => {
    for (const topic of ['start', 'html', 'css', 'javascript', 'typescript', 'python', 'c', 'cpp', 'csharp', 'java', 'rust', 'sql'] as const) {
      expect(startersIn('it.ts', topic)).toHaveLength(3)
      expect(startersIn('en.ts', topic)).toHaveLength(3)
    }
  })
})
