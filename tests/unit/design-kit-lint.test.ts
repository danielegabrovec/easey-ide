// «Ritocchi consigliati»: regole pure del design kit su una pagina misurata.
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@shared/design-kit/contrast'
import { columnCount, lintPage, spacingIssues, type LintElement } from '@shared/design-kit/lint'
import { BLOCKS } from '@shared/designer/blocks'
import { allDeclarations } from '@shared/designer/css-edit'
import { PRESETS } from '@shared/designer/presets'

const element = (over: Partial<LintElement> & { id: number }): LintElement => ({
  tag: 'div',
  attrs: {},
  text: '',
  box: { left: 0, top: 0, width: 300, height: 40 },
  color: 'rgb(17, 24, 39)',
  background: 'rgb(255, 255, 255)',
  backgroundExact: true,
  fontSize: 16,
  fontWeight: 400,
  display: 'block',
  gridColumns: 0,
  children: [],
  buttonLike: false,
  visible: true,
  ...over
})

describe('ritocchi consigliati', () => {
  it('contrasto basso con la correzione che raggiunge la soglia', () => {
    const issues = lintPage({ viewportWidth: 1200, elements: [element({ id: 1, tag: 'p', text: 'Testo grigio chiaro', color: '#c4c4c4' })] })
    const issue = issues.find((i) => i.rule === 'contrasto')!
    expect(issue.severity).toBe('alta')
    expect(issue.fix?.kind).toBe('styles')
    const fixed = issue.fix!.kind === 'styles' ? issue.fix!.styles['color']! : ''
    expect(contrastRatio(fixed, '#ffffff')!).toBeGreaterThanOrEqual(4.5)
    // Testo grande: basta 3:1. Testo nascosto o vuoto: niente.
    expect(lintPage({ viewportWidth: 1200, elements: [element({ id: 2, tag: 'h1', text: 'Titolo', color: '#8a8a8a', fontSize: 40, fontWeight: 700 })] })).toEqual([])
    expect(lintPage({ viewportWidth: 1200, elements: [element({ id: 3, text: '', color: '#eeeeee' }), element({ id: 4, text: 'x', color: '#eeeeee', visible: false })] })).toEqual([])
  })

  it('griglia con l’ultima scheda sola: colonne che dividono il numero, oppure l’ultima a tutta larghezza', () => {
    const cards = (n: number, from: number) => Array.from({ length: n }, (_, i) => element({ id: from + i, tag: 'article', box: { left: 0, top: 0, width: 140, height: 100 } }))
    const three = lintPage({ viewportWidth: 820, elements: [element({ id: 1, display: 'grid', gridColumns: 2, children: [10, 11, 12] }), ...cards(3, 10)] }).find((i) => i.rule === 'griglia-orfana')!
    expect(three.fix).toEqual({ kind: 'styles', id: 12, styles: { 'grid-column': '1 / -1' }, here: true })
    const four = lintPage({ viewportWidth: 1200, elements: [element({ id: 1, display: 'grid', gridColumns: 3, children: [10, 11, 12, 13] }), ...cards(4, 10)] }).find((i) => i.rule === 'griglia-orfana')!
    expect(four.fix).toEqual({ kind: 'styles', id: 1, styles: { 'grid-template-columns': 'repeat(2, minmax(0, 1fr))' }, here: true })
    expect(lintPage({ viewportWidth: 1200, elements: [element({ id: 1, display: 'grid', gridColumns: 3, children: [10, 11, 12] }), ...cards(3, 10)] }).some((i) => i.rule === 'griglia-orfana')).toBe(false)
    // Già corretta: l'ultima scheda occupa tutta la riga.
    const spanning = [...cards(2, 10), element({ id: 12, tag: 'article', box: { left: 0, top: 0, width: 300, height: 100 } })]
    expect(lintPage({ viewportWidth: 820, elements: [element({ id: 1, display: 'grid', gridColumns: 2, children: [10, 11, 12] }), ...spanning] }).some((i) => i.rule === 'griglia-orfana')).toBe(false)
    expect(columnCount('240px 240px 240px')).toBe(3)
    expect(columnCount('repeat(2, minmax(0px, 1fr))')).toBe(1)
    expect(columnCount('none')).toBe(0)
  })

  it('spazi fuori scala con il gradino più vicino', () => {
    const issues = spacingIssues([
      { selector: '#titolo', media: null, prop: 'padding', value: '13px 24px' },
      { selector: '.a', media: '(max-width: 600px)', prop: 'margin-top', value: '-30px' },
      { selector: '.b', media: null, prop: 'gap', value: '16px' },
      { selector: '.c', media: null, prop: 'padding', value: '1rem' },
      { selector: '.d', media: null, prop: 'width', value: '13px' }
    ])
    expect(issues.map((i) => i.fix)).toEqual([
      { kind: 'css', selector: '#titolo', media: null, prop: 'padding', value: '12px 24px' },
      { kind: 'css', selector: '.a', media: '(max-width: 600px)', prop: 'margin-top', value: '-32px' }
    ])
  })

  it('titoli lunghi, righe lunghe, immagini senza alt o da Internet, pulsanti piccoli', () => {
    const rules = lintPage({
      viewportWidth: 1200,
      elements: [
        element({ id: 1, tag: 'h1', text: 'x'.repeat(100), fontSize: 40, fontWeight: 700 }),
        element({ id: 2, tag: 'p', text: 'parola '.repeat(40), box: { left: 0, top: 0, width: 1100, height: 60 }, fontSize: 16 }),
        element({ id: 3, tag: 'img', attrs: { src: 'https://picsum.photos/200' } }),
        element({ id: 4, tag: 'button', text: 'Invia', buttonLike: true, box: { left: 0, top: 0, width: 80, height: 32 } }),
        element({ id: 5, tag: 'button', text: 'Ok', buttonLike: true, box: { left: 0, top: 0, width: 120, height: 48 } })
      ]
    }).map((i) => `${i.rule}:${i.id}`)
    expect(rules).toEqual(expect.arrayContaining(['titolo-lungo:1', 'righe-lunghe:2', 'immagine-senza-alt:3', 'immagine-da-rete:3', 'pulsante-piccolo:4']))
    expect(rules).not.toContain('pulsante-piccolo:5')
  })

  it('sul telefono si segnala solo l’elemento più esterno che esce', () => {
    const issues = lintPage({
      viewportWidth: 390,
      elements: [element({ id: 1, display: 'flex', children: [2] }), element({ id: 2, tag: 'img' , attrs: { alt: 'x', src: 'a.png' } })],
      phoneOverflow: [
        { id: 1, overflow: 40 },
        { id: 2, overflow: 40 }
      ]
    }).filter((i) => i.rule === 'overflow-telefono')
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ id: 1, severity: 'alta', fix: { kind: 'styles', id: 1, styles: { 'flex-wrap': 'wrap' } } })
  })

  it('i blocchi e gli stili pronti del designer usano solo spazi della scala', () => {
    for (const block of BLOCKS) expect(spacingIssues(allDeclarations(block.css ?? '')).map((i) => i.values['value']), block.id).toEqual([])
    for (const preset of Object.values(PRESETS).flat()) {
      const declarations = Object.entries(preset.styles)
        .filter(([, v]) => v !== null)
        .map(([prop, value]) => ({ selector: preset.id, media: null, prop, value: value! }))
      expect(spacingIssues(declarations), preset.id).toEqual([])
    }
  })

  it('i più gravi vengono prima', () => {
    const issues = lintPage({ viewportWidth: 1200, elements: [element({ id: 1, tag: 'h2', text: 'y'.repeat(90), fontSize: 30 }), element({ id: 2, tag: 'p', text: 'Grigio', color: '#dddddd' })] })
    expect(issues[0]!.severity).toBe('alta')
  })
})
