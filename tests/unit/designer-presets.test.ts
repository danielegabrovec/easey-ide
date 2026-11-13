import { describe, expect, it } from 'vitest'
import postcss from 'postcss'
import { BLOCKS, blockById, searchBlocks } from '@shared/designer/blocks'
import { appendRulesOnce, boxSides, getDeclarations, getVariables, joinBoxSides, setDeclarations } from '@shared/designer/css-edit'
import { parseHtml } from '@shared/designer/html-model'
import { activeTheme, copyableStyles, presetGroupsFor, PRESETS, THEMES, themeRules } from '@shared/designer/presets'

describe('palette: blocchi, sezioni e pagine intere', () => {
  it('ogni blocco ha un id unico, HTML con un solo elemento radice e CSS valido', () => {
    const ids = BLOCKS.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const block of BLOCKS) {
      const page = parseHtml(`<!doctype html><html><head></head><body>${block.html}</body></html>`)
      const roots = page.elements[page.body!]!.children
      expect(roots, block.id).toHaveLength(1)
      if (block.css) expect(() => postcss.parse(block.css!), block.id).not.toThrow()
    }
  })

  it('le pagine intere mettono insieme le sezioni con tutte le loro regole', () => {
    const landing = blockById('pagina-presentazione')!
    expect(landing.category).toBe('modelli')
    for (const cls of ['lab-intestazione', 'lab-hero', 'lab-griglia', 'lab-voce', 'lab-cta', 'lab-piede']) expect(landing.html).toContain(cls)
    const css = appendRulesOnce('', landing.css!)
    for (const selector of ['.lab-hero', '.lab-bottone', '.lab-scheda', '.lab-cta', '.lab-piede']) expect(css).toContain(`${selector} {`)
    // .lab-sezione e .lab-griglia compaiono in più sezioni ma nel foglio una volta sola.
    expect(css.split(/^\.lab-sezione \{/m).length).toBe(2)
    expect(css.split('.lab-sezione + .lab-sezione {').length).toBe(2)
    expect(css.split('.lab-griglia {').length).toBe(2)
  })

  it('ricerca senza accenti e con più parole', () => {
    expect(searchBlocks('')).toHaveLength(BLOCKS.length)
    expect(searchBlocks('prezzi').map((b) => b.id)).toContain('prezzi')
    expect(searchBlocks('citta').length).toBe(0)
    expect(searchBlocks('domande').map((b) => b.id)).toContain('faq')
    expect(searchBlocks('pagina contatti').map((b) => b.id)).toEqual(['pagina-contatti'])
    expect(searchBlocks('PULSANTE').map((b) => b.id)).toEqual(expect.arrayContaining(['pulsante', 'pulsanti']))
  })
})

describe('regole aggiunte una per una', () => {
  it('se la prima regola c’è già, le altre arrivano lo stesso (prima andavano perse)', () => {
    const start = '.lab-sezione {\n  padding: 10px;\n}\n'
    const next = appendRulesOnce(start, blockById('prezzi')!.css!)
    expect(getDeclarations(next, '.lab-sezione')).toEqual({ padding: '10px' })
    expect(next).toContain('.lab-griglia {')
    expect(next).toContain('.lab-scheda {')
    expect(appendRulesOnce(next, blockById('prezzi')!.css!)).toBe(next)
  })

  it('le @media diverse con lo stesso punto di rottura restano entrambe', () => {
    const a = '@media (max-width: 600px) {\n  .a {\n    color: red;\n  }\n}'
    const b = '@media (max-width: 600px) {\n  .b {\n    color: blue;\n  }\n}'
    const css = appendRulesOnce(appendRulesOnce('', a), b)
    expect(css).toContain('.a {')
    expect(css).toContain('.b {')
    expect(appendRulesOnce(css, b)).toBe(css)
  })
})

describe('margin e padding lato per lato', () => {
  it('scompone la scorciatoia nei quattro lati', () => {
    expect(boxSides('8px')).toEqual(['8px', '8px', '8px', '8px'])
    expect(boxSides('8px 16px')).toEqual(['8px', '16px', '8px', '16px'])
    expect(boxSides('1px 2px 3px')).toEqual(['1px', '2px', '3px', '2px'])
    expect(boxSides('0 auto calc(1rem + 2px) 4px')).toEqual(['0', 'auto', 'calc(1rem + 2px)', '4px'])
    expect(boxSides('')).toEqual(['', '', '', ''])
  })

  it('ricompone la scorciatoia più corta', () => {
    expect(joinBoxSides(['8px', '8px', '8px', '8px'])).toBe('8px')
    expect(joinBoxSides(['8px', '16px', '8px', '16px'])).toBe('8px 16px')
    expect(joinBoxSides(['1px', '2px', '3px', '2px'])).toBe('1px 2px 3px')
    expect(joinBoxSides(['24px', '', '', ''])).toBe('24px 0 0')
    expect(joinBoxSides(['', '', '', ''])).toBe('')
  })
})

describe('stili pronti e temi', () => {
  it('propone gli stili adatti al tipo di elemento', () => {
    expect(presetGroupsFor('h1')).toEqual(['text'])
    expect(presetGroupsFor('button')).toEqual(['button', 'text'])
    expect(presetGroupsFor('input', { type: 'submit' })).toEqual(['button'])
    expect(presetGroupsFor('input', { type: 'text' })).toEqual([])
    expect(presetGroupsFor('section')).toEqual(['layout', 'box'])
    expect(presetGroupsFor('body')).toEqual(['layout'])
    expect(presetGroupsFor('img')).toEqual([])
  })

  it('ogni stile pronto produce CSS valido e le griglie tolgono le proprietà del flex', () => {
    for (const presets of Object.values(PRESETS))
      for (const preset of presets) {
        const css = setDeclarations('', '#x', preset.styles)
        expect(() => postcss.parse(css), preset.id).not.toThrow()
      }
    const flex = setDeclarations('', '#x', PRESETS.layout.find((p) => p.id === 'riga')!.styles)
    const grid = setDeclarations(flex, '#x', PRESETS.layout.find((p) => p.id === 'griglia-3')!.styles)
    const declarations = getDeclarations(grid, '#x')
    expect(declarations['display']).toBe('grid')
    expect(declarations['flex-direction']).toBeUndefined()
    expect(declarations['flex-wrap']).toBeUndefined()
  })

  it('un tema scrive variabili, pagina e titoli; riapplicarlo non duplica nulla e si riconosce', () => {
    const theme = THEMES.find((t) => t.id === 'notte')!
    const apply = (css: string) => themeRules(theme).reduce((next, rule) => setDeclarations(next, rule.selector, rule.styles), css)
    const once = apply(':root {\n  --mio: 1px;\n}\n')
    expect(apply(once)).toBe(once)
    const variables = getVariables(once)
    expect(variables['--mio']).toBe('1px')
    expect(variables['--colore-primario']).toBe(theme.primary)
    expect(getDeclarations(once, 'body')['background']).toBe('var(--colore-sfondo)')
    expect(getDeclarations(once, ':is(h1, h2, h3, h4)')['font-family']).toBe('var(--font-titoli)')
    expect(activeTheme(variables)?.id).toBe('notte')
    expect(activeTheme({})).toBeNull()
  })

  it('«Copia stile» lascia fuori posizione e livello', () => {
    expect(copyableStyles({ color: 'red', left: '10px', top: '4px', position: 'absolute', 'z-index': '3', padding: '8px' })).toEqual({ color: 'red', padding: '8px' })
  })
})
