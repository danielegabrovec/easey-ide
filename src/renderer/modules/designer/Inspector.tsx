// Ispettore del designer: stili (con bersaglio: elemento, classe o in linea; e punto di interruzione),
// proprietà dell'elemento e stile generale del sito (variabili, caratteri, sfondo).
import { useEffect, useState, type ReactNode } from 'react'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowUpToLine, ArrowDownToLine, Bold, ClipboardPaste, Copy, CornerLeftUp, ImagePlus, Italic, Paintbrush, Trash2, Underline } from 'lucide-react'
import { boxSides, getDeclarations, getVariables, isColorValue, joinBoxSides } from '@shared/designer/css-edit'
import { isFreeElement, type ElementInfo } from '@shared/designer/html-model'
import { activeTheme, presetGroupsFor, PRESETS, THEMES, type PresetGroup } from '@shared/designer/presets'
import { contrastLevel, contrastRatio, contrastTarget, fixContrast, isLargeText } from '@shared/design-kit/contrast'
import { activeFontPair, FONT_PAIRS, fontStack, KIT_FONTS, kitFont, weightsFor } from '@shared/design-kit/fonts'
import { iconSvg, searchIcons } from '@shared/design-kit/icons'
import { COLOR_ROLES } from '@shared/design-kit/themes'
import { activeTypeScale, lineHeightFor, TYPE_SCALES, TYPE_STEPS, typeVar, type TypeStep } from '@shared/design-kit/type'
import { dirnameOf, relativeTo } from '@shared/paths'
import { ide } from '../../ipc'
import { t } from '../../i18n'
import { applyFontPair, applyPreset, applyTheme, applyThemeFromColor, applyTypeScale, currentRule, duplicateSelected, pasteStyle, removeSelected, renameId, setElementAttribute, setElementText, setIcon, setSiteRule, setStyles } from './actions'
import { copyStyleWithNotice } from './Canvas'
import { resolveSelection, useDesigner, type StyleTarget } from './designer-store'
import { useKitFonts } from './font-preview'
import { computedStyle, effectiveBackground, toHex } from './frame-access'

const FONTS = [
  ['system-ui, sans-serif', 'Sistema'],
  ["'Segoe UI', Roboto, sans-serif", 'Segoe UI'],
  ['Georgia, serif', 'Georgia (serif)'],
  ["'Times New Roman', serif", 'Times'],
  ['Verdana, sans-serif', 'Verdana'],
  ["'Trebuchet MS', sans-serif", 'Trebuchet'],
  ["'Courier New', monospace", 'Courier (monospace)'],
  ["'Cascadia Code', Consolas, monospace", 'Cascadia Code']
]
const SHADOWS: [string, string][] = [
  ['none', 'Nessuna'],
  ['0 2px 8px rgba(0, 0, 0, 0.08)', 'Leggera'],
  ['0 8px 24px rgba(0, 0, 0, 0.12)', 'Media'],
  ['0 20px 50px rgba(0, 0, 0, 0.25)', 'Forte']
]
const GRADIENTS = ['linear-gradient(135deg, #6d7cff, #b26dff)', 'linear-gradient(135deg, #f97316, #ec4899)', 'linear-gradient(135deg, #10b981, #0ea5e9)', 'linear-gradient(180deg, #f8fafc, #e2e8f0)']

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="insp-section">
      <h4>{title}</h4>
      {children}
    </section>
  )
}

/** Campo di testo che applica il valore su Invio o all'uscita; mostra il valore calcolato come suggerimento. */
function TextField({ label, value, placeholder, onCommit, testId, wide }: { label: string; value: string; placeholder?: string; onCommit: (value: string) => void; testId?: string; wide?: boolean }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <label className={`insp-field${wide ? ' wide' : ''}`}>
      <span>{label}</span>
      <input
        value={draft}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onCommit(draft.trim())}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setDraft(value)
        }}
        data-testid={testId}
      />
    </label>
  )
}

interface Swatch {
  variable: string
  color: string
  label: string
}

const SCALE_SWATCHES = [100, 300, 500, 700, 900]

/**
 * Campioni del tema per i selettori di colore: solo i colori del tema con il loro nome (Principale,
 * Sfondo…), poi alcune tinte della scala del principale e le variabili-colore aggiunte a mano, senza doppioni.
 */
function themeSwatches(variables: Record<string, string>): Swatch[] {
  const out: Swatch[] = []
  const seen = new Set<string>()
  const add = (variable: string, label: string) => {
    const color = variables[variable]
    if (!color || !isColorValue(color) || color.startsWith('var(')) return
    const key = color.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push({ variable, color, label })
  }
  for (const [role, variable] of COLOR_ROLES) add(variable, t(`designer.role.${role}`))
  for (const step of SCALE_SWATCHES) add(`--colore-primario-${step}`, `${t('designer.role.primary')} ${step}`)
  for (const variable of Object.keys(variables)) if (!variable.startsWith('--colore-primario-') && !COLOR_ROLES.some(([, v]) => v === variable)) add(variable, variable)
  return out
}

