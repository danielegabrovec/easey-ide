// Ispettore del designer: stili (con bersaglio: elemento, classe o in linea; e punto di interruzione),
// proprietà dell'elemento e stile generale del sito (variabili, caratteri, sfondo).
import { useEffect, useState, type ReactNode } from 'react'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowUpToLine, ArrowDownToLine, Copy, CornerLeftUp, ImagePlus, Trash2 } from 'lucide-react'
import { getDeclarations, getVariables, isColorValue } from '@shared/designer/css-edit'
import { isFreeElement, type ElementInfo } from '@shared/designer/html-model'
import { dirnameOf, relativeTo } from '@shared/paths'
import { ide } from '../../ipc'
import { t } from '../../i18n'
import { currentRule, duplicateSelected, removeSelected, renameId, setElementAttribute, setElementText, setSiteRule, setStyles } from './actions'
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

function StyleTab({ element }: { element: ElementInfo }) {
  const page = useDesigner((s) => s.html)!
  const target = useDesigner((s) => s.target)
  const targetClass = useDesigner((s) => s.targetClass)
  const breakpoint = useDesigner((s) => s.breakpoint)
  const css = useDesigner((s) => s.css)
  const stylesheet = useDesigner((s) => s.stylesheet)
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
      </div>

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
          <SelectField label={t('designer.font')} value={get('font-family')} options={[...FONTS.map(([v, l]) => [v, l] as [string, string]), ...Object.keys(variables).filter((v) => /font/.test(v)).map((v) => [`var(${v})`, v] as [string, string])]} onCommit={set('font-family')} />
          <TextField label={t('designer.size')} value={get('font-size')} placeholder={hint('font-size')} onCommit={set('font-size')} testId="style-font-size" />
          <SelectField label={t('designer.weight')} value={get('font-weight')} options={[['300', 'Leggero'], ['400', 'Normale'], ['600', 'Seminegretto'], ['700', 'Grassetto'], ['900', 'Nero']]} onCommit={set('font-weight')} />
          <TextField label={t('designer.lineHeight')} value={get('line-height')} placeholder={hint('line-height')} onCommit={set('line-height')} />
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
          <span className="bm-label">margin</span>
          <TextField label="" value={get('margin')} placeholder={['margin-top', 'margin-right', 'margin-bottom', 'margin-left'].map(hint).join(' ')} onCommit={set('margin')} wide />
          <div className="bm-inner">
            <span className="bm-label">padding</span>
            <TextField label="" value={get('padding')} placeholder={['padding-top', 'padding-right', 'padding-bottom', 'padding-left'].map(hint).join(' ')} onCommit={set('padding')} testId="style-padding" wide />
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
  return (
    <div className="insp-body">
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
