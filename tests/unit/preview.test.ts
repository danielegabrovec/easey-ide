import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { COMPILE_ERROR_MARKER, compileErrorModule, injectBridge, rewriteBareImports } from '../../src/main/services/preview/transform'

describe('injectBridge', () => {
  it('mette il ponte come primo figlio di <head>', () => {
    const html = '<!doctype html><html><head><title>x</title></head><body></body></html>'
    expect(injectBridge(html)).toBe('<!doctype html><html><head><script src="/__ide__/bridge.js"></script><title>x</title></head><body></body></html>')
  })
  it('funziona anche senza <head> o senza <html>', () => {
    expect(injectBridge('<html lang="it"><body></body></html>')).toContain('<html lang="it"><script src="/__ide__/bridge.js"></script>')
    expect(injectBridge('<p>ciao</p>')).toBe('<script src="/__ide__/bridge.js"></script><p>ciao</p>')
  })
})

describe('rewriteBareImports', () => {
  it('manda i pacchetti npm su esm.sh e lascia stare i percorsi relativi e gli URL', () => {
    const code = [
      "import confetti from 'canvas-confetti'",
      "import { a } from './a.js'",
      "import x from '../x'",
      "import y from 'https://cdn.example/y.js'",
      "const m = await import('dayjs')"
    ].join('\n')
    const out = rewriteBareImports(code)
    expect(out).toContain("from 'https://esm.sh/canvas-confetti'")
    expect(out).toContain("from './a.js'")
    expect(out).toContain("from '../x'")
    expect(out).toContain("from 'https://cdn.example/y.js'")
    expect(out).toContain("import('https://esm.sh/dayjs')")
  })
})

describe('compileErrorModule', () => {
  it('segnala la posizione e interrompe con un errore marcato', () => {
    const reported: unknown[] = []
    const code = compileErrorModule('src/main.ts', 'Unexpected ";"', 3, 7)
    const window = { __ideCompileError: (info: unknown) => reported.push(info) }
    expect(() => runInNewContext(code, { window, SyntaxError })).toThrow(COMPILE_ERROR_MARKER)
    expect(reported).toEqual([{ path: 'src/main.ts', message: 'Unexpected ";"', line: 3, column: 7 }])
  })
})

describe('script ponte della console', () => {
  function loadBridge() {
    const posted: Record<string, unknown>[] = []
    const listeners: Record<string, ((event: unknown) => void)[]> = {}
    const fakeConsole: Record<string, (...args: unknown[]) => void> = {}
    for (const level of ['log', 'info', 'warn', 'error', 'debug']) fakeConsole[level] = () => undefined
    const window: Record<string, unknown> = {
      parent: { postMessage: (message: Record<string, unknown>) => posted.push(message) },
      addEventListener: (type: string, listener: (event: unknown) => void) => (listeners[type] ??= []).push(listener)
    }
    const source = readFileSync(join(__dirname, '../../src/main/services/preview/bridge.js'), 'utf8')
    runInNewContext(source, { window, console: fakeConsole, location: { href: 'ide-preview://project/index.html' }, performance: { now: () => 0 } })
    return { posted, listeners, console: fakeConsole, window }
  }

  it('si annuncia e serializza i valori di console.log', () => {
    const { posted, console } = loadBridge()
    expect(posted[0]).toMatchObject({ __ide: 1, kind: 'ready' })
    const circular: Record<string, unknown> = { nome: 'Ada' }
    circular['io'] = circular
    console['log']!('testo', 42, [1, 2], circular, undefined, null)
    const message = posted[1]!
    expect(message).toMatchObject({ kind: 'console', level: 'log' })
    expect(message['args']).toEqual([
      { t: 'string', v: 'testo' },
      { t: 'number', v: '42' },
      { t: 'array', items: [{ t: 'number', v: '1' }, { t: 'number', v: '2' }], length: 2 },
      { t: 'object', ctor: 'Object', entries: [['nome', { t: 'string', v: 'Ada' }], ['io', { t: 'circular' }]], more: false },
      { t: 'undefined' },
      { t: 'null' }
    ])
  })

  it('gestisce count, assert, table e clear', () => {
    const { posted, console } = loadBridge()
    console['count']!()
    console['count']!()
    console['assert']!(false, 'oops')
    console['table']!([{ a: 1 }])
    console['clear']!()
    const kinds = posted.slice(1).map((m) => [m['kind'], m['level']])
    expect(kinds).toEqual([
      ['console', 'log'],
      ['console', 'log'],
      ['console', 'error'],
      ['table', undefined],
      ['clear', undefined]
    ])
    expect((posted[2]!['args'] as { v: string }[])[0]!.v).toBe('default: 2')
  })

  it('non riporta due volte un errore di compilazione', () => {
    const { posted, listeners, window } = loadBridge()
    const onError = listeners['error']![0]!
    onError({ target: window, message: `Uncaught SyntaxError: ${COMPILE_ERROR_MARKER} src/a.ts:1:1 x` })
    onError({ target: window, message: 'Uncaught ReferenceError: x is not defined', filename: 'ide-preview://project/a.js', lineno: 2, colno: 3 })
    const errors = posted.filter((m) => m['kind'] === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ message: 'Uncaught ReferenceError: x is not defined', line: 2, column: 3 })
  })

  it('inoltra all’IDE solo le scorciatoie (Ctrl+… e tasti funzione)', () => {
    const { posted, listeners } = loadBridge()
    const onKey = listeners['keydown']![0]!
    onKey({ key: 'a', code: 'KeyA', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false })
    onKey({ key: 'Control', code: 'ControlLeft', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false })
    onKey({ key: 'P', code: 'KeyP', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false })
    onKey({ key: 'F5', code: 'F5', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false })
    expect(posted.filter((m) => m['kind'] === 'key').map((m) => [m['key'], m['ctrl'], m['shift']])).toEqual([
      ['P', true, true],
      ['F5', false, false]
    ])
  })

  it('valuta le espressioni inviate dalla riga di comando solo se arrivano dal genitore', () => {
    const { posted, listeners, window } = loadBridge()
    const onMessage = listeners['message']![0]!
    onMessage({ source: {}, data: { __ideEval: '1 + 1' } })
    expect(posted).toHaveLength(1)
    onMessage({ source: window['parent'], data: { __ideEval: '6 * 7' } })
    expect(posted[1]).toMatchObject({ kind: 'console', result: true, args: [{ t: 'number', v: '42' }] })
  })
})
