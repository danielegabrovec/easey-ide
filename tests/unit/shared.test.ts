import { transform } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { basenameOf, dirnameOf, extensionOf, isScriptFile, isTextFile, joinRelative, languageOf, normalizeRelative } from '@shared/paths'
import { decodeVlq, SourceMapReader, type RawSourceMap } from '@shared/sourcemap'
import { firstProjectFrame, parseStackFrames } from '@shared/stack'

describe('paths', () => {
  it('normalizza separatori e punti', () => {
    expect(normalizeRelative('src\\app\\main.ts')).toBe('src/app/main.ts')
    expect(normalizeRelative('./src//main.ts/')).toBe('src/main.ts')
    expect(normalizeRelative('/index.html')).toBe('index.html')
  })
  it('rifiuta le uscite dal progetto', () => {
    expect(() => normalizeRelative('../segreto.txt')).toThrow()
    expect(() => normalizeRelative('src/../../x')).toThrow()
  })
  it('estensioni, nomi e linguaggi', () => {
    expect(extensionOf('src/Main.TS')).toBe('ts')
    expect(extensionOf('.gitignore')).toBe('')
    expect(basenameOf('a/b/c.css')).toBe('c.css')
    expect(dirnameOf('a/b/c.css')).toBe('a/b')
    expect(dirnameOf('c.css')).toBe('')
    expect(joinRelative('', 'x.ts')).toBe('x.ts')
    expect(joinRelative('src', 'x.ts')).toBe('src/x.ts')
    expect(languageOf('index.html')).toBe('html')
    expect(languageOf('app.tsx')).toBe('typescript')
    expect(languageOf('query.sql')).toBe('sql')
    expect(isScriptFile('main.mts')).toBe(true)
    expect(isScriptFile('index.html')).toBe(false)
    expect(isTextFile('foto.png')).toBe(false)
    expect(isTextFile('LICENSE')).toBe(true)
  })
})

describe('sourcemap', () => {
  it('decodifica VLQ', () => {
    expect(decodeVlq('AAAA')).toEqual([0, 0, 0, 0])
    expect(decodeVlq('AACA')).toEqual([0, 0, 1, 0])
    expect(decodeVlq('D')).toEqual([-1])
    expect(decodeVlq('gB')).toEqual([16])
  })
  it('riporta una posizione del JS generato sulla riga TS originale', async () => {
    const source = [
      'interface Persona {',
      '  nome: string',
      '  anni: number',
      '}',
      '',
      'type Id = number',
      '',
      'const p: Persona = { nome: "Ada", anni: 36 }',
      'console.log(p.nome)'
    ].join('\n')
    const result = await transform(source, { loader: 'ts', sourcemap: 'external', sourcefile: 'main.ts' })
    const generatedLines = result.code.split('\n')
    const line = generatedLines.findIndex((l) => l.includes('console.log')) + 1
    const column = generatedLines[line - 1]!.indexOf('console') + 1
    const reader = new SourceMapReader(JSON.parse(result.map) as RawSourceMap)
    expect(reader.originalPosition(line, column)).toEqual({ source: 'main.ts', line: 9, column: 1 })
  })
  it('restituisce null per righe senza mappature', () => {
    const reader = new SourceMapReader({ version: 3, sources: ['a.ts'], mappings: ';;' })
    expect(reader.originalPosition(2, 1)).toBeNull()
  })
})

describe('stack', () => {
  const stack = [
    'Error',
    '    at caller (ide-preview://project/__ide__/bridge.js:30:17)',
    '    at console.log (ide-preview://project/__ide__/bridge.js:120:9)',
    '    at HTMLButtonElement.<anonymous> (ide-preview://project/src/main.ts:14:11)',
    '    at https://esm.sh/lodash:1:2'
  ].join('\n')
  it('legge i frame', () => {
    expect(parseStackFrames(stack)).toHaveLength(4)
  })
  it('salta il ponte e trova il primo frame del progetto', () => {
    expect(firstProjectFrame(stack, 'ide-preview')).toEqual({ url: 'ide-preview://project/src/main.ts', line: 14, column: 11 })
  })
})
