// Guide: logica pura dei percorsi guidati (copiata da Easey DB), «Prossimo passo», aiuto F1 e glossario.
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  applySignal,
  bubblePlacement,
  currentStep,
  exitTour,
  MISSING_AFTER_MS,
  nextStep,
  OPEN_AFTER_MS,
  previousStep,
  startTour,
  stepProgress,
  waitSatisfied,
  withCompleted,
  type TourDefinition
} from '../../src/shared/guide/tour'
import { HELP_PAGES, helpPageFor, isHelpPage } from '../../src/shared/guide/help'
import { nextHints, type HintState } from '../../src/shared/guide/hints'
import { GLOSSARY, glossaryEntry, searchGlossary } from '../../src/shared/guide/glossary'
// ------------------------------------------------------------------ percorsi guidati

let flag = false
const TOUR: TourDefinition = {
  id: 'prova',
  title: 'Prova',
  description: '',
  minutes: 1,
  steps: [
    { id: 'intro', title: 'Ciao', text: '' },
    { id: 'progetto', title: '', text: '', target: '#nuovo', open: { command: 'home.show' }, wait: { kind: 'event', event: 'project:opened' } },
    { id: 'comando', title: '', text: '', target: '#applica', wait: { kind: 'command', command: 'sql.saveQuery', needResult: true } },
    { id: 'elemento', title: '', text: '', target: '#griglia', wait: { kind: 'element', selector: '[data-testid="grid-new-row"]' } },
    { id: 'controllo', title: '', text: '', wait: { kind: 'check', test: () => flag } },
    { id: 'fine', title: '', text: '' }
  ]
}
const poll = (now: number, visible: string[] = []) => ({ kind: 'poll' as const, now, present: (s: string) => visible.includes(s) })

describe('percorsi guidati: logica dei passi', () => {
  it('Avanti, Indietro, Esci e «passo 2 di 6»', () => {
    let state = startTour(TOUR, 0)
    expect(stepProgress(state)).toEqual({ n: 1, total: 6 })
    expect(previousStep(state, 1)).toBe(state)
    state = nextStep(state, 10)
    expect(currentStep(TOUR, state)?.id).toBe('progetto')
    expect(stepProgress(state)).toEqual({ n: 2, total: 6 })
    expect(state.enteredAt).toBe(10)
    state = previousStep(state, 20)
    expect(currentStep(TOUR, state)?.id).toBe('intro')
    const exited = exitTour(state)
    expect(exited.status).toBe('exited')
    expect(currentStep(TOUR, exited)).toBeNull()
    expect(nextStep(exited, 30)).toBe(exited)
  })

  it('dopo l’ultimo passo il percorso è finito', () => {
    let state = startTour(TOUR, 0)
    for (let i = 0; i < 6; i++) state = nextStep(state, i)
    expect(state.status).toBe('done')
  })

  it('un evento compie il passo che lo aspetta (e non gli altri)', () => {
    const state = nextStep(startTour(TOUR, 0), 0)
    expect(applySignal(TOUR, state, { kind: 'event', event: 'db:active' }).state).toBe(state)
    const after = applySignal(TOUR, state, { kind: 'event', event: 'project:opened', payload: {} }).state
    expect(currentStep(TOUR, after)?.id).toBe('comando')
  })

  it('un comando compie il passo solo se ha dato un risultato (annullato = null)', () => {
    const state = { ...startTour(TOUR, 0), index: 2 }
    expect(applySignal(TOUR, state, { kind: 'command', command: 'sql.saveQuery', result: null }).state.index).toBe(2)
    expect(applySignal(TOUR, state, { kind: 'command', command: 'sql.runText', result: [] }).state.index).toBe(2)
    expect(applySignal(TOUR, state, { kind: 'command', command: 'sql.saveQuery', result: 'queries/x.sql' }).state.index).toBe(3)
  })

  it('un elemento che compare e una condizione compiono il passo', () => {
    const state = { ...startTour(TOUR, 0), index: 3 }
    expect(applySignal(TOUR, state, poll(5, ['#griglia'])).state.index).toBe(3)
    expect(applySignal(TOUR, state, poll(5, ['#griglia', '[data-testid="grid-new-row"]'])).state.index).toBe(4)
    const check = { ...state, index: 4 }
    flag = false
    expect(applySignal(TOUR, check, poll(5)).state.index).toBe(4)
    flag = true
    expect(applySignal(TOUR, check, poll(5)).state.index).toBe(5)
  })

  it('bersaglio mancante: prima apre il pannello col comando del passo, poi lo dice', () => {
    const state = nextStep(startTour(TOUR, 0), 1000)
    expect(applySignal(TOUR, state, poll(1000 + OPEN_AFTER_MS - 1)).open).toBeUndefined()
    const opening = applySignal(TOUR, state, poll(1000 + OPEN_AFTER_MS))
    expect(opening.open).toEqual({ command: 'home.show' })
    expect(opening.state.opened).toBe(true)
    // Aperto una volta sola.
    expect(applySignal(TOUR, opening.state, poll(1000 + OPEN_AFTER_MS + 100)).open).toBeUndefined()
    const missing = applySignal(TOUR, opening.state, poll(1000 + MISSING_AFTER_MS)).state
    expect(missing.missing).toBe(true)
    // Il bersaglio ricompare: niente più avviso.
    expect(applySignal(TOUR, missing, poll(1000 + MISSING_AFTER_MS + 10, ['#nuovo'])).state.missing).toBe(false)
  })

  it('waitSatisfied e il filtro sul contenuto degli eventi', () => {
    const wait = { kind: 'event' as const, event: 'files:changed', test: (p: unknown) => ((p as { paths: string[] }).paths ?? []).some((x) => x.startsWith('codegen/')) }
    expect(waitSatisfied(wait, { kind: 'event', event: 'files:changed', payload: { paths: ['schema/model.json'] } })).toBe(false)
    expect(waitSatisfied(wait, { kind: 'event', event: 'files:changed', payload: { paths: ['codegen/ts-data/README.md'] } })).toBe(true)
    expect(waitSatisfied(undefined, { kind: 'event', event: 'x' })).toBe(false)
    // Una condizione che si rompe non rompe il percorso.
    expect(waitSatisfied({ kind: 'check', test: () => { throw new Error('boom') } }, poll(1))).toBe(false)
  })

  it('percorsi completati senza doppioni; posizione della nuvoletta dove c’è spazio', () => {
    expect(withCompleted(['a'], 'b')).toEqual(['a', 'b'])
    expect(withCompleted(['a', 'b'], 'a')).toEqual(['a', 'b'])
    const viewport = { width: 1400, height: 900 }
    const bubble = { width: 340, height: 180 }
    expect(bubblePlacement({ x: 100, y: 50, width: 100, height: 30 }, viewport, bubble)).toBe('bottom')
    expect(bubblePlacement({ x: 100, y: 800, width: 100, height: 30 }, viewport, bubble)).toBe('right')
    expect(bubblePlacement({ x: 1200, y: 800, width: 150, height: 60 }, viewport, bubble)).toBe('top')
    expect(bubblePlacement({ x: 600, y: 300, width: 100, height: 30 }, viewport, bubble, 'left')).toBe('left')
  })
})


