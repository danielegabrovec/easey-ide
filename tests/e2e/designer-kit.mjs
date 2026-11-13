// Collaudo della fetta «Design kit» (piano design, 13/11/2026): scala del testo fluida, coppie di
// caratteri incluse (offline), tema da un colore con contrasto controllato, peso 800, campioni solo dal
// tema, contrasto con correzione a un clic, icone lucide.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRun, ensureBuilt, until, wait } from './helpers.mjs'

ensureBuilt()
const run = createRun('designer-kit')
const { check } = run

try {
  const page = await run.launch()
  await page.waitForSelector('.welcome', { timeout: 20000 })
  const root = await run.newProject('web-js', 'Kit')
  const html = () => readFileSync(join(root, 'index.html'), 'utf8')
  const css = () => readFileSync(join(root, 'style.css'), 'utf8')

  await page.getByTestId('open-designer').click()
  const frame = page.frameLocator('[data-testid="designer-frame"]')
  check('canvas pronto', !!(await until(async () => (await frame.locator('h1').count()) === 1, 15000)))
  await wait(400)
  const inFrame = (fn, arg) => page.evaluate(([source, arg]) => new Function('d', 'arg', `return (${source})(d, arg)`)(document.querySelector('[data-testid="designer-frame"]').contentDocument, arg), [fn.toString(), arg])
  const clickIn = async (selector) => {
    const box = await frame.locator(selector).first().boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  }

  // 1. Scala del testo.
  await page.getByTestId('insp-tab-site').click()
  await page.locator('[data-type-scale="editoriale"]').click()
  check('scala del testo: variabili --testo-* fluide in :root', !!(await until(() => /--testo-5xl: clamp\([^)]*vw[^)]*\);/.test(css()) && /--testo-m: clamp/.test(css()), 8000)), css().slice(0, 300))
  check('scala del testo: la scelta risulta attiva', !!(await until(async () => (await page.locator('[data-type-scale="editoriale"].active').count()) === 1, 3000)))

  // 2. Coppia di caratteri inclusa: file copiati nel progetto, @font-face e variabili.
  await page.locator('[data-pair="editoriale"]').click()
  const fonts = ['fraunces', 'inter'].map((id) => join(root, 'fonts', `${id}.woff2`))
  check('caratteri: woff2 copiati in fonts/ del progetto', !!(await until(() => fonts.every((f) => existsSync(f)), 8000)), fonts.filter((f) => !existsSync(f)).join(', '))
  check('caratteri: due @font-face e le variabili dei caratteri', !!(await until(() => (css().match(/@font-face \{/g) ?? []).length === 2 && /--font-titoli: 'Fraunces'/.test(css()) && /--font-testo: 'Inter'/.test(css()), 8000)), css().slice(-500))
  const loaded = await until(() => inFrame((d) => d.fonts.check("700 32px 'Fraunces'") && getComputedStyle(d.querySelector('h1')).fontFamily.includes('Fraunces')), 8000)
  check('caratteri: nel canvas il titolo usa Fraunces (senza Internet)', !!loaded)
  check('caratteri: anteprima della coppia nell’ispettore', !!(await until(() => page.evaluate(() => document.fonts.check("16px 'Playfair Display'")), 5000)))
  await run.shot('01-sito')

  // 3. Tema dal mio colore: primario con testo bianco leggibile.
  await page.getByTestId('theme-base-color').fill('#fbbf24')
  await page.getByTestId('theme-from-color').click()
  const primary = await until(() => /--colore-primario: (#[0-9a-f]{6});/.exec(css())?.[1] !== '#4f46e5' && /--colore-primario: (#[0-9a-f]{6});/.exec(css())?.[1], 8000)
  const ratio = await page.evaluate((hex) => {
    const lum = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0)
    return (1.05) / (lum(hex) + 0.05)
  }, primary)
  check('tema dal colore: il primario si legge con testo bianco (≥ 4,5:1)', ratio >= 4.5, `${primary} → ${ratio.toFixed(2)}`)
  check('tema dal colore: scala del primario e token del kit', /--colore-primario-500: #/.test(css()) && /--spazio-4: 16px;/.test(css()) && /--ombra-2:/.test(css()))
  check('tema dal colore: i caratteri scelti restano', /--font-titoli: 'Fraunces'/.test(css()))

  // 4. Stile del titolo: peso 800 nel menu, gradino della scala, campioni del tema con il nome.
  await page.getByTestId('insp-tab-style').click()
  await clickIn('#titolo')
  const weights = await page.getByTestId('style-weight').evaluate((s) => [...s.options].map((o) => o.value))
  check('peso: il menu propone 800', weights.includes('800'), weights.join(','))
  await page.getByTestId('style-weight').selectOption('800')
  await page.getByTestId('style-font-step').selectOption('var(--testo-4xl)')
  check('testo: peso 800 e gradino 4XL scritti nel CSS', !!(await until(() => /#titolo \{[^}]*font-weight: 800;[^}]*font-size: var\(--testo-4xl\);/.test(css()), 8000)), css().slice(-200))
  const swatches = await page.locator('.insp-section .swatches').first().locator('button').evaluateAll((list) => list.map((b) => [b.getAttribute('data-swatch'), b.getAttribute('aria-label'), b.style.background]))
  const colors = swatches.map((s) => s[2])
  check('campioni: solo colori del tema, con il nome e senza doppioni', swatches[0]?.[0] === '--colore-primario' && swatches[0]?.[1] === 'Principale' && new Set(colors).size === colors.length, JSON.stringify(swatches.slice(0, 4)))

  // 5. Contrasto: un grigio chiaro sul bianco della scheda va corretto con un clic.
  await page.getByTestId('style-color').fill('#d4d4d8')
  await until(() => /#titolo \{[^}]*color: #d4d4d8/.test(css()), 8000)
  const low = await until(async () => (await page.locator('[data-testid="contrast-note"].low').count()) === 1, 5000)
  check('contrasto: avviso «troppo basso»', !!low, await page.getByTestId('contrast-note').innerText().catch(() => 'nessuna nota'))
  await page.getByTestId('contrast-fix').click()
  const fixed = await until(async () => (await page.locator('[data-testid="contrast-note"].ok').count()) === 1 && !/#titolo \{[^}]*color: #d4d4d8/.test(css()), 8000)
  check('contrasto: «Correggi» porta il colore sopra la soglia', !!fixed, await page.getByTestId('contrast-note').innerText().catch(() => ''))
  await run.shot('02-stile')

  // 6. Icone lucide: blocco «Icona» e scelta da una raccolta ricercabile.
  await page.getByTestId('designer-palette-search').fill('icona')
  await page.locator('[data-block="icona"]').click()
  await page.getByTestId('designer-palette-search').fill('')
  check('icona: SVG in linea con currentColor nella pagina', !!(await until(() => /<span id="testo-1" class="lab-icona"><svg class="lab-icona-svg" data-icona="sparkles"[^>]*stroke="currentColor"/.test(html()), 8000)), html().slice(html().indexOf('lab-icona') - 40, html().indexOf('lab-icona') + 120))
  await page.getByTestId('insp-tab-element').click()
  await page.getByTestId('icon-search').fill('razzo')
  await page.locator('[data-icon="rocket"]').click()
  check('icona: cambiata con «razzo» dalla ricerca in italiano', !!(await until(() => html().includes('data-icona="rocket"') && !html().includes('data-icona="sparkles"'), 8000)))
  const iconColor = await until(() => inFrame((d) => { const s = d.querySelector('.lab-icona svg'); return s && getComputedStyle(s).stroke }), 5000)
  check('icona: prende il colore del tema', !!iconColor && iconColor !== 'none', String(iconColor))
  await run.shot('03-icona')

  check('nessun errore JavaScript nella finestra', run.issues.length === 0, run.issues.join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('zz-errore').catch(() => undefined)
} finally {
  await run.finish()
}
