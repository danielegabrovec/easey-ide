// Ispettore del designer: stili (con bersaglio: elemento, classe o in linea; e punto di interruzione),
// proprietà dell'elemento e stile generale del sito (variabili, caratteri, sfondo).
import { useEffect, useState, type ReactNode } from 'react'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowUpToLine, ArrowDownToLine, Bold, ClipboardPaste, Copy, CornerLeftUp, ImagePlus, Italic, Paintbrush, Trash2, Underline } from 'lucide-react'
import { boxSides, getDeclarations, getVariables, isColorValue, joinBoxSides } from '@shared/designer/css-edit'
import { isFreeElement, type ElementInfo } from '@shared/designer/html-model'
import { activeTheme, presetGroupsFor, PRESETS, THEMES, type PresetGroup } from '@shared/designer/presets'
import { dirnameOf, relativeTo } from '@shared/paths'
import { ide } from '../../ipc'
import { t } from '../../i18n'
import { applyPreset, applyTheme, currentRule, duplicateSelected, pasteStyle, removeSelected, renameId, setElementAttribute, setElementText, setSiteRule, setStyles } from './actions'
import { copyStyleWithNotice } from './Canvas'
import { resolveSelection, useDesigner, type StyleTarget } from './designer-store'
import { computedStyle, toHex } from './frame-access'

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

function ColorField({ label, value, computed, onCommit, swatches, testId }: { label: string; value: string; computed: string; onCommit: (value: string) => void; swatches: [string, string][]; testId?: string }) {
  return (
    <div className="insp-field wide">
      <span>{label}</span>
      <div className="color-row">
        <input type="color" value={toHex(value && !value.startsWith('var(') ? value : computed)} onChange={(e) => onCommit(e.target.value)} data-testid={testId} />
        <TextField label="" value={value} placeholder={computed} onCommit={onCommit} />
      </div>
      {swatches.length > 0 && (
        <div className="swatches">
          {swatches.map(([name, color]) => (
            <button key={name} title={name} style={{ background: color }} onClick={() => onCommit(`var(${name})`)} />
          ))}
        </div>
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
  void css
  const { selector, declarations } = currentRule(element)
  const computed = computedStyle(element.id)
  const get = (prop: string) => declarations[prop] ?? ''
  const hint = (prop: string) => computed?.getPropertyValue(prop) ?? ''
  const set = (prop: string) => (value: string) => void setStyles({ [prop]: value || null })
  const classes = (element.attrs['class'] ?? '').split(/\s+/).filter(Boolean)
  const variables = stylesheet ? getVariables(css[stylesheet] ?? '') : {}
  const swatches = Object.entries(variables).filter(([, v]) => isColorValue(v)) as [string, string][]
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
          <SelectField label={t('designer.weight')} value={get('font-weight')} options={[['300', 'Leggero'], ['400', 'Normale'], ['600', 'Seminegretto'], ['700', 'Grassetto'], ['900', 'Nero']]} onCommit={set('font-weight')} />
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

function ElementTab({ element }: { element: ElementInfo }) {
  const path = useDesigner((s) => s.path)!
  const page = useDesigner((s) => s.html)!
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
  const current = activeTheme(variables)
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
      <Section title={t('designer.siteColors')}>
        {Object.entries(variables).map(([variable, value]) =>
          isColorValue(value) && !value.startsWith('var(') ? (
            <ColorField key={variable} label={variable} value={value} computed={value} onCommit={(v) => setSiteRule(':root', { [variable]: v })} swatches={[]} />
          ) : (
            <TextField key={variable} label={variable} value={value} onCommit={(v) => setSiteRule(':root', { [variable]: v || null })} wide />
          )
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
        <ColorField label={t('designer.backgroundColor')} value={body['background'] ?? body['background-color'] ?? ''} computed="#ffffff" onCommit={(v) => setSiteRule('body', { background: v || null })} swatches={Object.entries(variables).filter(([, v]) => isColorValue(v)) as [string, string][]} />
        <ColorField label={t('designer.textColor')} value={body['color'] ?? ''} computed="#000000" onCommit={(v) => setSiteRule('body', { color: v || null })} swatches={Object.entries(variables).filter(([, v]) => isColorValue(v)) as [string, string][]} />
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
