// Tela 1.7 del designer HTML: forme disegnate, «Da libero a layout» tradotto in CSS e HTML, scena 3D nella pagina.
import { describe, expect, it } from 'vitest'
import { drawnDeclarations, drawnShape } from '@shared/designer/draw-shapes'
import { layoutCandidates, layoutHtmlEdit, layoutRules, newRowCount, ROW_CLASS } from '@shared/designer/layout-apply'
import { inferLayout } from '@shared/canvas-kit/layout-infer'
import { applyEdits } from '@shared/designer/html-edit'
import { findByAttrId, isFreeElement, parseHtml } from '@shared/designer/html-model'
import { buildCanvasDocument } from '@shared/designer/canvas-document'
import { designerSceneStyle, hasSceneLoader, SCENE_LOADER_SOURCE, sceneCanvasHtml, sceneImagePath, sceneImageSvg, sceneLoaderTag, sceneModulePath, threeImportFor } from '@shared/designer/scene-embed'

describe('forme disegnate', () => {
  it('ogni strumento che disegna ha un frammento con una classe; Seleziona e Mano no', () => {
    for (const tool of ['frame', 'rect', 'ellipse', 'text', 'button', 'image'] as const) {
      const shape = drawnShape(tool)!
      expect(shape.html.startsWith(`<${shape.tag}`)).toBe(true)
      expect(shape.html).toMatch(/\sclass="/)
    }
    expect(drawnShape('select')).toBeNull()
    expect(drawnShape('hand')).toBeNull()
    expect(drawnShape('frame')!.html).toContain('class="tavola"')
  })

  it('posizione assoluta, misura disegnata e margine zero; il testo cresce (altezza minima)', () => {
    const box = { left: 10.4, top: 20.6, width: 120, height: 80 }
    expect(drawnDeclarations('rect', box)).toEqual({ position: 'absolute', left: '10px', top: '21px', width: '120px', height: '80px', margin: '0' })
    const text = drawnDeclarations('text', box)
    expect(text['min-height']).toBe('80px')
    expect(text['height']).toBeUndefined()
  })
})

const FREE_PAGE = `<!doctype html>
<html>
  <body>
    <div id="tavola-1" class="tavola">
      <h2 id="b">B</h2>
      <h2 id="a">A</h2>
      <p id="c">C</p>
      <span id="badge">!</span>
    </div>
    <script src="app.js"></script>
  </body>
</html>
`

describe('da libero a layout', () => {
  const model = parseHtml(FREE_PAGE)
  const tavola = findByAttrId(model, 'tavola-1')!.id
  const id = (name: string) => findByAttrId(model, name)!.id
  // A e B affiancati in alto (B a destra), C sotto a tutta larghezza, il badge sopra A.
  const items = [
    { id: id('a'), rect: { left: 24, top: 24, width: 200, height: 40 } },
    { id: id('b'), rect: { left: 240, top: 24, width: 200, height: 40 } },
    { id: id('c'), rect: { left: 80, top: 96, width: 496, height: 60 } },
    { id: id('badge'), rect: { left: 30, top: 28, width: 20, height: 20 } }
  ]
  const plan = inferLayout({ container: { width: 600, height: 200 }, items })!

  it('i candidati sono i figli liberi visibili (niente script)', () => {
    expect(layoutCandidates(model, tavola, (n) => isFreeElement(model, n))).toEqual([id('b'), id('a'), id('c'), id('badge')])
  })

  it('una colonna con la riga affiancata dentro un div nuovo; il badge resta libero', () => {
    expect(plan.kind).toBe('stack')
    expect(newRowCount(plan)).toBe(1)
    expect(plan.floating).toEqual([id('badge')])
    const edit = layoutHtmlEdit(model, tavola, plan, ['riga-1'])!
    const after = applyEdits(FREE_PAGE, [edit])
    const reparsed = parseHtml(after)
    const row = findByAttrId(reparsed, 'riga-1')!
    expect(row.attrs['class']).toBe(ROW_CLASS)
    // Ordine come si vede: A prima di B (anche se nel codice B era prima), poi C, poi il badge.
    expect(row.children.map((c) => reparsed.elements[c]!.attrs['id'])).toEqual(['a', 'b'])
    const kids = findByAttrId(reparsed, 'tavola-1')!.children.map((c) => reparsed.elements[c]!.attrs['id'])
    expect(kids).toEqual(['riga-1', 'c', 'badge'])
    // Lo script dopo la tavola resta dov'era; rientri coerenti.
    expect(after).toContain('    </div>\n    <script src="app.js"></script>')
    expect(after).toContain('\n        <h2 id="a">A</h2>')
  })

  it('regole: flex in colonna sul contenitore, posizioni tolte ai figli, altezza della tavola liberata', () => {
    const rules = layoutRules(plan, '#tavola-1', (n) => `#${model.elements[n]!.attrs['id']}`, (i) => `#riga-${i + 1}`, { freeCanvas: true })
    const container = Object.fromEntries(rules)['#tavola-1']!
    expect(container).toMatchObject({ display: 'flex', 'flex-direction': 'column', height: 'auto', position: 'relative' })
    const a = Object.fromEntries(rules)['#a']!
    expect(a).toMatchObject({ position: null, left: null, top: null, margin: null })
    expect(Object.fromEntries(rules)['#riga-1']).toMatchObject({ display: 'flex' })
    // Il badge resta libero: nessuna regola lo tocca.
    expect(rules.some(([s]) => s === '#badge')).toBe(false)
  })

  it('un contenitore a sua volta libero non perde la sua posizione', () => {
    const rules = layoutRules(plan, '#x', () => '#y', () => '#r', { freeCanvas: false, positioned: true })
    expect('position' in Object.fromEntries(rules)['#x']!).toBe(false)
  })

  it('griglia regolare: colonne, vuoti e ordine per righe', () => {
    const grid = inferLayout({
      container: { width: 700, height: 400 },
      items: [0, 1, 2, 3].map((i) => ({ id: i, rect: { left: 24 + (i % 2) * 330, top: 24 + Math.floor(i / 2) * 180, width: 300, height: 160 } }))
    })!
    expect(grid.kind).toBe('grid')
    const rules = Object.fromEntries(layoutRules(grid, '#g', (n) => `#c${n}`, () => '#r', { freeCanvas: false }))
    expect(rules['#g']).toMatchObject({ display: 'grid', 'grid-template-columns': '1fr 1fr', 'column-gap': '32px', 'row-gap': '16px' })
  })
})

describe('scena 3D nella pagina', () => {
  it('modulo e immagine accanto alla scena; Three importato dalla radice del progetto', () => {
    expect(sceneModulePath('scene/cubo.scene3d.json')).toBe('scene/cubo.scene3d.js')
    expect(sceneImagePath('scene/cubo.scene3d.json')).toBe('scene/cubo.scene3d.svg')
    const svg = sceneImageSvg('data:image/png;base64,AAA+/=" onload="x', 800, 450)
    expect(svg).toContain('<image href="data:image/png;base64,AAA+/=onload=x"')
    expect(svg).toContain('width="800" height="450"')
    expect(threeImportFor('scene/cubo.scene3d.json')).toBe('../vendor/three/three.module.js')
    expect(threeImportFor('cubo.scene3d.json')).toBe('./vendor/three/three.module.js')
    expect(threeImportFor('sito/scene/x.scene3d.json')).toBe('../../vendor/three/three.module.js')
  })

  it('canvas con attributi protetti, script del caricatore riconosciuto', () => {
    const html = sceneCanvasHtml('scene/a "b".scene3d.json', 'Scena <3>')
    expect(html).toContain('data-scena="scene/a &quot;b&quot;.scene3d.json"')
    expect(html).toContain('aria-label="Scena &lt;3>"')
    expect(hasSceneLoader(`<body>${sceneLoaderTag()}</body>`)).toBe(true)
    expect(hasSceneLoader('<script src="app.js"></script>')).toBe(false)
    expect(SCENE_LOADER_SOURCE).toContain("replace(/\\.scene3d\\.json$/i, '.scene3d.js')")
  })

  it('nel designer il canvas mostra l’immagine della scena sopra il segnaposto (solo nel canvas)', () => {
    expect(designerSceneStyle('scene/x.scene3d.json')).toContain('url("scene/x.scene3d.svg")')
    expect(designerSceneStyle('altro.json')).not.toContain('scene3d.svg')
    const page = `<!doctype html><html><head></head><body>${sceneCanvasHtml('scene/x.scene3d.json', 'x')}<script type="module" src="js/scene-3d.js"></script></body></html>`
    const built = buildCanvasDocument(page, { htmlPath: 'index.html', stylesheet: () => null })
    expect(built).toMatch(/<canvas[^>]+style="background: url\(&quot;scene\/x\.scene3d\.svg&quot;\)/)
    expect(built).not.toContain('scene-3d.js')
  })
})
