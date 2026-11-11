import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { instrument } from '../../src/shared/trace/instrument'
import { traceFile } from '../../src/main/services/trace/tracer'

const dir = mkdtempSync(join(tmpdir(), 'lab-trace-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

async function trace(name: string, source: string) {
  writeFileSync(join(dir, name), source)
  return traceFile(dir, name)
}

describe('strumentazione', () => {
  it('un passo prima di ogni istruzione, anche nei corpi senza graffe', () => {
    const { code, lines } = instrument('let a = 1\nif (a) a++\nelse a--\nfor (let i = 0; i < 2; i++) a += i\n', false)
    expect(lines).toEqual([1, 2, 3, 4])
    expect(code).toContain('if (a) {__s(2,')
    expect(code).toContain('a += i}')
    expect(code.startsWith('__s(1,()=>[["a",()=>a,1]]);let a = 1')).toBe(true)
  })
  it('funzioni avvolte per la pila; frecce con espressione e oggetti fra parentesi', () => {
    const { code } = instrument('const f = (x) => ({ v: x })\nfunction g(n) { return n }\n', false)
    expect(code).toContain('const f = (x) => {__e("f",1);try{__s(1,')
    expect(code).toContain('return (({ v: x }))}finally{__x()}}')
    expect(code).toContain('function g(n) {__e("g",2);try{ __s(2,')
    expect(() => new Function(code.replace(/__[sex]\(/g, '(() => 0)('))).not.toThrow()
  })
  it('TypeScript: i tipi non diventano passi né variabili', () => {
    const { code, lines } = instrument('type D = "a" | "b"\ninterface P { x: number }\nconst n: number = 2\nimport type { Q } from "./q"\n', true)
    expect(lines).toEqual([3])
    expect(code).not.toContain('"D"')
    expect(code).not.toContain('"Q"')
  })
})

describe('esecuzione passo-passo', () => {
  it('righe, variabili, pila delle chiamate e output', async () => {
    const result = await trace(
      'somma.js',
      ['function somma(n) {', '  let totale = 0', '  for (let i = 1; i <= n; i++) {', '    totale += i', '  }', '  return totale', '}', 'const risultato = somma(3)', 'console.log("Risultato:", risultato)'].join('\n')
    )
    expect(result.error).toBeUndefined()
    expect(result.output).toEqual(['Risultato: 6'])
    expect(result.steps.map((s) => s.line)).toEqual([8, 2, 3, 4, 4, 4, 6, 9])
    const inside = result.steps.filter((s) => s.line === 4).at(-1)!
    expect(inside.frames.map((f) => f.name)).toEqual(['Globale', 'somma'])
    expect(Object.fromEntries(inside.frames[1]!.vars)).toEqual({ i: '3', totale: '3', n: '3' })
    expect(Object.fromEntries(inside.frames[0]!.vars)).toMatchObject({ risultato: '‹non ancora inizializzata›', somma: 'ƒ somma' })
    const last = result.steps.at(-1)!
    expect(last.frames).toHaveLength(1)
    expect(Object.fromEntries(last.frames[0]!.vars).risultato).toBe('6')
    expect(last.output).toBe(0)
  })
  it('TypeScript, oggetti e array come anteprime', async () => {
    const result = await trace('voti.ts', 'interface Voto { materia: string; voto: number }\nconst voti: Voto[] = [{ materia: "storia", voto: 8 }]\nvoti.push({ materia: "arte", voto: 7 })\nconsole.log(voti.length)\n')
    expect(result.error).toBeUndefined()
    const last = result.steps.at(-1)!
    expect(Object.fromEntries(last.frames[0]!.vars).voti).toBe("[ { materia: 'storia', voto: 8 }, { materia: 'arte', voto: 7 } ]")
  })
  it('errori: riga dell’errore, cicli infiniti fermati dal limite dei passi', async () => {
    const broken = await trace('rotto.js', 'const a = 1\nnull.x\n')
    expect(broken.error?.message).toContain('TypeError')
    expect(broken.error?.line).toBe(2)
    const loop = await trace('loop.js', 'let i = 0\nwhile (true) { i++ }\n')
    expect(loop.truncated).toBe(true)
    const syntax = await trace('sintassi.js', 'let = 3\n')
    expect(syntax.error?.message).toContain('sintassi')
    expect(syntax.error?.line).toBe(1)
  })
})
