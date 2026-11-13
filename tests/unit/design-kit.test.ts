// Design kit condiviso (src/shared/design-kit): colori OKLCH, contrasto WCAG, scala del testo fluida,
// spazi, temi, caratteri inclusi, icone. Codice puro: IDE Next lo copierà identico.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { adjust, colorScale, fromOklch, harmony, mix, normalizeHex, parseColor, SCALE_STEPS, toOklch } from '@shared/design-kit/color'
import { AA_TEXT, contrastLevel, contrastRatio, fixContrast, isLargeText, readableOn } from '@shared/design-kit/contrast'
import { activeFontPair, FONT_PAIRS, fontFaceCss, fontStack, KIT_FONTS, kitFont, pairFonts, weightsFor } from '@shared/design-kit/fonts'
import { ICON_NODES } from '@shared/design-kit/icon-data'
import { iconSvg, KIT_ICONS, searchIcons } from '@shared/design-kit/icons'
import { isOnScale, nearestSpace, neighbours, spaceVariables } from '@shared/design-kit/space'
import { THEMES, themeContrasts, themeFromColor } from '@shared/design-kit/themes'
import { designTokens } from '@shared/design-kit/tokens'
import { activeTypeScale, fluidSize, stepSizes, TYPE_SCALES, TYPE_STEPS, typeVariables } from '@shared/design-kit/type'

describe('colori', () => {
  it('legge #hex e rgb() e torna allo stesso colore passando da OKLCH', () => {
    expect(parseColor('#4f46e5')).toEqual({ r: 79, g: 70, b: 229, a: 1 })
    expect(parseColor('#abc')).toEqual({ r: 170, g: 187, b: 204, a: 1 })
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 })
    expect(parseColor('rgb(10 20 30 / 50%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 })
    expect(parseColor('var(--x)')).toBeNull()
    expect(normalizeHex('#ABC')).toBe('#aabbcc')
    for (const hex of ['#4f46e5', '#0369a1', '#ea580c', '#111827', '#ffffff', '#000000', '#84cc16']) {
      const back = fromOklch(toOklch(parseColor(hex)!))
      const original = parseColor(hex)!
      expect(Math.abs(back.r - original.r) + Math.abs(back.g - original.g) + Math.abs(back.b - original.b)).toBeLessThanOrEqual(2)
    }
  })

  it('la scala 50–900 va dal chiaro allo scuro con la stessa tinta', () => {
    const scale = colorScale('#4f46e5')
    const lightness = SCALE_STEPS.map((s) => toOklch(parseColor(scale[s])!).l)
    for (let i = 1; i < lightness.length; i++) expect(lightness[i]).toBeLessThan(lightness[i - 1]!)
    const hue = toOklch(parseColor('#4f46e5')!).h
    for (const step of [300, 500, 700] as const) expect(Math.abs(toOklch(parseColor(scale[step])!).h - hue)).toBeLessThan(6)
  })

  it('armonie e miscele', () => {
    const [complement] = harmony('#4f46e5', 'complementare')
    const h1 = toOklch(parseColor('#4f46e5')!).h
    const h2 = toOklch(parseColor(complement!)!).h
    expect(Math.abs(((h2 - h1 + 360) % 360) - 180)).toBeLessThan(8)
    expect(harmony('#4f46e5', 'triadica')).toHaveLength(2)
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(adjust('#4f46e5', { lightness: 0.95 })).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('contrasto WCAG', () => {
  it('valori noti', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBe(21)
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1)
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 1)
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1)
    expect(contrastRatio('rgba(0, 0, 0, 0.5)', '#ffffff')).toBeCloseTo(3.95, 1)
    expect(contrastRatio('rosso', '#fff')).toBeNull()
  })

  it('livelli e testo grande', () => {
    expect(contrastLevel(7.2)).toBe('AAA')
    expect(contrastLevel(4.6)).toBe('AA')
    expect(contrastLevel(3.2, true)).toBe('AA-grande')
    expect(contrastLevel(3.2)).toBe('insufficiente')
    expect(isLargeText(24, 400)).toBe(true)
    expect(isLargeText(19, 700)).toBe(true)
    expect(isLargeText(19, 400)).toBe(false)
  })

  it('la correzione raggiunge la soglia cambiando poco e tenendo la tinta', () => {
    for (const [fg, bg] of [['#9ca3af', '#ffffff'], ['#ea580c', '#ffffff'], ['#60a5fa', '#f8fbfd'], ['#334155', '#0f172a']] as const) {
      const fixed = fixContrast(fg, bg)
      expect(contrastRatio(fixed, bg)!, `${fg} su ${bg}`).toBeGreaterThanOrEqual(AA_TEXT)
      const before = toOklch(parseColor(fg)!)
      const after = toOklch(parseColor(fixed)!)
      if (before.c > 0.05) expect(Math.abs(after.h - before.h), `${fg}`).toBeLessThan(10)
    }
    expect(fixContrast('#111827', '#ffffff')).toBe('#111827')
    expect(readableOn('#0369a1')).toBe('#ffffff')
    expect(readableOn('#fde68a')).toBe('#111827')
  })
})

