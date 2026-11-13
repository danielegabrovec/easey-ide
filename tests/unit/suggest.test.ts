import { describe, expect, it } from 'vitest'
import { applySuggestion, buildSuggestMessages, codeFromAnswer, CURSOR_MARK, defaultScope, offsetAt } from '../../src/shared/ai/suggest'

const text = 'SELECT c.nome\nFROM clienti c\nWHERE c.attivo = 1;\n'

describe('Chiedi suggerimento', () => {
  it('offsetAt converte riga e colonna a base 1, restando nei limiti', () => {
    expect(offsetAt(text, 1, 1)).toBe(0)
    expect(offsetAt(text, 2, 1)).toBe('SELECT c.nome\n'.length)
    expect(offsetAt(text, 2, 99)).toBe('SELECT c.nome\nFROM clienti c'.length)
    expect(offsetAt(text, 99, 1)).toBe(text.length)
  })

  it('ambito predefinito: selezione se c’è, altrimenti cursore', () => {
    expect(defaultScope(null)).toBe('cursor')
    expect(defaultScope({ startLine: 1, startColumn: 1, endLine: 1, endColumn: 5 })).toBe('selection')
  })

  it('al cursore: il prompt segna il punto e il codice si inserisce lì', () => {
    const input = { request: 'aggiungi la JOIN con gli ordini', scope: 'cursor' as const, language: 'sql', path: 'q.sql', text, cursor: { line: 3, column: 1 }, selection: null, context: '-- clienti(id, nome)' }
    const [system, user] = buildSuggestMessages(input, 'SISTEMA')
    expect(system).toEqual({ role: 'system', content: 'SISTEMA' })
    expect(user!.content).toContain(`FROM clienti c\n${CURSOR_MARK}WHERE`)
    expect(user!.content).toContain('-- clienti(id, nome)')
    expect(user!.content).toContain('aggiungi la JOIN con gli ordini')
    expect(applySuggestion(input, 'JOIN ordini o ON o.cliente_id = c.id\n')).toBe('SELECT c.nome\nFROM clienti c\nJOIN ordini o ON o.cliente_id = c.id\nWHERE c.attivo = 1;\n')
  })

  it('righe selezionate: solo la selezione viene sostituita', () => {
    const selection = { startLine: 3, startColumn: 1, endLine: 3, endColumn: 20 }
    const input = { request: 'filtra anche per Milano', scope: 'selection' as const, language: 'sql', path: 'q.sql', text, cursor: { line: 3, column: 1 }, selection }
    expect(buildSuggestMessages(input, 's')[1]!.content).toContain('DA RISCRIVERE (righe 3-3):\n```sql\nWHERE c.attivo = 1;\n```')
    expect(applySuggestion(input, "WHERE c.attivo = 1 AND c.citta = 'Milano';")).toBe("SELECT c.nome\nFROM clienti c\nWHERE c.attivo = 1 AND c.citta = 'Milano';\n")
  })

  it('tutto il file: sostituito, a capo finale conservato', () => {
    const input = { scope: 'file' as const, text, cursor: { line: 1, column: 1 }, selection: null }
    expect(applySuggestion(input, 'SELECT 1;')).toBe('SELECT 1;\n')
  })

  it('dalla risposta prende il primo blocco di codice e toglie il segnaposto', () => {
    expect(codeFromAnswer('Ecco:\n```sql\nJOIN ordini o ON o.cliente_id = c.id\n```\nAggiunta la JOIN.')).toBe('JOIN ordini o ON o.cliente_id = c.id')
    expect(codeFromAnswer(`\`\`\`\nSELECT 1 ${CURSOR_MARK}\n\`\`\``)).toBe('SELECT 1')
    expect(codeFromAnswer('SELECT 2')).toBe('SELECT 2')
  })

  it('JavaScript: completa a metà riga e aggiunge righe dentro una funzione', () => {
    const js = 'function somma(a, b) {\n  return \n}\n'
    const input = { scope: 'cursor' as const, text: js, cursor: { line: 2, column: 10 }, selection: null }
    const [, user] = buildSuggestMessages({ ...input, request: 'completa', language: 'javascript', path: 'main.js' }, 's')
    expect(user!.content).toContain(`  return ${CURSOR_MARK}\n}`)
    expect(user!.content).not.toContain('Contesto:')
    expect(applySuggestion(input, 'a + b')).toBe('function somma(a, b) {\n  return a + b\n}\n')
  })

  it('HTML: il blocco ```html della risposta diventa il nuovo file', () => {
    const answer = 'Ecco la pagina:\n```html\n<!doctype html>\n<h1>Ciao</h1>\n```\nHo aggiunto il titolo.'
    const code = codeFromAnswer(answer)
    expect(applySuggestion({ scope: 'file', text: '<p>vecchio</p>\n', cursor: { line: 1, column: 1 }, selection: null }, code)).toBe('<!doctype html>\n<h1>Ciao</h1>\n')
  })
})
