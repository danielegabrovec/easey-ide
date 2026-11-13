// Dove finisce un elemento rilasciato nel designer (P0-1, P1-2, P1-3 della revisione) e la selezione
// dopo uno spostamento (P1-1).
import { describe, expect, it } from 'vitest'
import { appendTarget, clampBox, decideDrop, defaultInsertTarget, flowAxis, freeStyleChange, gridColumns, landsInFreeCanvas, targetParent, type Axis, type Box } from '@shared/designer/drop'
import { applyEdits, moveElementAt } from '@shared/designer/html-edit'
import { findByAttrId, parseHtml, type HtmlModel } from '@shared/designer/html-model'

// Lo scenario dell'utente: il sottotitolo è finito sotto la scheda, fuori.
const PAGE = `<!doctype html>
<html lang="it">
  <head>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <main class="scheda">
      <h1 id="titolo">Ciao!</h1>
      <p>Premi il pulsante.</p>
      <button id="pulsante">Salutami</button>
    </main>
    <h2 id="sotto">Sottotitolo</h2>
    <script src="script.js"></script>
  </body>
</html>
`

const byTag = (model: HtmlModel, tag: string) => model.elements.find((e) => e.tag === tag)!
const id = (model: HtmlModel, attr: string) => findByAttrId(model, attr)!.id

/** Disposizione finta: scheda 100..500 in alto, padding 40 sopra e sotto, figli impilati. */
function layout(model: HtmlModel): Record<number, Box> {
  return {
    [byTag(model, 'body').id]: { left: 0, top: 0, width: 1200, height: 900 },
    [byTag(model, 'main').id]: { left: 300, top: 100, width: 600, height: 400 },
    [id(model, 'titolo')]: { left: 340, top: 140, width: 520, height: 60 },
    [byTag(model, 'p').id]: { left: 340, top: 220, width: 520, height: 40 },
    [id(model, 'pulsante')]: { left: 540, top: 280, width: 120, height: 40 },
    [id(model, 'sotto')]: { left: 300, top: 540, width: 600, height: 40 }
  }
}

function query(model: HtmlModel, hit: number, x: number, y: number, extra: { exclude?: number; outside?: boolean; axes?: Record<number, Axis>; boxes?: Record<number, Box> } = {}) {
  const boxes = extra.boxes ?? layout(model)
  return { model, hit, x, y, rectOf: (n: number) => boxes[n] ?? null, axisOf: (n: number) => extra.axes?.[n] ?? 'vertical', edge: 7, exclude: extra.exclude, outside: extra.outside }
}

describe('decideDrop: rilascio nel padding di un contenitore', () => {
  const model = parseHtml(PAGE)
  const main = byTag(model, 'main').id
  const sotto = id(model, 'sotto')

  it('spazio bianco in fondo alla scheda (sotto «Salutami») → dentro, dopo l’ultimo figlio', () => {
    const target = decideDrop(query(model, main, 360, 460, { exclude: sotto }))
    expect(target).toEqual({ id: id(model, 'pulsante'), where: 'after' })
    expect(targetParent(model, target!)).toBe(main)
    // e lo spostamento lo mette davvero dentro <main>
    const moved = parseHtml(applyEdits(PAGE, moveElementAt(model, sotto, target!.id, target!.where).edits))
    expect(findByAttrId(moved, 'sotto')!.parent).toBe(byTag(moved, 'main').id)
  })

  it('spazio bianco in alto nella scheda → dentro, prima del primo figlio', () => {
    expect(decideDrop(query(model, main, 360, 115, { exclude: sotto }))).toEqual({ id: id(model, 'titolo'), where: 'before' })
  })

  it('solo una fascia sottile sul bordo esterno vale prima/dopo il contenitore', () => {
    expect(decideDrop(query(model, main, 360, 102, { exclude: sotto }))).toEqual({ id: main, where: 'before' })
    expect(decideDrop(query(model, main, 360, 497, { exclude: sotto }))).toEqual({ id: main, where: 'after' })
  })

  it('con Alt si sceglie prima/dopo il contenitore secondo la metà', () => {
    expect(decideDrop(query(model, main, 360, 460, { exclude: sotto, outside: true }))).toEqual({ id: main, where: 'after' })
  })

  it('sopra un elemento che non contiene altro: prima/dopo secondo la metà', () => {
    expect(decideDrop(query(model, byTag(model, 'p').id, 400, 225))).toEqual({ id: byTag(model, 'p').id, where: 'before' })
    expect(decideDrop(query(model, byTag(model, 'p').id, 400, 255))).toEqual({ id: byTag(model, 'p').id, where: 'after' })
  })
})

