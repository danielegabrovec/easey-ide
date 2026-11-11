import { describe, expect, it } from 'vitest'
import { BLOCKS } from '@shared/designer/blocks'
import { buildCanvasDocument, resolveRelative } from '@shared/designer/canvas-document'
import { appendRulesOnce, getDeclarations, getVariables, setDeclarations, setVariable } from '@shared/designer/css-edit'
import { applyEdits, duplicateElement, ensureId, insertHtml, linkedStylesheets, moveElement, removeElement, setAttribute, setText } from '@shared/designer/html-edit'
import { elementAtOffset, findByAttrId, isFreeElement, parseHtml } from '@shared/designer/html-model'

const PAGE = `<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <!-- foglio di stile -->
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <main class="scheda">
      <h1 id="titolo">Ciao!</h1>
      <p>Premi il pulsante.</p>
      <button id="pulsante" onclick="saluta()">Salutami</button>
    </main>
    <div class="tavola">
      <span id="stella">★</span>
    </div>
    <script src="script.js"></script>
  </body>
</html>
`

const byTag = (source: string, tag: string) => parseHtml(source).elements.find((e) => e.tag === tag)!

describe('modello HTML', () => {
  it('numera gli elementi con le loro posizioni', () => {
    const model = parseHtml(PAGE)
    const h1 = findByAttrId(model, 'titolo')!
    expect(PAGE.slice(h1.start, h1.end)).toBe('<h1 id="titolo">Ciao!</h1>')
    expect(h1.leafText).toBe(true)
    expect(model.elements[h1.parent!]!.tag).toBe('main')
    expect(linkedStylesheets(model)).toEqual(['style.css'])
    expect(isFreeElement(model, findByAttrId(model, 'stella')!.id)).toBe(true)
    expect(isFreeElement(model, h1.id)).toBe(false)
    expect(elementAtOffset(model, PAGE.indexOf('Premi'))!.tag).toBe('p')
  })
})

describe('modifiche chirurgiche HTML', () => {
  it('testo e attributi cambiano solo dove serve', () => {
    const model = parseHtml(PAGE)
    const h1 = findByAttrId(model, 'titolo')!
    let out = applyEdits(PAGE, setText(model, h1.id, 'Benvenuti <tutti>'))
    expect(out).toContain('<h1 id="titolo">Benvenuti &lt;tutti&gt;</h1>')
    expect(out.replace('Benvenuti &lt;tutti&gt;', 'Ciao!')).toBe(PAGE)
    out = applyEdits(PAGE, setAttribute(model, h1.id, 'class', 'grande'))
    expect(out).toContain('<h1 id="titolo" class="grande">')
    out = applyEdits(PAGE, setAttribute(model, findByAttrId(model, 'pulsante')!.id, 'onclick', null))
    expect(out).toContain('<button id="pulsante">Salutami</button>')
    const meta = byTag(PAGE, 'meta')
    expect(applyEdits(PAGE, setAttribute(parseHtml(PAGE), meta.id, 'name', 'x'))).toContain('<meta charset="UTF-8" name="x" />')
  })

  it('inserisce con il rientro giusto', () => {
    const model = parseHtml(PAGE)
    const main = byTag(PAGE, 'main')
    const out = applyEdits(PAGE, insertHtml(model, main.id, 'inside-end', '<ul>\n  <li>uno</li>\n</ul>'))
    expect(out).toContain('      <button id="pulsante" onclick="saluta()">Salutami</button>\n      <ul>\n        <li>uno</li>\n      </ul>\n    </main>')
    const after = applyEdits(PAGE, insertHtml(model, findByAttrId(model, 'titolo')!.id, 'after', '<h2>Sotto</h2>'))
    expect(after).toContain('<h1 id="titolo">Ciao!</h1>\n      <h2>Sotto</h2>\n      <p>')
    const before = applyEdits(PAGE, insertHtml(model, findByAttrId(model, 'titolo')!.id, 'before', '<small>Sopra</small>'))
    expect(before).toContain('<main class="scheda">\n      <small>Sopra</small>\n      <h1 id="titolo">')
    const empty = '<body>\n  <div></div>\n</body>'
    const emptyModel = parseHtml(empty)
    expect(applyEdits(empty, insertHtml(emptyModel, byTag(empty, 'div').id, 'inside-end', '<p>x</p>'))).toBe('<body>\n  <div>\n    <p>x</p>\n  </div>\n</body>')
  })

  it('elimina, sposta e duplica senza lasciare righe vuote', () => {
    const model = parseHtml(PAGE)
    const p = byTag(PAGE, 'p')
    expect(applyEdits(PAGE, removeElement(model, p.id))).toContain('<h1 id="titolo">Ciao!</h1>\n      <button')
    const moved = applyEdits(PAGE, moveElement(model, findByAttrId(model, 'pulsante')!.id, findByAttrId(model, 'titolo')!.id, 'before'))
    expect(moved).toContain('<main class="scheda">\n      <button id="pulsante" onclick="saluta()">Salutami</button>\n      <h1 id="titolo">Ciao!</h1>\n      <p>Premi il pulsante.</p>\n    </main>')
    const into = applyEdits(PAGE, moveElement(model, findByAttrId(model, 'stella')!.id, byTag(PAGE, 'main').id, 'inside-end'))
    expect(into).toContain('<button id="pulsante" onclick="saluta()">Salutami</button>\n      <span id="stella">★</span>\n    </main>\n    <div class="tavola">\n    </div>')
    expect(() => moveElement(model, byTag(PAGE, 'main').id, findByAttrId(model, 'titolo')!.id, 'after')).toThrow()
    const dup = applyEdits(PAGE, duplicateElement(model, findByAttrId(model, 'titolo')!.id, 'titolo-2'))
    expect(dup).toContain('<h1 id="titolo">Ciao!</h1>\n      <h1 id="titolo-2">Ciao!</h1>')
  })

  it('assegna un id leggibile e univoco', () => {
    const model = parseHtml(PAGE)
    const result = ensureId(model, byTag(PAGE, 'p').id)
    expect(result.id).toBe('paragrafo-1')
    expect(applyEdits(PAGE, result.edits)).toContain('<p id="paragrafo-1">Premi il pulsante.</p>')
    expect(ensureId(model, findByAttrId(model, 'titolo')!.id)).toEqual({ id: 'titolo', edits: [] })
  })
})

