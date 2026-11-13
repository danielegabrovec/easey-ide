// Fetta «Si parte bene»: pagina intera a tutta larghezza, body pulito, temi che ricolorano anche i
// pulsanti dei modelli, segnaposto locali al posto delle immagini da Internet.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BLOCKS, blockById, PAGE_BODY_RESET, PAGE_CSS } from '@shared/designer/blocks'
import { applyEdits, clearBody, insertHtml, visibleBodyChildren } from '@shared/designer/html-edit'
import { getDeclarations, getVariables, setDeclarations } from '@shared/designer/css-edit'
import { parseHtml } from '@shared/designer/html-model'
import { LEGACY_ALIASES, THEMES, themeRules } from '@shared/designer/presets'
import { placeholderNames, placeholderSvg, PLACEHOLDERS } from '@shared/design-kit/placeholder'
import { createFromTemplate } from '../../src/main/services/workspace/templates'

const PAGE = `<!doctype html>
<html lang="it">
  <head>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <main class="scheda">
      <h1 id="titolo">Ciao!</h1>
      <button id="pulsante">Salutami</button>
    </main>
    <!-- lo script resta -->
    <script src="script.js"></script>
  </body>
</html>
`

describe('«Sostituisci la pagina»', () => {
  it('toglie solo il contenuto visibile: script e commenti restano', () => {
    const model = parseHtml(PAGE)
    expect(visibleBodyChildren(model).map((id) => model.elements[id]!.tag)).toEqual(['main'])
    const cleared = applyEdits(PAGE, clearBody(model))
    expect(cleared).not.toContain('scheda')
    expect(cleared).toContain('<!-- lo script resta -->')
    expect(cleared).toContain('<script src="script.js"></script>')
    // Poi la pagina nuova va in testa al body, prima degli script.
    const after = parseHtml(cleared)
    const withPage = applyEdits(cleared, insertHtml(after, after.body, 'inside-start', '<div class="lab-pagina">\n  <p>Nuova</p>\n</div>'))
    expect(withPage.indexOf('lab-pagina')).toBeLessThan(withPage.indexOf('<script'))
    expect(withPage).toMatch(/<body>\n {4}<div class="lab-pagina">\n {6}<p>Nuova<\/p>\n {4}<\/div>\n/)
    expect(parseHtml(withPage).elements.filter((e) => e.tag === 'body')).toHaveLength(1)
  })

  it('un body senza contenuto visibile non ha niente da sostituire', () => {
    expect(visibleBodyChildren(parseHtml('<html><body>\n<script src="a.js"></script>\n</body></html>'))).toEqual([])
  })

  it('le pagine intere portano le regole di base e il reset toglie la griglia centrata del body', () => {
    for (const block of BLOCKS.filter((b) => b.category === 'modelli')) {
      expect(block.css!.startsWith(PAGE_CSS)).toBe(true)
      expect(block.html.startsWith('<div class="lab-pagina">')).toBe(true)
    }
    const old = 'body {\n  margin: 0;\n  display: grid;\n  place-items: center;\n  min-height: 100vh;\n}\n'
    const reset = getDeclarations(setDeclarations(old, 'body', PAGE_BODY_RESET), 'body')
    expect(reset).toEqual({ margin: '0', 'min-height': '100vh' })
  })
})

describe('temi e pulsanti dei modelli', () => {
  it('i nomi brevi vecchi (--accento…) diventano alias delle variabili del tema', () => {
    const css = ':root {\n  --accento: #4f46e5;\n  --sfondo: #f6f7fb;\n}\n\nbutton {\n  background: var(--accento);\n}\n'
    const theme = THEMES.find((t) => t.id === 'oceano')!
    const out = themeRules(theme, getVariables(css)).reduce((next, rule) => setDeclarations(next, rule.selector, rule.styles), css)
    const vars = getVariables(out)
    expect(vars['--accento']).toBe(LEGACY_ALIASES['--accento'])
    expect(vars['--sfondo']).toBe('var(--colore-sfondo)')
    expect(vars['--testo']).toBeUndefined()
    expect(vars['--colore-primario']).toBe(theme.primary)
  })

  it('i modelli di progetto usano i colori del tema e non stringono il body', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'easey-modelli-'))
    try {
      for (const id of ['web-js', 'web-ts', 'web-designer']) {
        const root = await createFromTemplate(id, `prova ${id}`, dir)
        const css = readFileSync(join(root, 'style.css'), 'utf8')
        const vars = getVariables(css)
        expect(vars['--colore-primario'], id).toBe('#4f46e5')
        expect(vars['--accento'], id).toBe('var(--colore-primario)')
        expect(getDeclarations(css, 'body')['display'], id).toBeUndefined()
        expect(css, id).not.toContain('place-items')
        if (id !== 'web-designer') expect(getDeclarations(css, 'button')['background'], id).toBe('var(--colore-primario)')
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('segnaposto locali', () => {
  it('nessun blocco carica immagini da Internet', () => {
    for (const block of BLOCKS) expect(block.html, block.id).not.toMatch(/src="https?:/)
  })

  it('i blocchi con immagini usano segnaposto conosciuti, con alt e dimensioni', () => {
    for (const id of ['immagine', 'galleria', 'squadra']) {
      const html = blockById(id)!.html
      const names = placeholderNames(html)
      expect(names.length, id).toBeGreaterThan(0)
      for (const img of html.match(/<img[^>]*>/g) ?? []) expect(img, id).toMatch(/alt="[^"]+".*width="\d+" height="\d+"/)
    }
    expect(placeholderNames('<img src="img/segnaposto-foto-1.svg"><img src="img/segnaposto-foto-1.svg"><img src="img/segnaposto-sconosciuto.svg">')).toEqual(['segnaposto-foto-1'])
  })

  it('ogni segnaposto è un SVG valido nei colori del tema', () => {
    for (const name of Object.keys(PLACEHOLDERS)) {
      const svg = placeholderSvg(name, { primary: '#0369a1', secondary: '#06b6d4' })!
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
      expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/)
      expect(svg).toMatch(/stop-color="#[0-9a-f]{6}"/)
    }
    expect(placeholderSvg('segnaposto-foto-1', { primary: 'var(--x)', secondary: 'rosso' })).toContain('<svg')
    expect(placeholderSvg('nessuno')).toBeNull()
    // Varianti diverse: una galleria non mostra tre immagini identiche.
    expect(placeholderSvg('segnaposto-foto-1')).not.toBe(placeholderSvg('segnaposto-foto-2'))
  })
})