describe('decideDrop: sfondo della pagina', () => {
  const model = parseHtml(PAGE)
  const body = byTag(model, 'body').id

  it('sotto tutto → dopo l’ultimo elemento visibile, mai dopo <script>', () => {
    const target = decideDrop(query(model, body, 600, 850, { exclude: id(model, 'titolo') }))
    expect(target).toEqual({ id: id(model, 'sotto'), where: 'after' })
    const out = applyEdits(PAGE, moveElementAt(model, id(model, 'titolo'), target!.id, target!.where).edits)
    expect(out.indexOf('<h1 id="titolo">')).toBeLessThan(out.indexOf('<script'))
  })

  it('sopra la scheda → prima della scheda', () => {
    expect(decideDrop(query(model, body, 600, 20, { exclude: id(model, 'sotto') }))).toEqual({ id: byTag(model, 'main').id, where: 'before' })
  })

  it('body con solo script: prima del primo script', () => {
    const empty = parseHtml('<html><body>\n  <script src="a.js"></script>\n</body></html>')
    expect(appendTarget(empty, empty.body!)).toEqual({ id: byTag(empty, 'script').id, where: 'before' })
  })
})

describe('decideDrop: righe e griglie usano la X (P1-2)', () => {
  const GRID = `<body>
  <div class="griglia">
    <article id="a">Prima</article>
    <article id="b">Seconda</article>
    <article id="c">Terza</article>
  </div>
</body>`
  const model = parseHtml(GRID)
  const grid = byTag(model, 'div').id
  const boxes: Record<number, Box> = {
    [model.body!]: { left: 0, top: 0, width: 1200, height: 600 },
    [grid]: { left: 0, top: 0, width: 960, height: 200 },
    [id(model, 'a')]: { left: 0, top: 0, width: 300, height: 200 },
    [id(model, 'b')]: { left: 330, top: 0, width: 300, height: 200 },
    [id(model, 'c')]: { left: 660, top: 0, width: 300, height: 200 }
  }
  const axes = { [grid]: 'horizontal' as Axis }

  it('metà sinistra di «Prima» → prima di «Prima» (non dopo)', () => {
    expect(decideDrop(query(model, id(model, 'a'), 60, 190, { exclude: id(model, 'c'), axes, boxes }))).toEqual({ id: id(model, 'a'), where: 'before' })
  })

  it('lo spazio fra due schede decide con la X', () => {
    expect(decideDrop(query(model, grid, 310, 100, { exclude: id(model, 'c'), axes, boxes }))).toEqual({ id: id(model, 'a'), where: 'after' })
  })

  it('flowAxis legge flex, griglie a più colonne e il resto', () => {
    expect(flowAxis({ display: 'flex', flexDirection: 'row' })).toBe('horizontal')
    expect(flowAxis({ display: 'flex', flexDirection: 'column' })).toBe('vertical')
    expect(flowAxis({ display: 'grid', gridTemplateColumns: '300px 300px 300px' })).toBe('horizontal')
    expect(flowAxis({ display: 'grid', gridTemplateColumns: '960px' })).toBe('vertical')
    expect(flowAxis({ display: 'block' })).toBe('vertical')
    expect(gridColumns('[a] 100px [b] minmax(0px, 1fr) [c]')).toBe(2)
  })
})