// ------------------------------------------------------------------ aiuto F1, prossimo passo e glossario (Easey IDE)


describe('aiuto contestuale (F1)', () => {
  it('ogni pagina esiste in resources/help', () => {
    for (const page of HELP_PAGES) expect(existsSync(new URL(`../../resources/help/${page}.md`, import.meta.url)), page).toBe(true)
  })
  it('la pagina segue il pannello attivo', () => {
    expect(helpPageFor('editor:src/main.ts')).toBe('editor')
    expect(helpPageFor('visual:programma.blocchi.json')).toBe('visuale')
    expect(helpPageFor('sql-results')).toBe('database')
    expect(helpPageFor('quick')).toBe('scrittura-rapida')
    expect(helpPageFor('designer')).toBe('designer')
    expect(helpPageFor('editor:x.js', true)).toBe('assistente')
    expect(helpPageFor(null)).toBe('benvenuto')
    expect(isHelpPage('corsi')).toBe(true)
    expect(isHelpPage('altro')).toBe(false)
  })
})

describe('«Cosa fare adesso» (nextHints)', () => {
  const base: HintState = { hasProject: true, runMode: 'web', errors: 0, dirty: 0, autoSave: true, ran: false, designed: false, ai: 'ready' }
  it('senza progetto: crea un progetto, Scrittura rapida, corsi', () => {
    expect(nextHints({ ...base, hasProject: false, runMode: null }).map((h) => h.kind)).toEqual(['no-project', 'quick', 'courses'])
  })
  it('gli errori vengono prima di tutto; con errori non si propone di eseguire', () => {
    const kinds = nextHints({ ...base, errors: 3 }).map((h) => h.kind)
    expect(kinds[0]).toBe('errors')
    expect(kinds).not.toContain('run')
  })
  it('file non salvati solo col salvataggio automatico spento', () => {
    expect(nextHints({ ...base, dirty: 2 }).map((h) => h.kind)).not.toContain('unsaved')
    expect(nextHints({ ...base, dirty: 2, autoSave: false })[0]).toMatchObject({ kind: 'unsaved', params: { n: 2 }, command: 'editor.saveAll' })
  })
  it('esegui e designer finché non si sono provati; i suggerimenti chiusi spariscono', () => {
    expect(nextHints(base).map((h) => h.kind)).toEqual(['run', 'designer'])
    expect(nextHints({ ...base, ran: true, designed: true })).toEqual([])
    expect(nextHints({ ...base, runMode: 'terminal' }).map((h) => h.kind)).toEqual(['run'])
    expect(nextHints({ ...base, dismissed: ['run'] }).map((h) => h.kind)).toEqual(['designer'])
    expect(nextHints({ ...base, ran: true, designed: true, ai: 'missing' }).map((h) => h.kind)).toEqual(['ai-missing'])
  })
})

describe('glossario', () => {
  it('voci uniche, in italiano e in inglese', () => {
    expect(new Set(GLOSSARY.map((e) => e.id)).size).toBe(GLOSSARY.length)
    for (const entry of GLOSSARY) {
      expect(entry.it.plain && entry.it.explanation && entry.en.plain && entry.en.explanation, entry.id).toBeTruthy()
    }
  })
  it('la ricerca ignora accenti e maiuscole e guarda anche il termine tecnico', () => {
    expect(searchGlossary('CICLO', 'it').map((e) => e.id)).toContain('ciclo')
    expect(searchGlossary('esecuzione', 'it').map((e) => e.id)).toContain('eccezione')
    expect(searchGlossary('querySelector', 'it').map((e) => e.id)).toContain('dom')
    expect(searchGlossary('loop', 'en').map((e) => e.id)).toContain('ciclo')
    expect(searchGlossary('', 'it')).toHaveLength(GLOSSARY.length)
    expect(glossaryEntry('variabile')?.term).toContain('let')
  })
})
