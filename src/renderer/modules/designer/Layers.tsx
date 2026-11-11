// Livelli: l'albero degli elementi della pagina; clic = seleziona, frecce = sposta fra i fratelli.
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import type { ElementInfo } from '@shared/designer/html-model'
import { t } from '../../i18n'
import { moveSelectedTo, removeSelected } from './actions'
import { resolveSelection, useDesigner } from './designer-store'

function label(element: ElementInfo): string {
  const id = element.attrs['id'] ? `#${element.attrs['id']}` : ''
  const cls = element.attrs['class'] ? `.${element.attrs['class'].trim().split(/\s+/).join('.')}` : ''
  const text = element.leafText && element.text ? ` “${element.text.slice(0, 24)}${element.text.length > 24 ? '…' : ''}”` : ''
  return `${element.tag}${id}${cls}${text}`
}

export function Layers() {
  const page = useDesigner((s) => s.html)
  const selection = useDesigner((s) => s.selection)
  const selected = resolveSelection(page, selection)
  if (!page || page.body === null) return <div className="hint" style={{ padding: 10 }}>{t('designer.noBody')}</div>

  const render = (id: number, depth: number): React.ReactNode => {
    const element = page.elements[id]!
    if (['script', 'style', 'link', 'meta'].includes(element.tag)) return null
    return (
      <div key={id}>
        <div
          className={`tree-row layer-row${selected?.id === id ? ' active' : ''}`}
          style={{ paddingLeft: 8 + depth * 12 }}
          onClick={() => useDesigner.getState().selectElement(element)}
          onMouseEnter={() => useDesigner.getState().setHover(id)}
          onMouseLeave={() => useDesigner.getState().setHover(null)}
          data-layer={element.attrs['id'] ?? element.tag}
        >
          <span className="tree-name">{label(element)}</span>
        </div>
        {element.children.map((child) => render(child, depth + 1))}
      </div>
    )
  }

  const siblings = selected && selected.parent !== null ? page.elements[selected.parent]!.children.filter((c) => !['script', 'style'].includes(page.elements[c]!.tag)) : []
  const index = selected ? siblings.indexOf(selected.id) : -1

  return (
    <div className="designer-layers">
      <div className="panel-toolbar">
        <span className="title">{t('designer.layers')}</span>
        <span style={{ flex: 1 }} />
        <button className="icon-btn" title={t('designer.moveUp')} disabled={index <= 0} onClick={() => moveSelectedTo(siblings[index - 1]!, 'before')}>
          <ArrowUp size={14} />
        </button>
        <button className="icon-btn" title={t('designer.moveDown')} disabled={index < 0 || index >= siblings.length - 1} onClick={() => moveSelectedTo(siblings[index + 1]!, 'after')}>
          <ArrowDown size={14} />
        </button>
        <button className="icon-btn" title={t('designer.delete')} disabled={!selected || selected.tag === 'body'} onClick={() => removeSelected()}>
          <Trash2 size={13} />
        </button>
      </div>
      <div className="panel-body">{render(page.body, 0)}</div>
    </div>
  )
}
