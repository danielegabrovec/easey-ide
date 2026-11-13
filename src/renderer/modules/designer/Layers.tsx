// Livelli: l'albero degli elementi della pagina. Clic = seleziona, triangolo = apri/chiudi un ramo,
// trascinamento di una riga = sposta l'elemento prima, dopo o dentro un altro (come il Navigatore
// degli editor visuali); le frecce spostano fra i fratelli.
import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { VOID_TAGS, type ElementInfo } from '@shared/designer/html-model'
import type { InsertPosition } from '@shared/designer/html-edit'
import { t } from '../../i18n'
import { moveNode, moveSelectedTo, removeSelected } from './actions'
import { resolveSelection, useDesigner } from './designer-store'

const HIDDEN = new Set(['script', 'style', 'link', 'meta'])
const LAYER_MIME = 'text/x-lab-layer'
/** Elementi che non ne contengono altri anche se hanno un tag di chiusura. */
const NOT_CONTAINERS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'a', 'button', 'label', 'textarea', 'select', 'option', 'strong', 'em', 'small', 'cite', 'summary', 'th', 'td', 'video'])

function label(element: ElementInfo): string {
  const id = element.attrs['id'] ? `#${element.attrs['id']}` : ''
  const cls = element.attrs['class'] ? `.${element.attrs['class'].trim().split(/\s+/).join('.')}` : ''
  const text = element.leafText && element.text ? ` “${element.text.slice(0, 24)}${element.text.length > 24 ? '…' : ''}”` : ''
  return `${element.tag}${id}${cls}${text}`
}

const canContain = (element: ElementInfo) => !VOID_TAGS.has(element.tag) && !NOT_CONTAINERS.has(element.tag)

export function Layers() {
  const page = useDesigner((s) => s.html)
  const selection = useDesigner((s) => s.selection)
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const [drop, setDrop] = useState<{ id: number; where: InsertPosition } | null>(null)
  const selected = resolveSelection(page, selection)
  if (!page || page.body === null) return <div className="hint" style={{ padding: 10 }}>{t('designer.noBody')}</div>

  // Un ramo si ricorda per id o percorso: resta chiuso anche dopo le modifiche che rianalizzano la pagina.
  const branchKey = (element: ElementInfo) => element.attrs['id'] ?? element.path.join('.')
  const toggle = (element: ElementInfo) =>
    setClosed((current) => {
      const next = new Set(current)
      const key = branchKey(element)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const whereOf = (event: React.DragEvent, element: ElementInfo): InsertPosition => {
    const r = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const y = (event.clientY - r.top) / r.height
    if (element.tag === 'body') return 'inside-end'
    if (canContain(element) && y > 0.25 && y < 0.75) return 'inside-end'
    return y < 0.5 ? 'before' : 'after'
  }

  const render = (id: number, depth: number): React.ReactNode => {
    const element = page.elements[id]!
    if (HIDDEN.has(element.tag)) return null
    const children = element.children.filter((c) => !HIDDEN.has(page.elements[c]!.tag))
    const isClosed = closed.has(branchKey(element))
    const marker = drop?.id === id ? ` drop-${drop.where}` : ''
    return (
      <div key={id}>
        <div
          className={`tree-row layer-row${selected?.id === id ? ' active' : ''}${marker}`}
          style={{ paddingLeft: 4 + depth * 12 }}
          draggable={element.tag !== 'body'}
          onClick={() => useDesigner.getState().selectElement(element)}
          onMouseEnter={() => useDesigner.getState().setHover(id)}
          onMouseLeave={() => useDesigner.getState().setHover(null)}
          onDragStart={(event) => {
            event.dataTransfer.setData(LAYER_MIME, String(id))
            event.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes(LAYER_MIME)) return
            event.preventDefault()
            const where = whereOf(event, element)
            if (drop?.id !== id || drop.where !== where) setDrop({ id, where })
          }}
          onDragLeave={() => setDrop((current) => (current?.id === id ? null : current))}
          onDrop={(event) => {
            const source = Number(event.dataTransfer.getData(LAYER_MIME))
            const where = whereOf(event, element)
            setDrop(null)
            if (!Number.isNaN(source)) {
              event.preventDefault()
              void moveNode(source, id, where)
            }
          }}
          data-layer={element.attrs['id'] ?? element.tag}
        >
          {children.length > 0 ? (
            <button
              className="layer-toggle"
              onClick={(event) => {
                event.stopPropagation()
                toggle(element)
              }}
              aria-label={isClosed ? t('designer.expand') : t('designer.collapse')}
            >
              {isClosed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </button>
          ) : (
            <span className="layer-toggle" />
          )}
          <span className="tree-name">{label(element)}</span>
        </div>
        {!isClosed && children.map((child) => render(child, depth + 1))}
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
      <div className="hint" style={{ padding: '4px 10px' }}>
        {t('designer.layersHint')}
      </div>
      <div className="panel-body">{render(page.body, 0)}</div>
    </div>
  )
}
