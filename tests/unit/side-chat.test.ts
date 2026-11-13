import { describe, expect, it } from 'vitest'
import {
  clampSideWidth,
  DEFAULT_SIDE_STATE,
  dragSideWidth,
  effectiveSideWidth,
  keySideWidth,
  maxSideWidth,
  parseSideState,
  SIDE_DEFAULT_WIDTH,
  SIDE_MIN_WIDTH
} from '../../src/shared/ai/side-panel'
import { parseSlash, slashSuggestions } from '../../src/shared/ai/slash'
import {
  buildContextPrompt,
  keepTrailingNewline,
  positionAt,
  resolveApplyTarget,
  selectionLineSpan,
  textInRange,
  wholeFileRange,
  type ChatContextSnapshot
} from '../../src/shared/ai/chat-context'

describe('Pannello AI laterale: larghezza', () => {
  it('min 300 px e max 70 % della finestra', () => {
    expect(maxSideWidth(1500)).toBe(1050)
    expect(clampSideWidth(100, 1500)).toBe(SIDE_MIN_WIDTH)
    expect(clampSideWidth(2000, 1500)).toBe(1050)
    expect(clampSideWidth(420.4, 1500)).toBe(420)
    expect(clampSideWidth(Number.NaN, 1500)).toBe(SIDE_DEFAULT_WIDTH)
  })

  it('in una finestra stretta il massimo non scende sotto il minimo', () => {
    expect(maxSideWidth(350)).toBe(SIDE_MIN_WIDTH)
    expect(clampSideWidth(500, 350)).toBe(SIDE_MIN_WIDTH)
  })

  it('espanso = 70 %, altrimenti la larghezza scelta', () => {
    expect(effectiveSideWidth({ open: true, width: 400, expanded: false }, 1500)).toBe(400)
    expect(effectiveSideWidth({ open: true, width: 400, expanded: true }, 1500)).toBe(1050)
    // La larghezza scelta resta nei limiti anche se la finestra si è ristretta.
    expect(effectiveSideWidth({ open: true, width: 900, expanded: false }, 1000)).toBe(700)
  })

  it('trascinare a sinistra allarga, a destra stringe, sempre nei limiti', () => {
    expect(dragSideWidth(400, 1100, 1000, 1500)).toBe(500)
    expect(dragSideWidth(400, 1100, 1250, 1500)).toBe(SIDE_MIN_WIDTH)
    expect(dragSideWidth(400, 1100, 0, 1500)).toBe(1050)
  })

  it('tastiera sulla maniglia: frecce, Maiusc, Home/End, PagSu/PagGiù', () => {
    expect(keySideWidth(400, 'ArrowLeft', 1500)).toBe(420)
    expect(keySideWidth(400, 'ArrowRight', 1500)).toBe(380)
    expect(keySideWidth(400, 'ArrowLeft', 1500, true)).toBe(460)
    expect(keySideWidth(400, 'PageUp', 1500)).toBe(500)
    expect(keySideWidth(400, 'PageDown', 1500)).toBe(300)
    expect(keySideWidth(400, 'Home', 1500)).toBe(SIDE_MIN_WIDTH)
    expect(keySideWidth(400, 'End', 1500)).toBe(1050)
    expect(keySideWidth(310, 'ArrowRight', 1500)).toBe(SIDE_MIN_WIDTH)
    expect(keySideWidth(400, 'Enter', 1500)).toBeNull()
  })

  it('stato salvato: valori validi conservati, sbagliati ai predefiniti', () => {
    expect(parseSideState(null)).toEqual(DEFAULT_SIDE_STATE)
    expect(parseSideState('non json')).toEqual(DEFAULT_SIDE_STATE)
    expect(parseSideState(JSON.stringify({ open: true, width: 520, expanded: true }))).toEqual({ open: true, width: 520, expanded: true })
    expect(parseSideState(JSON.stringify({ open: 'sì', width: -4 }))).toEqual({ open: true, width: SIDE_DEFAULT_WIDTH, expanded: false })
    expect(parseSideState(JSON.stringify({ open: true, width: 120 }))).toEqual({ open: true, width: SIDE_MIN_WIDTH, expanded: false })
  })

  it('al primo avvio la chat è aperta; chiusa dall’utente resta chiusa', () => {
    expect(DEFAULT_SIDE_STATE.open).toBe(true)
    expect(parseSideState(null).open).toBe(true)
    expect(parseSideState(JSON.stringify({ open: false, width: 400 })).open).toBe(false)
  })
})