describe('tavole libere (P0-3, P1-3)', () => {
  const FREE = `<body>
  <div class="tavola">
    <h2 id="libero">Libero</h2>
  </div>
  <section id="s"><p>Testo</p></section>
</body>`
  const model = parseHtml(FREE)
  const tavola = byTag(model, 'div').id

  it('chi entra in una tavola diventa libero, chi esce torna nel flusso', () => {
    expect(landsInFreeCanvas(model, { id: tavola, where: 'inside-end' })).toBe(true)
    expect(landsInFreeCanvas(model, { id: id(model, 'libero'), where: 'after' })).toBe(true)
    expect(landsInFreeCanvas(model, { id: id(model, 's'), where: 'inside-end' })).toBe(false)
    expect(freeStyleChange(false, true, { left: 10.4, top: 20, width: 300 })).toEqual({ position: 'absolute', left: '10px', top: '20px', width: '300px' })
    expect(freeStyleChange(true, false)).toEqual({ position: null, left: null, top: null, width: null, height: null, 'z-index': null })
    expect(freeStyleChange(true, true)).toBeNull()
  })

  it('la posizione resta dentro i bordi della tavola', () => {
    expect(clampBox(-20, 600, 100, 50, 960, 520)).toEqual({ left: 0, top: 470 })
    expect(clampBox(900, 10, 100, 50, 960, 520)).toEqual({ left: 860, top: 10 })
    // più largo della tavola: può sbordare, ma ne restano almeno 40 px in vista
    expect(clampBox(73, 10, 420, 50, 264, 520)).toEqual({ left: 73, top: 10 })
    expect(clampBox(500, 10, 420, 50, 264, 520)).toEqual({ left: 224, top: 10 })
    expect(clampBox(-900, 10, 420, 50, 264, 520)).toEqual({ left: -380, top: 10 })
  })
})

describe('moveElementAt: dove inizia l’elemento spostato (P1-1)', () => {
  const model = parseHtml(PAGE)
  const p = byTag(model, 'p')

  for (const [label, target, where] of [
    ['sopra il titolo', id(model, 'titolo'), 'before'],
    ['dopo il pulsante', id(model, 'pulsante'), 'after'],
    ['in fondo al body (dopo il sottotitolo)', id(model, 'sotto'), 'after'],
    ['dentro main, in testa', byTag(model, 'main').id, 'inside-start']
  ] as const) {
    it(`un <p> senza id ${label} si ritrova dalla sua posizione`, () => {
      const { edits, start } = moveElementAt(model, p.id, target, where)
      const after = parseHtml(applyEdits(PAGE, edits))
      const found = after.elements.find((e) => e.start === start)
      expect(found?.tag).toBe('p')
      expect(found?.text).toBe('Premi il pulsante.')
    })
  }
})

describe('defaultInsertTarget: clic nella palette senza selezione', () => {
  const model = parseHtml(PAGE)

  it('senza un contenitore in vista va in fondo a <main>, non in fondo al body', () => {
    expect(defaultInsertTarget(model)).toEqual({ id: id(model, 'pulsante'), where: 'after' })
  })

  it('con un contenitore in vista va lì; in una tavola diventa libero', () => {
    const free = parseHtml('<body>\n  <div class="tavola"></div>\n  <section id="s"><p>a</p></section>\n</body>')
    expect(defaultInsertTarget(free, id(free, 's'))).toEqual({ id: byTag(free, 'p').id, where: 'after' })
    expect(defaultInsertTarget(free, byTag(free, 'div').id)).toEqual({ freeIn: byTag(free, 'div').id })
  })

  it('senza <main>: in fondo al body ma prima degli script', () => {
    const plain = parseHtml('<body>\n  <h1>a</h1>\n  <script src="x.js"></script>\n</body>')
    expect(defaultInsertTarget(plain)).toEqual({ id: byTag(plain, 'h1').id, where: 'after' })
  })
})
