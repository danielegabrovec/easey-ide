// Aiuti comuni dei collaudi della tela libera (disegno, allinea, righelli): coordinate dello schermo degli
// elementi nell'iframe del designer (scalato), trascinamenti, lettura delle regole CSS.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { wait } from './helpers.mjs'

export function canvasTools(page, root) {
  const html = () => readFileSync(join(root, 'index.html'), 'utf8')
  const css = () => readFileSync(join(root, 'style.css'), 'utf8')
  /** Riquadro sullo schermo di un elemento della pagina (selettore CSS nell'iframe). */
  const box = (selector) =>
    page.evaluate((selector) => {
      const stage = document.querySelector('.designer-stage')
      const scale = stage.getBoundingClientRect().width / stage.offsetWidth
      const frameEl = document.querySelector('[data-testid="designer-frame"]')
      const f = frameEl.getBoundingClientRect()
      const node = frameEl.contentDocument.querySelector(selector)
      if (!node) return null
      const r = node.getBoundingClientRect()
      return { x: f.x + r.left * scale, y: f.y + r.top * scale, width: r.width * scale, height: r.height * scale, scale }
    }, selector)
  const scale = () => page.evaluate(() => {
    const stage = document.querySelector('.designer-stage')
    return stage.getBoundingClientRect().width / stage.offsetWidth
  })
  const centre = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
  /** Trascina da un punto a un altro dello schermo (con passi intermedi, come una mano). */
  const drag = async (from, to, { hold = null, steps = 12 } = {}) => {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 6, from.y + 6, { steps: 2 })
    await page.mouse.move(to.x, to.y, { steps })
    await wait(120)
    if (hold) await hold()
    await page.mouse.up()
  }
  const ruleOf = (id) => (new RegExp(`#${id}\\s*\\{([^}]*)\\}`).exec(css()) ?? [])[1] ?? ''
  const px = (rule, prop) => Number((new RegExp(`(?:^|[;\\s])${prop}:\\s*(-?[\\d.]+)px`).exec(rule) ?? [])[1] ?? NaN)
  /** Gli id degli elementi con una classe, nell'ordine del file. */
  const idsWithClass = (cls) => [...html().matchAll(new RegExp(`<[a-z]+[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`, 'g'))].map((m) => (/\sid="([^"]+)"/.exec(m[0]) ?? [])[1]).filter(Boolean)
  return { html, css, box, scale, centre, drag, ruleOf, px, idsWithClass }
}
