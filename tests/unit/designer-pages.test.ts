// Pagine del sito nel designer: elenco, nome del file nuovo, contenuto iniziale.
import { describe, expect, it } from 'vitest'
import { htmlPages, newPageHtml, pageFileName, pageFolder } from '../../src/shared/designer/pages'
import { parseHtml } from '../../src/shared/designer/html-model'
import { filePaths } from '../../src/shared/paths'

const texts = { intro: 'Scrivi qui.', lang: 'it' }

const SITE = `<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <title>Il mio sito</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <header class="lab-intestazione">
      <strong class="lab-logo">Il mio sito</strong>
      <nav><a href="index.html">Home</a></nav>
    </header>
    <section class="hero"><h1 id="titolo">Benvenuti</h1></section>
    <footer class="lab-piede">
      <p>© 2026</p>
    </footer>
    <script src="script.js"></script>
  </body>
</html>
`

describe('pagine del sito', () => {
  it('elenca le pagine HTML con la home per prima', () => {
    expect(htmlPages(['style.css', 'zeta.html', 'blog/index.html', 'chi-sono.htm', 'index.html', 'img/a.png'])).toEqual(['index.html', 'blog/index.html', 'chi-sono.htm', 'zeta.html'])
  })

  it('appiattisce l’albero del progetto', () => {
    expect(filePaths([{ name: 'a', path: 'a', kind: 'dir', children: [{ name: 'b.html', path: 'a/b.html', kind: 'file' }] }, { name: 'c', path: 'c', kind: 'file' }])).toEqual(['a/b.html', 'c'])
  })

  it('ricava il nome del file dal titolo, senza accenti e senza doppioni', () => {
    expect(pageFileName('Chi sono', [])).toBe('chi-sono.html')
    expect(pageFileName('Perché è così?', [])).toBe('perche-e-cosi.html')
    expect(pageFileName('Contatti', ['contatti.html', 'Contatti-2.html'])).toBe('contatti-3.html')
    expect(pageFileName('Galleria', [], 'sito')).toBe('sito/galleria.html')
    expect(pageFileName('!!!', [])).toBe('pagina.html')
    expect(pageFileName('prezzi.html', [])).toBe('prezzi.html')
    expect(pageFolder('sito/index.html')).toBe('sito')
    expect(pageFolder(null)).toBe('')
  })

  it('riusa testa, intestazione e piè di pagina, senza gli script né il contenuto della pagina di partenza', () => {
    const html = newPageHtml(SITE, 'Chi <sono>', texts)
    expect(html).toContain('<title>Chi &lt;sono&gt;</title>')
    expect(html).toContain('<link rel="stylesheet" href="style.css" />')
    expect(html).toContain('<header class="lab-intestazione">')
    expect(html).toContain('      <nav><a href="index.html">Home</a></nav>')
    expect(html).toContain('<footer class="lab-piede">')
    expect(html).toContain('<h1>Chi &lt;sono&gt;</h1>')
    expect(html).toContain('<p>Scrivi qui.</p>')
    expect(html).not.toContain('Benvenuti')
    expect(html).not.toContain('script.js')
    expect(html.trimEnd().endsWith('</html>')).toBe(true)
    // Il risultato è HTML valido per il designer: un solo body con intestazione, main e piè di pagina.
    const model = parseHtml(html)
    const body = model.elements[model.body!]!
    expect(body.children.map((id) => model.elements[id]!.tag)).toEqual(['header', 'main', 'footer'])
  })

  it('aggiunge il titolo se la pagina di partenza non lo ha; pagina minima senza partenza', () => {
    const html = newPageHtml('<html><head><meta charset="UTF-8"></head><body><p>x</p></body></html>', 'Blog', texts)
    expect(html).toContain('<title>Blog</title>')
    expect(html).not.toContain('<p>x</p>')
    const blank = newPageHtml(null, 'Blog', { intro: 'Write here.', lang: 'en' })
    expect(blank).toContain('<html lang="en">')
    expect(blank).toContain('<title>Blog</title>')
    expect(blank).toContain('<p>Write here.</p>')
  })
})