function ColorField({ label, value, computed, onCommit, swatches, testId }: { label: string; value: string; computed: string; onCommit: (value: string) => void; swatches: Swatch[]; testId?: string }) {
  return (
    <div className="insp-field wide">
      <span>{label}</span>
      <div className="color-row">
        <input type="color" value={toHex(value && !value.startsWith('var(') ? value : computed)} onChange={(e) => onCommit(e.target.value)} data-testid={testId} />
        <TextField label="" value={value} placeholder={computed} onCommit={onCommit} />
      </div>
      {swatches.length > 0 && (
        <div className="swatches">
          {swatches.map((swatch) => (
            <button
              key={swatch.variable}
              className={value === `var(${swatch.variable})` ? 'active' : undefined}
              title={`${swatch.label} · ${swatch.color} (${swatch.variable})`}
              aria-label={swatch.label}
              style={{ background: swatch.color }}
              onClick={() => onCommit(`var(${swatch.variable})`)}
              data-swatch={swatch.variable}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** `var(--testo-xl, …)` → `var(--testo-xl)` (il gradino della scala in uso), altrimenti ''. */
function scaleStepOf(value: string): string {
  const step = /^var\((--testo-[a-z0-9]+)/.exec(value)?.[1]
  return step ? `var(${step})` : ''
}

/** Contrasto del testo con lo sfondo che ha dietro (WCAG), con correzione a un clic. */
function ContrastNote({ element, computed }: { element: ElementInfo; computed: CSSStyleDeclaration | null }) {
  const background = effectiveBackground(element.id)
  if (!computed || !background || !element.leafText || !element.text.trim()) return null
  const color = computed.color
  const ratio = contrastRatio(color, background.color)
  if (ratio === null) return null
  const large = isLargeText(parseFloat(computed.fontSize), Number(computed.fontWeight) || 400)
  const target = contrastTarget(large)
  const ok = ratio >= target
  const fixed = ok ? null : fixContrast(color, background.color, target)
  return (
    <div className={`contrast-note${ok ? ' ok' : ' low'}`} data-testid="contrast-note">
      <span>
        {t('designer.contrast', { ratio: ratio.toFixed(1).replace('.', ',') })} · {ok ? t('designer.contrastOk', { level: contrastLevel(ratio, large) }) : t('designer.contrastLow', { target: String(target).replace('.', ',') })}
      </span>
      {fixed && (
        <button className="btn ghost" title={t('designer.contrastFixHint', { color: fixed })} onClick={() => void setStyles({ color: fixed })} data-testid="contrast-fix">
          <span className="swatch-dot" style={{ background: fixed }} /> {t('designer.contrastFix')}
        </button>
      )}
    </div>
  )
}

/** Nome leggibile dei caratteri del tema (variabili CSS scritte dalla scheda Sito). */
function fontVariableLabel(variable: string): string {
  if (variable === '--font-titoli') return t('designer.themeFontHeadings')
  if (variable === '--font-testo') return t('designer.themeFontBody')
  return t('designer.themeVariable', { name: variable })
}

function SelectField({ label, value, options, onCommit, testId }: { label: string; value: string; options: [string, string][]; onCommit: (value: string) => void; testId?: string }) {
  return (
    <label className="insp-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onCommit(e.target.value)} data-testid={testId}>
        <option value="">—</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )
}

const SIDES = ['top', 'right', 'bottom', 'left'] as const
const SIDE_ARROWS = ['↑', '→', '↓', '←']

/** Margin o padding lato per lato (come il riquadro dei margini degli editor visuali); scrive la scorciatoia più corta. */
function BoxSidesField({ prop, value, hint, onCommit, testId }: { prop: 'margin' | 'padding'; value: string; hint: (p: string) => string; onCommit: (value: string) => void; testId: string }) {
  const sides = boxSides(value)
  return (
    <div className="box-sides" data-testid={testId}>
      <span className="bm-label">{prop}</span>
      {SIDES.map((side, index) => (
        <TextField
          key={side}
          label={SIDE_ARROWS[index]!}
          value={value ? sides[index] : ''}
          placeholder={hint(`${prop}-${side}`)}
          onCommit={(next) => {
            const updated = [...(value ? sides : ['', '', '', ''])] as [string, string, string, string]
            updated[index] = next
            onCommit(joinBoxSides(updated))
          }}
          testId={`${testId}-${side}`}
        />
      ))}
    </div>
  )
}

const PRESET_TITLES: Record<PresetGroup, 'designer.presetsText' | 'designer.presetsButton' | 'designer.presetsBox' | 'designer.presetsLayout'> = {
  text: 'designer.presetsText',
  button: 'designer.presetsButton',
  box: 'designer.presetsBox',
  layout: 'designer.presetsLayout'
}

/** Stili pronti adatti all'elemento: un clic applica più proprietà insieme (si annulla con Ctrl+Z). */
function PresetChips({ groups }: { groups: PresetGroup[] }) {
  if (!groups.length) return null
  return (
    <Section title={t('designer.presets')}>
      {groups.map((group) => (
        <div key={group} className="preset-group">
          <span className="hint">{t(PRESET_TITLES[group])}</span>
          <div className="preset-chips">
            {PRESETS[group].map((preset) => (
              <button
                key={preset.id}
                className="chip"
                onClick={() => void applyPreset(preset.styles)}
                data-preset={`${group}-${preset.id}`}
                title={Object.entries(preset.styles)
                  .filter(([, v]) => v !== null)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join('\n')}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </Section>
  )
}

const RATIOS: [string | null, string][] = [
  [null, ''],
  ['16 / 9', '16:9'],
  ['4 / 3', '4:3'],
  ['3 / 2', '3:2'],
  ['1 / 1', '1:1'],
  ['3 / 4', '3:4']
]
const FOCUS: [string, string][] = [
  ['left top', '↖'],
  ['center top', '↑'],
  ['right top', '↗'],
  ['left center', '←'],
  ['center center', '•'],
  ['right center', '→'],
  ['left bottom', '↙'],
  ['center bottom', '↓'],
  ['right bottom', '↘']
]

/** Immagini e video: come stanno nel riquadro (object-fit), proporzione (aspect-ratio) e punto a fuoco. */
function ImageSection({ get }: { get: (prop: string) => string }) {
  const fit = get('object-fit')
  const ratio = get('aspect-ratio').replace(/\s+/g, ' ')
  const focus = get('object-position') || 'center center'
  const fits: [string | null, string, string][] = [
    ['cover', t('designer.fitCover'), t('designer.fitCoverHint')],
    ['contain', t('designer.fitContain'), t('designer.fitContainHint')],
    [null, t('designer.fitFill'), t('designer.fitFillHint')]
  ]
  return (
    <Section title={t('designer.image')}>
      <span className="hint">{t('designer.imageFit')}</span>
      <div className="preset-chips">
        {fits.map(([value, label, hint]) => (
          <button key={label} className={`chip${(fit || null) === value ? ' active' : ''}`} title={hint} onClick={() => void setStyles({ 'object-fit': value })} data-testid={`image-fit-${value ?? 'fill'}`}>
            {label}
          </button>
        ))}
      </div>
      <span className="hint">{t('designer.imageRatio')}</span>
      <div className="preset-chips">
        {RATIOS.map(([value, label]) => (
          <button
            key={label || 'free'}
            className={`chip${(ratio || null) === value ? ' active' : ''}`}
            // Con una proporzione l'altezza segue la larghezza e l'immagine riempie il riquadro senza deformarsi.
            onClick={() => void setStyles(value ? { 'aspect-ratio': value, height: 'auto', 'object-fit': fit || 'cover' } : { 'aspect-ratio': null })}
            data-testid={`image-ratio-${label || 'free'}`}
          >
            {label || t('designer.ratioFree')}
          </button>
        ))}
      </div>
      {fit && fit !== 'fill' && (
        <>
          <span className="hint">{t('designer.imageFocus')}</span>
          <div className="focus-grid">
            {FOCUS.map(([value, glyph]) => (
              <button key={value} className={focus === value || (value === 'center center' && focus === 'center') ? 'active' : undefined} title={`object-position: ${value}`} onClick={() => void setStyles({ 'object-position': value === 'center center' ? null : value })}>
                {glyph}
              </button>
            ))}
          </div>
        </>
      )}
    </Section>
  )
}

function StyleTab({ element }: { element: ElementInfo }) {
  const page = useDesigner((s) => s.html)!
  const target = useDesigner((s) => s.target)
  const targetClass = useDesigner((s) => s.targetClass)
  const breakpoint = useDesigner((s) => s.breakpoint)
  const css = useDesigner((s) => s.css)
  const stylesheet = useDesigner((s) => s.stylesheet)
  const styleClipboard = useDesigner((s) => s.styleClipboard)
  // Gli stili calcolati (suggerimenti, contrasto) si rileggono quando il canvas ha ridisegnato la pagina.
  useDesigner((s) => s.canvasVersion)
  void css
  const { selector, declarations } = currentRule(element)
  const computed = computedStyle(element.id)
  const get = (prop: string) => declarations[prop] ?? ''
  const hint = (prop: string) => computed?.getPropertyValue(prop) ?? ''
  const set = (prop: string) => (value: string) => void setStyles({ [prop]: value || null })
  const classes = (element.attrs['class'] ?? '').split(/\s+/).filter(Boolean)
  const variables = stylesheet ? getVariables(css[stylesheet] ?? '') : {}
  const swatches = themeSwatches(variables)
  const free = isFreeElement(page, element.id)
  const display = get('display') || hint('display')

  return (
    <div className="insp-body">
      <div className="insp-target">
        <span className="hint">{t('designer.applyTo')}</span>
        <div className="segmented">
          {(['id', 'class', 'inline'] as StyleTarget[]).map((value) => (
            <button
              key={value}
              className={target === value ? 'active' : undefined}
              disabled={value === 'class' && classes.length === 0}
              onClick={() => useDesigner.getState().setTarget(value, value === 'class' ? (classes.includes(targetClass) ? targetClass : classes[0]) : undefined)}
              data-testid={`target-${value}`}
            >
              {value === 'id' ? t('designer.targetElement') : value === 'class' ? t('designer.targetClass') : t('designer.targetInline')}
            </button>
          ))}
        </div>
        {target === 'class' && classes.length > 1 && (
          <select value={targetClass} onChange={(e) => useDesigner.getState().setTarget('class', e.target.value)}>
            {classes.map((c) => (
              <option key={c} value={c}>
                .{c}
              </option>
            ))}
          </select>
        )}
        <code className="insp-selector" data-testid="insp-selector">
          {selector ?? t('designer.idWillBeAdded')}
          {breakpoint !== 'desktop' ? ` · ${breakpoint === 'tablet' ? t('designer.bpTablet') : t('designer.bpPhone')}` : ''}
        </code>
        <div className="insp-buttons">
          <button className="btn ghost" onClick={() => copyStyleWithNotice(element)} title={`${t('designer.copyStyle')} (Ctrl+Alt+C)`} data-testid="style-copy">
            <Paintbrush size={13} /> {t('designer.copyStyle')}
          </button>
          <button className="btn ghost" disabled={styleClipboard === 0} onClick={() => void pasteStyle()} title={`${t('designer.pasteStyle')} (Ctrl+Alt+V)`} data-testid="style-paste">
            <ClipboardPaste size={13} /> {t('designer.pasteStyle')}
          </button>
        </div>
      </div>

      <PresetChips groups={presetGroupsFor(element.tag, element.attrs)} />

      {(element.tag === 'img' || element.tag === 'video') && <ImageSection get={get} />}

      {free && (
        <Section title={t('designer.position')}>
          <div className="insp-grid">
            <TextField label="X" value={get('left')} placeholder={hint('left')} onCommit={set('left')} />
            <TextField label="Y" value={get('top')} placeholder={hint('top')} onCommit={set('top')} />
            <TextField label={t('designer.width')} value={get('width')} placeholder={hint('width')} onCommit={set('width')} />
            <TextField label={t('designer.height')} value={get('height')} placeholder={hint('height')} onCommit={set('height')} />
            <TextField label={t('designer.rotation')} value={/rotate\(([-\d.]+)deg\)/.exec(get('transform'))?.[1] ?? ''} placeholder="0" onCommit={(v) => setStyles({ transform: v ? `rotate(${v}deg)` : null })} />
            <TextField label={t('designer.layer')} value={get('z-index')} placeholder={hint('z-index')} onCommit={set('z-index')} />
          </div>
          <div className="insp-buttons">
            <button className="btn ghost" onClick={() => setStyles({ 'z-index': String((Number(get('z-index')) || 0) + 1) })}>
              <ArrowUpToLine size={13} /> {t('designer.bringFront')}
            </button>
            <button className="btn ghost" onClick={() => setStyles({ 'z-index': String((Number(get('z-index')) || 0) - 1) })}>
              <ArrowDownToLine size={13} /> {t('designer.sendBack')}
            </button>
          </div>
        </Section>
      )}

      <Section title={t('designer.text')}>
        <div className="insp-grid">
          <SelectField label={t('designer.font')} value={get('font-family')} options={[...FONTS.map(([v, l]) => [v, l] as [string, string]), ...Object.keys(variables).filter((v) => /font/.test(v)).map((v) => [`var(${v})`, fontVariableLabel(v)] as [string, string])]} onCommit={set('font-family')} />
          <TextField label={t('designer.size')} value={get('font-size')} placeholder={hint('font-size')} onCommit={set('font-size')} testId="style-font-size" />
          <SelectField label={t('designer.sizeStep')} value={scaleStepOf(get('font-size'))} options={[...TYPE_STEPS].reverse().map((s) => [typeVar(s), s.toUpperCase()] as [string, string])} onCommit={(v) => setStyles({ 'font-size': v || null, 'line-height': v ? lineHeightFor(v.slice('var(--testo-'.length, -1) as TypeStep) : null })} testId="style-font-step" />
          <SelectField label={t('designer.weight')} value={get('font-weight')} options={weightsFor(get('font-family') || hint('font-family')).map((w) => [String(w), `${w} · ${t(`designer.weight.${w}` as 'designer.weight.400')}`] as [string, string])} onCommit={set('font-weight')} testId="style-weight" />
          <TextField label={t('designer.lineHeight')} value={get('line-height')} placeholder={hint('line-height')} onCommit={set('line-height')} />
          <TextField label={t('designer.letterSpacing')} value={get('letter-spacing')} placeholder={hint('letter-spacing')} onCommit={set('letter-spacing')} />
        </div>
        <div className="insp-buttons">
          {(
            [
              ['font-weight', '700', /^(bold|[6-9]00)$/, <Bold key="b" size={14} />, t('designer.bold')],
              ['font-style', 'italic', /^italic$/, <Italic key="i" size={14} />, t('designer.italic')],
              ['text-decoration', 'underline', /underline/, <Underline key="u" size={14} />, t('designer.underline')]
            ] as [string, string, RegExp, ReactNode, string][]
          ).map(([prop, on, test, icon, title]) => {
            const active = test.test(get(prop) || hint(prop))
            return (
              <button key={prop} className={`icon-btn${active ? ' active' : ''}`} title={title} onClick={() => setStyles({ [prop]: active ? (prop === 'font-weight' ? '400' : 'none') : on })} data-testid={`style-${prop}`}>
                {icon}
              </button>
            )
          })}
        </div>
        <ColorField label={t('designer.color')} value={get('color')} computed={hint('color')} onCommit={set('color')} swatches={swatches} testId="style-color" />
        <ContrastNote element={element} computed={computed} />
        <div className="insp-buttons">
          {[
            ['left', <AlignLeft key="l" size={14} />],
            ['center', <AlignCenter key="c" size={14} />],
            ['right', <AlignRight key="r" size={14} />],
            ['justify', <AlignJustify key="j" size={14} />]
          ].map(([value, icon]) => (
            <button key={value as string} className={`icon-btn${(get('text-align') || hint('text-align')) === value ? ' active' : ''}`} title={value as string} onClick={() => setStyles({ 'text-align': value as string })}>
              {icon}
            </button>
          ))}
          <SelectField label="" value={get('text-transform')} options={[['uppercase', 'MAIUSCOLO'], ['lowercase', 'minuscolo'], ['capitalize', 'Iniziali']]} onCommit={set('text-transform')} />
        </div>
      </Section>

      <Section title={t('designer.background')}>
        <ColorField label={t('designer.backgroundColor')} value={/gradient/.test(get('background')) ? '' : get('background-color') || get('background')} computed={hint('background-color')} onCommit={(v) => setStyles({ background: null, 'background-color': v || null })} swatches={swatches} testId="style-background" />
        <div className="gradients">
          {GRADIENTS.map((g) => (
            <button key={g} style={{ background: g }} title={g} onClick={() => setStyles({ background: g, 'background-color': null })} />
          ))}
          <button className="btn ghost" onClick={() => setStyles({ background: null, 'background-color': null })}>
            {t('designer.none')}
          </button>
        </div>
        <div className="insp-grid">
          <TextField label={t('designer.border')} value={get('border')} placeholder="1px solid #ddd" onCommit={set('border')} />
          <TextField label={t('designer.radius')} value={get('border-radius')} placeholder={hint('border-radius')} onCommit={set('border-radius')} testId="style-radius" />
          <SelectField label={t('designer.shadow')} value={get('box-shadow')} options={SHADOWS} onCommit={set('box-shadow')} />
          <TextField label={t('designer.opacity')} value={get('opacity')} placeholder={hint('opacity')} onCommit={set('opacity')} />
        </div>
      </Section>

      {!free && (
        <Section title={t('designer.size')}>
          <div className="insp-grid">
            <TextField label={t('designer.width')} value={get('width')} placeholder={hint('width')} onCommit={set('width')} />
            <TextField label={t('designer.height')} value={get('height')} placeholder={hint('height')} onCommit={set('height')} />
            <TextField label={t('designer.maxWidth')} value={get('max-width')} placeholder={hint('max-width')} onCommit={set('max-width')} />
            <TextField label={t('designer.minHeight')} value={get('min-height')} placeholder={hint('min-height')} onCommit={set('min-height')} />
          </div>
        </Section>
      )}

      <Section title={t('designer.spacing')}>
        <div className="box-model">
          <BoxSidesField prop="margin" value={get('margin')} hint={hint} onCommit={(v) => setStyles({ margin: v || null, 'margin-top': null, 'margin-right': null, 'margin-bottom': null, 'margin-left': null })} testId="style-margin" />
          <div className="bm-inner">
            <BoxSidesField prop="padding" value={get('padding')} hint={hint} onCommit={(v) => setStyles({ padding: v || null, 'padding-top': null, 'padding-right': null, 'padding-bottom': null, 'padding-left': null })} testId="style-padding" />
          </div>
        </div>
        <div className="insp-buttons">
          {['0', '8px', '16px', '24px', '48px'].map((v) => (
            <button key={v} className="btn ghost" onClick={() => setStyles({ padding: v === '0' ? '0' : v })} title={`padding: ${v}`}>
              {v}
            </button>
          ))}
        </div>
      </Section>

      <Section title={t('designer.layout')}>
        <div className="insp-grid">
          <SelectField label="display" value={get('display')} options={[['block', 'block'], ['flex', 'flex (riga/colonna)'], ['grid', 'grid (griglia)'], ['inline-block', 'inline-block'], ['none', 'nascosto']]} onCommit={set('display')} />
          {display.includes('flex') && (
            <>
              <SelectField label={t('designer.direction')} value={get('flex-direction')} options={[['row', 'riga'], ['column', 'colonna']]} onCommit={set('flex-direction')} />
              <SelectField label="justify" value={get('justify-content')} options={['flex-start', 'center', 'flex-end', 'space-between', 'space-around'].map((v) => [v, v] as [string, string])} onCommit={set('justify-content')} />
              <SelectField label="align" value={get('align-items')} options={['stretch', 'flex-start', 'center', 'flex-end'].map((v) => [v, v] as [string, string])} onCommit={set('align-items')} />
            </>
          )}
          {display.includes('grid') && <TextField label={t('designer.columns')} value={get('grid-template-columns')} placeholder="repeat(3, 1fr)" onCommit={set('grid-template-columns')} />}
          {(display.includes('flex') || display.includes('grid')) && <TextField label="gap" value={get('gap')} placeholder={hint('gap')} onCommit={set('gap')} />}
        </div>
      </Section>
    </div>
  )
}

/** Scelta dell'icona (raccolta lucide del kit, ricerca in italiano) per un'icona SVG o il suo riquadro. */
function IconPicker({ element, current }: { element: ElementInfo; current: string | null }) {
  const [query, setQuery] = useState('')
  const found = searchIcons(query)
  return (
    <Section title={t('designer.icon')}>
      <input className="icon-search" value={query} placeholder={t('designer.iconSearch')} onChange={(e) => setQuery(e.target.value)} spellCheck={false} data-testid="icon-search" />
      {found.length === 0 && <span className="hint">{t('designer.iconNone')}</span>}
      <div className="icon-grid">
        {found.map((icon) => (
          <button
            key={icon.name}
            className={current === icon.name ? 'active' : undefined}
            title={`${icon.name} · ${icon.keywords}`}
            onClick={() => void setIcon(element, icon.name)}
            data-icon={icon.name}
            // SVG generato dal kit (dati fissi di lucide, nessun testo dell'utente).
            dangerouslySetInnerHTML={{ __html: iconSvg(icon.name) ?? '' }}
          />
        ))}
      </div>
    </Section>
  )
}

function ElementTab({ element }: { element: ElementInfo }) {
  const path = useDesigner((s) => s.path)!
  const page = useDesigner((s) => s.html)!
  const iconElement = element.tag === 'svg' ? element : element.children.map((c) => page.elements[c]!).find((c) => c.tag === 'svg' && c.attrs['data-icona'])
  const attr = (name: string) => element.attrs[name] ?? ''
  const setAttr = (name: string) => (value: string) => void setElementAttribute(element.id, name, value || null)
  const parent = element.parent !== null ? page.elements[element.parent] : null
  return (
    <div className="insp-body">
      <Section title={`<${element.tag}>`}>
        <TextField label="id" value={attr('id')} onCommit={(v) => void renameId(element, v)} testId="attr-id" wide />
        <TextField label={t('designer.classes')} value={attr('class')} onCommit={setAttr('class')} wide />
        {element.leafText && (
          <label className="insp-field wide">
            <span>{t('designer.content')}</span>
            <textarea defaultValue={element.text} key={`${element.id}:${element.text}`} rows={3} onBlur={(e) => e.target.value !== element.text && setElementText(element.id, e.target.value)} data-testid="attr-text" />
          </label>
        )}
        {element.tag === 'a' && <TextField label="href" value={attr('href')} onCommit={setAttr('href')} wide />}
        {element.tag === 'img' && (
          <>
            <TextField label="src" value={attr('src')} onCommit={setAttr('src')} wide />
            <button
              className="btn"
              onClick={async () => {
                const imported = await ide.invoke('workspace:importAsset', 'img')
                if (imported) await setElementAttribute(element.id, 'src', relativeTo(dirnameOf(path), imported))
              }}
            >
              <ImagePlus size={14} /> {t('designer.chooseImage')}
            </button>
            <TextField label="alt" value={attr('alt')} onCommit={setAttr('alt')} wide />
          </>
        )}
        {['input', 'textarea'].includes(element.tag) && <TextField label="placeholder" value={attr('placeholder')} onCommit={setAttr('placeholder')} wide />}
        {element.tag === 'input' && <SelectField label="type" value={attr('type')} options={['text', 'email', 'password', 'number', 'date', 'checkbox', 'radio', 'range', 'color', 'file'].map((v) => [v, v] as [string, string])} onCommit={setAttr('type')} />}
        {['input', 'textarea', 'select'].includes(element.tag) && <TextField label="name" value={attr('name')} onCommit={setAttr('name')} wide />}
        {element.tag === 'button' && <SelectField label="type" value={attr('type')} options={[['button', 'button'], ['submit', 'submit'], ['reset', 'reset']]} onCommit={setAttr('type')} />}
        {element.tag === 'label' && <TextField label="for" value={attr('for')} onCommit={setAttr('for')} wide />}
        {element.tag === 'video' && <TextField label="src" value={attr('src')} onCommit={setAttr('src')} wide />}
      </Section>
      {iconElement && <IconPicker element={element} current={iconElement.attrs['data-icona'] ?? null} />}
      <div className="insp-buttons">
        {parent && parent.tag !== 'html' && (
          <button className="btn ghost" onClick={() => useDesigner.getState().selectElement(parent)}>
            <CornerLeftUp size={13} /> {t('designer.selectParent')}
          </button>
        )}
        <button className="btn ghost" onClick={() => duplicateSelected()}>
          <Copy size={13} /> {t('designer.duplicate')}
        </button>
        <button className="btn ghost danger" onClick={() => removeSelected()} disabled={['body', 'html'].includes(element.tag)}>
          <Trash2 size={13} /> {t('designer.delete')}
        </button>
      </div>
    </div>
  )
}

function SiteTab() {
  const css = useDesigner((s) => s.css)
  const stylesheet = useDesigner((s) => s.stylesheet)
  const source = stylesheet ? (css[stylesheet] ?? '') : ''
  const variables = getVariables(source)
  const body = getDeclarations(source, 'body')
  const [name, setName] = useState('')
  const [baseColor, setBaseColor] = useState('#4f46e5')
  const [dark, setDark] = useState(false)
  const current = activeTheme(variables)
  const scale = activeTypeScale(variables)
  const pair = activeFontPair(variables)
  const fontsReady = useKitFonts(KIT_FONTS.map((f) => f.id))
  const roleVariables = new Set<string>(COLOR_ROLES.map(([, v]) => v))
  const others = Object.entries(variables).filter(([v]) => !roleVariables.has(v))
  return (
    <div className="insp-body">
      <Section title={t('designer.themes')}>
        <div className="theme-grid">
          {THEMES.map((theme) => (
            <button key={theme.id} className={`theme-card${current?.id === theme.id ? ' active' : ''}`} onClick={() => void applyTheme(theme)} data-theme-id={theme.id} title={t('designer.themeApply', { name: theme.label })}>
              <span className="theme-swatches" style={{ background: theme.background }}>
                <i style={{ background: theme.primary }} />
                <i style={{ background: theme.secondary }} />
                <i style={{ background: theme.text }} />
              </span>
              <span className="theme-name" style={{ fontFamily: theme.headingFont }}>
                {theme.label}
              </span>
            </button>
          ))}
        </div>
        <span className="hint">{t('designer.themesHint')}</span>
      </Section>
      <Section title={t('designer.fromColor')}>
        <span className="hint">{t('designer.fromColorHint')}</span>
        <div className="insp-buttons">
          <input type="color" value={baseColor} onChange={(e) => setBaseColor(e.target.value)} aria-label={t('designer.fromColor')} data-testid="theme-base-color" />
          <label className="check">
            <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} /> {t('designer.fromColorDark')}
          </label>
          <button className="btn" onClick={() => void applyThemeFromColor(baseColor, dark)} data-testid="theme-from-color">
            {t('designer.fromColorApply')}
          </button>
        </div>
      </Section>
      <Section title={t('designer.typeScale')}>
        <span className="hint">{t('designer.typeScaleHint')}</span>
        <div className="preset-chips">
          {TYPE_SCALES.map((s) => (
            <button key={s.id} className={`chip${scale === s.id ? ' active' : ''}`} onClick={() => void applyTypeScale(s.id)} data-type-scale={s.id}>
              {t(`designer.typeScale.${s.id}`)}
            </button>
          ))}
        </div>
      </Section>
      <Section title={t('designer.fontPairs')}>
        <div className="pair-grid">
          {FONT_PAIRS.map((p) => {
            const heading = kitFont(p.heading)!
            const bodyFont = kitFont(p.body)!
            return (
              <button key={p.id} className={`pair-card${pair?.id === p.id ? ' active' : ''}`} onClick={() => void applyFontPair(p.id)} data-pair={p.id} title={`${heading.family} + ${bodyFont.family}`}>
                <span className="pair-heading" style={fontsReady ? { fontFamily: fontStack(heading), fontWeight: p.headingWeight } : undefined}>
                  {t(`designer.pair.${p.id}` as 'designer.pair.moderna')}
                </span>
                <span className="pair-body" style={fontsReady ? { fontFamily: fontStack(bodyFont) } : undefined}>
                  {t('designer.pairSample')}
                </span>
                <span className="pair-names">
                  {heading.family}
                  {heading.id !== bodyFont.id ? ` + ${bodyFont.family}` : ''}
                </span>
              </button>
            )
          })}
        </div>
        <span className="hint">{t('designer.fontPairsHint')}</span>
      </Section>
      <Section title={t('designer.siteColors')}>
        {COLOR_ROLES.filter(([, variable]) => variables[variable]).map(([role, variable]) => (
          <ColorField key={variable} label={`${t(`designer.role.${role}`)} · ${variable}`} value={variables[variable]!} computed={variables[variable]!} onCommit={(v) => setSiteRule(':root', { [variable]: v })} swatches={[]} testId={`site-color-${role}`} />
        ))}
        {others.length > 0 && (
          <details className="insp-more">
            <summary>
              {t('designer.otherVariables')} ({others.length})
            </summary>
            {others.map(([variable, value]) =>
              isColorValue(value) && !value.startsWith('var(') ? (
                <ColorField key={variable} label={variable} value={value} computed={value} onCommit={(v) => setSiteRule(':root', { [variable]: v })} swatches={[]} />
              ) : (
                <TextField key={variable} label={variable} value={value} onCommit={(v) => setSiteRule(':root', { [variable]: v || null })} wide />
              )
            )}
          </details>
        )}
        <div className="insp-buttons">
          <input value={name} placeholder="--nome-colore" onChange={(e) => setName(e.target.value)} spellCheck={false} />
          <button className="btn" disabled={!/^--?[a-z][\w-]*$/i.test(name)} onClick={() => setSiteRule(':root', { [name.startsWith('--') ? name : `--${name}`]: '#4f46e5' }).then(() => setName(''))}>
            {t('designer.addColor')}
          </button>
        </div>
      </Section>
      <Section title={t('designer.sitePage')}>
        <SelectField label={t('designer.font')} value={body['font-family'] ?? ''} options={FONTS.map(([v, l]) => [v, l] as [string, string])} onCommit={(v) => setSiteRule('body', { 'font-family': v || null })} />
        <ColorField label={t('designer.backgroundColor')} value={body['background'] ?? body['background-color'] ?? ''} computed="#ffffff" onCommit={(v) => setSiteRule('body', { background: v || null })} swatches={themeSwatches(variables)} />
        <ColorField label={t('designer.textColor')} value={body['color'] ?? ''} computed="#000000" onCommit={(v) => setSiteRule('body', { color: v || null })} swatches={themeSwatches(variables)} />
      </Section>
    </div>
  )
}

export function Inspector() {
  const page = useDesigner((s) => s.html)
  const selection = useDesigner((s) => s.selection)
  const tab = useDesigner((s) => s.rightTab)
  const element = resolveSelection(page, selection)
  return (
    <div className="designer-inspector" data-testid="designer-inspector">
      <div className="insp-tabs">
        {(['style', 'element', 'site'] as const).map((value) => (
          <button key={value} className={tab === value ? 'active' : undefined} onClick={() => useDesigner.getState().setRightTab(value)} data-testid={`insp-tab-${value}`}>
            {value === 'style' ? t('designer.tabStyle') : value === 'element' ? t('designer.tabElement') : t('designer.tabSite')}
          </button>
        ))}
      </div>
      {tab === 'site' ? <SiteTab /> : !element ? <div className="hint" style={{ padding: 12 }}>{t('designer.selectSomething')}</div> : tab === 'style' ? <StyleTab element={element} /> : <ElementTab element={element} />}
    </div>
  )
}
