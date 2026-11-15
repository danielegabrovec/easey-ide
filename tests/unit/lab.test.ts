import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { QUICK_LANGUAGES } from '../../src/shared/contracts/quick'
import { labExamples } from '../../src/shared/quick/lab-examples'
import { addRun, parseHistory, previewOf, type RunRecord } from '../../src/shared/quick/run-history'

// I test unitari non possono importare i testi del renderer: si leggono come testo.
const it18n = readFileSync(join(__dirname, '../../src/renderer/i18n/it.ts'), 'utf8')
const en18n = readFileSync(join(__dirname, '../../src/renderer/i18n/en.ts'), 'utf8')

describe('esempi del Laboratorio', () => {
  it('ogni linguaggio della Scrittura rapida ha almeno tre esempi, con il testo del pulsante in italiano e in inglese', () => {
    for (const language of QUICK_LANGUAGES) {
      const examples = labExamples(language)
      expect(examples.length, language).toBeGreaterThanOrEqual(3)
      for (const example of examples) {
        expect(it18n, `lab.ex.${example.kind}`).toContain(`'lab.ex.${example.kind}'`)
        expect(en18n, `lab.ex.${example.kind}`).toContain(`'lab.ex.${example.kind}'`)
        expect(example.code.endsWith('\n'), `${language}/${example.kind}`).toBe(true)
      }
      expect(new Set(examples.map((e) => e.kind)).size, language).toBe(examples.length)
    }
  })

  it('gli esempi JavaScript girano senza errori e scrivono qualcosa', () => {
    for (const example of labExamples('javascript')) {
      const lines: string[] = []
      vm.runInNewContext(example.code, { console: { log: (...args: unknown[]) => lines.push(args.join(' ')) } })
      expect(lines.length, example.kind).toBeGreaterThan(0)
    }
  })

  it('niente input da tastiera negli esempi (girano così come sono)', () => {
    for (const language of QUICK_LANGUAGES) {
      for (const example of labExamples(language)) expect(example.code, `${language}/${example.kind}`).not.toMatch(/input\(|scanf|std::cin|ReadLine|Scanner|read_line/)
    }
  })
})

describe('cronologia delle esecuzioni', () => {
  const run = (id: string, code: string, language: RunRecord['language'] = 'python'): RunRecord => ({ id, at: 1, language, code, outcome: 'ok', durationMs: 5, preview: '' })

  it('la più recente in cima; lo stesso codice rieseguito non fa righe doppie', () => {
    let list = addRun([], run('a', 'print(1)'))
    list = addRun(list, run('b', 'print(2)'))
    list = addRun(list, run('c', 'print(2)'))
    expect(list.map((r) => r.id)).toEqual(['c', 'a'])
    // Stesso codice ma altro linguaggio: è un'altra esecuzione.
    expect(addRun(list, run('d', 'print(2)', 'javascript')).map((r) => r.id)).toEqual(['d', 'c', 'a'])
  })

  it('al massimo N righe', () => {
    let list: RunRecord[] = []
    for (let i = 0; i < 60; i++) list = addRun(list, run(String(i), `x = ${i}`))
    expect(list).toHaveLength(50)
    expect(list[0]!.id).toBe('59')
  })

  it('anteprima: la prima riga non vuota, accorciata', () => {
    expect(previewOf('\n\n  Ciao  \naltro')).toBe('Ciao')
    expect(previewOf('x'.repeat(200))).toHaveLength(80)
    expect(previewOf('')).toBe('')
  })

  it('lettura sicura da localStorage', () => {
    expect(parseHistory(null)).toEqual([])
    expect(parseHistory('rotto')).toEqual([])
    expect(parseHistory('{"a":1}')).toEqual([])
    expect(parseHistory(JSON.stringify([run('a', 'x'), { id: 3 }, null]))).toHaveLength(1)
  })
})