describe('scala del testo', () => {
  it('clamp() fluido fra telefono e computer', () => {
    expect(fluidSize(16, 16)).toBe('1rem')
    expect(fluidSize(32, 48)).toBe('clamp(2rem, 1.6087rem + 1.739vw, 3rem)')
    for (const scale of TYPE_SCALES) {
      let previous = 0
      for (const step of TYPE_STEPS) {
        const [min, max] = stepSizes(scale, step)
        expect(min).toBeGreaterThanOrEqual(12)
        expect(max).toBeGreaterThanOrEqual(previous)
        previous = max
      }
    }
    const vars = typeVariables('editoriale')
    expect(Object.keys(vars)).toEqual(TYPE_STEPS.map((s) => `--testo-${s}`))
    expect(vars['--testo-5xl']).toMatch(/^clamp\(/)
    expect(activeTypeScale(vars)).toBe('editoriale')
    expect(activeTypeScale({})).toBeNull()
  })
})

describe('spazi', () => {
  it('gradini e misure fuori scala', () => {
    expect(nearestSpace(13)).toBe(12)
    expect(nearestSpace(20)).toBe(16)
    expect(nearestSpace(30)).toBe(32)
    expect(isOnScale(24)).toBe(true)
    expect(isOnScale(13)).toBe(false)
    expect(isOnScale(1)).toBe(true)
    expect(neighbours(13)).toEqual([12, 16])
    expect(spaceVariables()['--spazio-4']).toBe('16px')
  })
})

describe('temi', () => {
  it('i temi pronti chiari hanno testo leggibile', () => {
    for (const theme of THEMES) {
      const text = themeContrasts(theme).find((c) => c.pair === 'testo/sfondo')!
      expect(text.ratio, theme.id).toBeGreaterThanOrEqual(AA_TEXT)
    }
  })

  it('un tema da un solo colore passa tutti i controlli di contrasto', () => {
    for (const color of ['#4f46e5', '#fbbf24', '#22c55e', '#0ea5e9', '#e11d48', '#a3a3a3']) {
      for (const dark of [false, true]) {
        const theme = themeFromColor(color, { dark })
        for (const check of themeContrasts(theme).filter((c) => !(dark && c.pair === 'pulsante'))) expect(check.ratio, `${color} ${dark ? 'scuro' : 'chiaro'} ${check.pair}`).toBeGreaterThanOrEqual(check.target)
      }
    }
  })

  it('i token del kit coprono colori, scala del primario, testo, spazi, raggi e ombre', () => {
    const tokens = designTokens({ theme: THEMES[0]! })
    for (const name of ['--colore-primario', '--colore-primario-500', '--testo-m', '--spazio-4', '--raggio-m', '--ombra-2', '--font-titoli']) expect(tokens[name], name).toBeTruthy()
  })
})

describe('caratteri inclusi', () => {
  const root = join(__dirname, '..', '..')
  it('ogni carattere ha il suo woff2 e la licenza OFL in resources/fonts', () => {
    for (const font of KIT_FONTS) {
      const woff2 = join(root, 'resources', 'fonts', `${font.id}.woff2`)
      expect(existsSync(woff2), font.id).toBe(true)
      expect(readFileSync(woff2).subarray(0, 4).toString('latin1'), font.id).toBe('wOF2')
      expect(readFileSync(join(root, 'resources', 'fonts', `${font.id}.OFL.txt`), 'utf8'), font.id).toContain('SIL Open Font License')
    }
  })

  it('coppie, @font-face, pila di riserva e pesi', () => {
    for (const pair of FONT_PAIRS) expect(pairFonts(pair).length).toBeGreaterThan(0)
    const inter = kitFont('inter')!
    expect(fontFaceCss(inter, 'fonts/inter.woff2')).toContain("src: url('fonts/inter.woff2') format('woff2');\n  font-weight: 100 900;")
    expect(fontStack(inter)).toBe("'Inter', system-ui, 'Segoe UI', Roboto, sans-serif")
    expect(weightsFor(fontStack(kitFont('manrope')!))).toEqual([300, 400, 500, 600, 700, 800])
    expect(weightsFor('Georgia, serif')).toContain(800)
    const pair = FONT_PAIRS.find((p) => p.id === 'editoriale')!
    expect(activeFontPair({ '--font-titoli': fontStack(kitFont(pair.heading)!), '--font-testo': fontStack(kitFont(pair.body)!) })?.id).toBe('editoriale')
  })
})

describe('icone', () => {
  it('ogni icona del kit ha il suo disegno e diventa un SVG in linea con currentColor', () => {
    for (const icon of KIT_ICONS) expect(ICON_NODES[icon.name], icon.name).toBeTruthy()
    const svg = iconSvg('shield-check')!
    expect(svg).toMatch(/^<svg class="lab-icona-svg" data-icona="shield-check"[^>]*stroke="currentColor"[^>]*aria-hidden="true"><path d="[^"]+"\/>/)
    expect(iconSvg('nessuna')).toBeNull()
  })

  it('ricerca in italiano', () => {
    expect(searchIcons('sicuro').map((i) => i.name)).toContain('shield-check')
    expect(searchIcons('caffe').map((i) => i.name)).toEqual(['coffee'])
    expect(searchIcons('')).toHaveLength(KIT_ICONS.length)
  })
})