describe('Comandi / nella casella', () => {
  it('riconosce i comandi italiani e gli alias inglesi, con istruzioni in più', () => {
    expect(parseSlash('/spiega')).toEqual({ action: 'explain', extra: '' })
    expect(parseSlash('  /correggi usa const al posto di var ')).toEqual({ action: 'fix', extra: 'usa const al posto di var' })
    expect(parseSlash('/Commenta')).toEqual({ action: 'comment', extra: '' })
    expect(parseSlash('/test\ncon casi limite')).toEqual({ action: 'tests', extra: 'con casi limite' })
    expect(parseSlash('/errore')).toEqual({ action: 'error', extra: '' })
    expect(parseSlash('/fix')).toEqual({ action: 'fix', extra: '' })
  })

  it('testo normale o comandi sconosciuti non sono comandi', () => {
    expect(parseSlash('spiega questo')).toBeNull()
    expect(parseSlash('/boh')).toBeNull()
    expect(parseSlash('a /spiega')).toBeNull()
    expect(parseSlash('/spiegami')).toBeNull()
  })

  it('tendina: tutti con «/», filtrati mentre si scrive, chiusa dopo lo spazio', () => {
    expect(slashSuggestions('/', 'it').map((s) => s.name)).toEqual(['spiega', 'correggi', 'commenta', 'test', 'errore'])
    expect(slashSuggestions('/co', 'it').map((s) => s.name)).toEqual(['correggi', 'commenta'])
    expect(slashSuggestions('/co', 'en').map((s) => s.name)).toEqual(['fix', 'comment'])
    expect(slashSuggestions('/e', 'en').map((s) => s.action)).toEqual(['explain', 'error'])
    expect(slashSuggestions('/spiega ', 'it')).toEqual([])
    expect(slashSuggestions('ciao', 'it')).toEqual([])
  })
})

describe('Contesto del documento', () => {
  const text = 'const a = 1\nfunction doppio(n) {\n  return n * 3\n}\nconsole.log(doppio(2))\n'
  const range = { startLine: 2, startColumn: 1, endLine: 4, endColumn: 2 }
  const selected = 'function doppio(n) {\n  return n * 3\n}'
  const snap = (selection: ChatContextSnapshot['selection'], problems: ChatContextSnapshot['problems'] = []): ChatContextSnapshot => ({ path: 'main.js', language: 'javascript', text, selection, problems })

  it('righe della selezione: una riga intera selezionata non conta la riga successiva', () => {
    expect(selectionLineSpan(range)).toEqual({ start: 2, end: 4 })
    expect(selectionLineSpan({ startLine: 3, startColumn: 1, endLine: 11, endColumn: 1 })).toEqual({ start: 3, end: 10 })
    expect(selectionLineSpan({ startLine: 5, startColumn: 3, endLine: 5, endColumn: 1 })).toEqual({ start: 5, end: 5 })
  })

  it('intervalli e posizioni', () => {
    expect(wholeFileRange('a\nbc')).toEqual({ startLine: 1, startColumn: 1, endLine: 2, endColumn: 3 })
    expect(positionAt(text, 12)).toEqual({ line: 2, column: 1 })
    expect(textInRange(text, range)).toBe(selected)
  })

  it('prompt: domanda, codice della selezione o del file, problemi se allegati', () => {
    const labels = { header: 'Codice selezionato in main.js:', problems: 'Problemi segnalati:' }
    expect(buildContextPrompt('Ciao', null, labels)).toBe('Ciao')
    const withSelection = buildContextPrompt('Cosa fa?', snap({ text: selected, range }), labels)
    expect(withSelection).toBe(`Cosa fa?\n\nCodice selezionato in main.js:\n\`\`\`javascript\n${selected}\n\`\`\``)
    const withProblems = buildContextPrompt('Perché?', snap(null, [{ line: 3, column: 10, message: 'Valore sbagliato', severity: 'error' }]), labels)
    expect(withProblems).toContain(`\`\`\`javascript\n${text}\n\`\`\``)
    expect(withProblems.endsWith('Problemi segnalati:\n- 3:10 error: Valore sbagliato')).toBe(true)
  })

  it('il codice si taglia a 12000 caratteri', () => {
    const long = 'x'.repeat(20000)
    const prompt = buildContextPrompt('?', { ...snap(null), text: long }, { header: 'File:', problems: '' })
    expect(prompt.length).toBeLessThan(12100)
  })

  it('Applica: file invariato → stesso intervallo', () => {
    expect(resolveApplyTarget(snap({ text: selected, range }), text)).toEqual({ status: 'same', range, original: selected })
    expect(resolveApplyTarget(snap(null), text)).toEqual({ status: 'same', range: wholeFileRange(text), original: text })
  })

  it('Applica: file cambiato ma la selezione c’è ancora → intervallo spostato', () => {
    const current = '// nuovo commento\n' + text
    const target = resolveApplyTarget(snap({ text: selected, range }), current)
    expect(target.status).toBe('moved')
    expect(target.range).toEqual({ startLine: 3, startColumn: 1, endLine: 5, endColumn: 2 })
    expect(textInRange(current, target.range)).toBe(selected)
  })

  it('Applica: file cambiato e selezione sparita → confronto dal testo attuale', () => {
    const current = text.replace('n * 3', 'n * 4')
    const target = resolveApplyTarget(snap({ text: selected, range }), current)
    expect(target.status).toBe('changed')
    expect(target.original).toBe(selected.replace('n * 3', 'n * 4'))
    const whole = resolveApplyTarget(snap(null), current)
    expect(whole).toEqual({ status: 'changed', range: wholeFileRange(current), original: current })
  })

  it('Applica: l’a capo finale del pezzo sostituito si conserva', () => {
    expect(keepTrailingNewline('a\nb\n', 'a\nB')).toBe('a\nB\n')
    expect(keepTrailingNewline('a\nb\n', 'a\nB\n')).toBe('a\nB\n')
    expect(keepTrailingNewline('a\nb', 'a\nB')).toBe('a\nB')
  })

  it('Applica: selezione ripetuta più volte nel testo attuale → non si indovina', () => {
    const current = text + selected + '\n'
    expect(resolveApplyTarget(snap({ text: selected, range }), current).status).toBe('changed')
  })
})
