import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Markdown, splitBlocks } from '../../../src/renderer/ui/Markdown'

const answer = [
  'Ecco la correzione:',
  '',
  '```javascript',
  'function doppio(n) {',
  '  return n * 2;',
  '}',
  '```',
  '',
  '* Ho cambiato `3` in **2**.',
  '* Fine'
].join('\n')

describe('Markdown delle risposte AI', () => {
  it('separa testo e blocchi di codice', () => {
    const blocks = splitBlocks(answer)
    expect(blocks.map((b) => b.kind)).toEqual(['text', 'code', 'text'])
    expect(blocks[1]).toEqual({ kind: 'code', language: 'javascript', code: 'function doppio(n) {\n  return n * 2;\n}' })
  })
  it('rende codice, elenchi e formattazione senza HTML grezzo', () => {
    const html = renderToStaticMarkup(
      createElement(Markdown, { source: answer + '\n<img src=x onerror=alert(1)>', renderCode: ({ code }) => createElement('pre', null, code) })
    )
    expect(html).toContain('<pre>function doppio(n) {\n  return n * 2;\n}</pre>')
    expect(html).toContain('<li>Ho cambiato <code>3</code> in <strong>2</strong>.</li>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
  it('blocco di codice non ancora chiuso durante lo streaming', () => {
    expect(splitBlocks('```ts\nconst a = 1')).toEqual([{ kind: 'code', language: 'ts', code: 'const a = 1' }])
  })
})