describe('modifiche CSS con postcss', () => {
  const CSS = `/* Stili */\n:root {\n  --accento: #4f46e5;\n}\n\n#titolo {\n  color: red;\n}\n`
  it('aggiorna, aggiunge e toglie dichiarazioni mantenendo il resto', () => {
    let out = setDeclarations(CSS, '#titolo', { color: 'blue', 'font-size': '32px' })
    expect(out).toBe(`/* Stili */\n:root {\n  --accento: #4f46e5;\n}\n\n#titolo {\n  color: blue;\n  font-size: 32px;\n}\n`)
    out = setDeclarations(out, '#titolo', { color: null, 'font-size': null })
    expect(out).toBe(`/* Stili */\n:root {\n  --accento: #4f46e5;\n}\n`)
  })
  it('crea regole nuove e le media query dei punti di interruzione', () => {
    let out = setDeclarations(CSS, '.scheda', { padding: '24px' })
    expect(out.endsWith('\n\n.scheda {\n  padding: 24px;\n}\n')).toBe(true)
    out = setDeclarations(out, '#titolo', { 'font-size': '20px' }, '(max-width: 600px)')
    expect(out).toContain('@media (max-width: 600px) {\n  #titolo {\n    font-size: 20px;\n  }\n}')
    expect(getDeclarations(out, '#titolo', '(max-width: 600px)')).toEqual({ 'font-size': '20px' })
    expect(getDeclarations(out, '#titolo')).toEqual({ color: 'red' })
  })
  it('variabili del sito e blocchi aggiunti una volta sola', () => {
    expect(getVariables(CSS)).toEqual({ '--accento': '#4f46e5' })
    expect(getVariables(setVariable(CSS, 'sfondo', '#fff'))).toEqual({ '--accento': '#4f46e5', '--sfondo': '#fff' })
    const block = BLOCKS.find((b) => b.id === 'hero')!.css!
    const once = appendRulesOnce(CSS, block)
    expect(appendRulesOnce(once, block)).toBe(once)
  })
  it('segnala un foglio di stile con errori di sintassi', () => {
    expect(() => setDeclarations('a { color: red', 'b', { color: 'blue' })).toThrow(/errore di sintassi/)
  })
})

describe('documento del canvas', () => {
  it('numera gli elementi, incorpora il CSS, toglie gli script, aggiunge la base', () => {
    const html = buildCanvasDocument(PAGE, { htmlPath: 'pagine/index.html', stylesheet: (path) => (path === 'pagine/style.css' ? 'h1 { color: green; }' : null) })
    const model = parseHtml(PAGE)
    expect(html).toContain(`<h1 id="titolo" data-lab-id="${findByAttrId(model, 'titolo')!.id}">`)
    expect(html).toContain('data-lab-href="pagine/style.css">h1 { color: green; }</style>')
    expect(html).not.toContain('<script')
    expect(html).toContain('<base href="ide-preview://project/pagine/">')
  })
  it('risolve i percorsi relativi', () => {
    expect(resolveRelative('a/b/index.html', '../css/x.css?v=2')).toBe('a/css/x.css')
    expect(resolveRelative('index.html', 'https://cdn/x.css')).toBeNull()
  })
})

describe('documento del canvas: sicurezza', () => {
  it('toglie i gestori di eventi in linea', () => {
    const html = buildCanvasDocument('<body><button onclick="x()" onMouseOver="y()">ok</button></body>', { htmlPath: 'index.html', stylesheet: () => null })
    expect(html).not.toMatch(/onclick|onmouseover/i)
    expect(html).toContain('<button data-lab-id=')
  })
})
