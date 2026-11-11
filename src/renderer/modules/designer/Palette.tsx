// Palette degli elementi e dei blocchi: si trascinano nel canvas, oppure clic = inserisci dopo la selezione.
import { BLOCKS, CATEGORY_LABELS, type BlockCategory } from '@shared/designer/blocks'
import { FREE_CANVAS_CLASS, hasClass, isFreeElement } from '@shared/designer/html-model'
import { t } from '../../i18n'
import { insertBlock } from './actions'
import { selectedElement, useDesigner } from './designer-store'

function insertWithClick(blockId: string): void {
  const page = useDesigner.getState().html
  const selected = selectedElement()
  if (!page) return
  if (selected && hasClass(selected, FREE_CANVAS_CLASS)) {
    void insertBlock(blockId, { freeIn: selected.id, x: 40, y: 40 })
    return
  }
  if (selected && isFreeElement(page, selected.id)) {
    void insertBlock(blockId, { freeIn: selected.parent!, x: 60, y: 60 })
    return
  }
  if (!selected || selected.tag === 'body') {
    void insertBlock(blockId, { targetId: page.body, where: 'inside-end' })
    return
  }
  void insertBlock(blockId, { targetId: selected.id, where: 'after' })
}

export function Palette() {
  const categories = Object.keys(CATEGORY_LABELS) as BlockCategory[]
  return (
    <div className="designer-palette" data-testid="designer-palette">
      <div className="hint" style={{ padding: '6px 10px' }}>
        {t('designer.paletteHint')}
      </div>
      {categories.map((category) => (
        <section key={category}>
          <h4>{CATEGORY_LABELS[category]}</h4>
          <div className="palette-items">
            {BLOCKS.filter((b) => b.category === category).map((block) => (
              <button
                key={block.id}
                className="palette-item"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/x-lab-block', block.id)
                  event.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => insertWithClick(block.id)}
                data-block={block.id}
                title={t('designer.paletteItemHint')}
              >
                {block.label}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
