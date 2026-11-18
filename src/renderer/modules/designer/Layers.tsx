// Livelli: l'albero degli elementi della pagina. Clic = seleziona, triangolo = apri/chiudi un ramo,
// trascinamento di una riga = sposta l'elemento prima, dopo o dentro un altro (come il Navigatore
// degli editor visuali); le frecce spostano fra i fratelli.
import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Eye, EyeOff, Lock, LockOpen, Trash2 } from 'lucide-react'
import { keyMatches } from '@shared/designer/view-keys'
import { useCanvasView } from './view-state'
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
  const others = useDesigner((s) => s.others)
  const hidden = useCanvasView((s) => s.hidden)
  const locked = useCanvasView((s) => s.locked)
  const selected = resolveSelection(page, selection)
  if (!page || page.body === null) return <div className="hint" style={{ padding: 10 }}>{t('designer.noBody')}</div>
  const chosen = new Set(others.map((key) => resolveSelection(page, key)?.id).filter((id): id is number => id !== undefined))

  // Righe visibili nell'ordine dell'albero (per Maiusc+clic: tutte quelle fra la scelta e questa).
  const visibleRows = (): number[] => {
    const out: number[] = []
    const walk = (id: number) => {
      const element = page.elements[id]!
      if (HIDDEN.has(element.tag)) return
      out.push(id)
      if (!closed.has(branchKey(element))) for (const child of element.children) walk(child)
    }
    walk(page.body!)
    return out
  }

  /** Clic = solo lui; Ctrl+clic = aggiunge/toglie; Maiusc+clic = tutti quelli fra la scelta e questo. */
  const pick = (element: ElementInfo, event: React.MouseEvent) => {
    const state = useDesigner.getState()
    if (event.ctrlKey || event.metaKey) state.toggleInGroup(element)
    else if (event.shiftKey && selected) {
      const rows = visibleRows()
      const a = rows.indexOf(selected.id)
      const b = rows.indexOf(element.id)
      if (a < 0 || b < 0) return state.selectElement(element)
      const range = rows.slice(Math.min(a, b), Math.max(a, b) + 1).filter((id) => page.elements[id]!.tag !== 'body')
      state.setGroup([selected, ...range.filter((id) => id !== selected.id).map((id) => page.elements[id]!)])
    } else state.selectElement(element)
  }

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
    const isHidden = keyMatches(page, hidden, element)
    const isLocked = keyMatches(page, locked, element)
    return (
      <div key={id}>
        <div
          className={`tree-row layer-row${selected?.id === id ? ' active' : chosen.has(id) ? ' chosen' : ''}${marker}${isHidden ? ' is-hidden' : ''}`}
          style={{ paddingLeft: 4 + depth * 12 }}
          draggable={element.tag !== 'body'}
          onClick={(event) => pick(element, event)}
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
          {element.tag !== 'body' && (
            <span className="layer-flags">
              <button
                className={`layer-flag${isHidden ? ' on' : ''}`}
                onClick={(event) => {
                  event.stopPropagation()
                  useCanvasView.getState().toggleHidden(element, page)
                }}
                title={isHidden ? t('designer.layerShow') : t('designer.layerHide')}
                aria-label={isHidden ? t('designer.layerShow') : t('designer.layerHide')}
                aria-pressed={isHidden}
                data-testid="layer-eye"
              >
                {isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
              <button
                className={`layer-flag${isLocked ? ' on' : ''}`}
                onClick={(event) => {
                  event.stopPropagation()
                  useCanvasView.getState().toggleLocked(element, page)
                }}
                title={isLocked ? t('designer.layerUnlock') : t('designer.layerLock')}
                aria-label={isLocked ? t('designer.layerUnlock') : t('designer.layerLock')}
                aria-pressed={isLocked}
                data-testid="layer-lock"
              >
                {isLocked ? <Lock size={12} /> : <LockOpen size={12} />}
              </button>
            </span>
          )}
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
