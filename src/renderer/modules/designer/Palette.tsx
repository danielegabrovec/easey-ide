// Palette degli elementi, delle sezioni e delle pagine intere: si cercano per nome, si trascinano nel
// canvas, oppure clic = inserisci dopo la selezione. Gli elementi sono riquadri con icona (si
// riconoscono a colpo d'occhio), sezioni e pagine sono righe con il nome per intero.
import type { ComponentType } from 'react'
import {
  BadgeEuro,
  ChartColumn,
  CircleHelp,
  Columns2,
  Contact,
  CreditCard,
  FileText,
  Frame,
  Heading1,
  Heading2,
  Image,
  Images,
  LayoutGrid,
  LayoutTemplate,
  Link,
  List,
  Megaphone,
  MessageSquareQuote,
  Minus,
  MousePointerClick,
  PanelBottom,
  PanelTop,
  Pilcrow,
  Quote,
  RectangleHorizontal,
  Rows3,
  Search,
  Shapes,
  Smile,
  Sparkles,
  Square,
  SquareCheck,
  SquareChevronDown,
  Table,
  Tag,
  TextCursorInput,
  Type,
  Users,
  Video,
  X,
  Zap
} from 'lucide-react'
import { CATEGORY_LABELS, searchBlocks, type Block, type BlockCategory } from '@shared/designer/blocks'
import { FREE_CANVAS_CLASS, hasClass, isFreeElement } from '@shared/designer/html-model'
import { t } from '../../i18n'
import { canContain, defaultInsertTarget } from '@shared/designer/drop'
import { endOfBody, insertBlock, placePage } from './actions'
import { selectedElement, useDesigner } from './designer-store'
import { visibleContainer } from './frame-access'

type Icon = ComponentType<{ size?: number }>

const ICONS: Record<string, Icon> = {
  tavola: Frame,
  sezione: Rows3,
  contenitore: Square,
  colonne: Columns2,
  griglia: LayoutGrid,
  separatore: Minus,
  scheda: CreditCard,
  titolo: Heading1,
  sottotitolo: Heading2,
  paragrafo: Pilcrow,
  link: Link,
  elenco: List,
  citazione: Quote,
  etichetta: Tag,
  tabella: Table,
  pulsante: MousePointerClick,
  pulsanti: RectangleHorizontal,
  modulo: FileText,
  campo: TextCursorInput,
  area: Type,
  selezione: SquareChevronDown,
  spunta: SquareCheck,
  immagine: Image,
  video: Video,
  emoji: Smile,
  forma: Shapes,
  intestazione: PanelTop,
  hero: Sparkles,
  prezzi: BadgeEuro,
  galleria: Images,
  piede: PanelBottom,
  caratteristiche: Zap,
  testimonianze: MessageSquareQuote,
  faq: CircleHelp,
  cta: Megaphone,
  numeri: ChartColumn,
  squadra: Users,
  contatti: Contact
}

/** Categorie mostrate come riquadri (elementi singoli); le altre come righe. */
const TILE_CATEGORIES = new Set<BlockCategory>(['struttura', 'testo', 'moduli', 'media'])

function insertWithClick(blockId: string): void {
  const page = useDesigner.getState().html
  const selected = selectedElement()
  if (!page) return
  // Le pagine intere sostituiscono la pagina (o vanno in fondo al body), mai dentro la selezione.
  if (blockId.startsWith('pagina-')) {
    void placePage(blockId)
    return
  }
  if (selected && hasClass(selected, FREE_CANVAS_CLASS)) {
    void insertBlock(blockId, { freeIn: selected.id, x: 40, y: 40 })
    return
  }
  if (selected && isFreeElement(page, selected.id)) {
    void insertBlock(blockId, { freeIn: selected.parent!, x: 60, y: 60 })
    return
  }
  if (!selected || selected.tag === 'body') {
    // Senza selezione: nel contenitore che si vede al centro del canvas, o nel principale (<main>),
    // mai in fondo al body fuori da tutto (e magari fuori vista).
    const visible = visibleContainer((id) => canContain(page.elements[id]) || hasClass(page.elements[id]!, FREE_CANVAS_CLASS))
    const target = defaultInsertTarget(page, visible)
    useDesigner.getState().setRevealSelection(true)
    if (!target) void insertBlock(blockId, endOfBody(page))
    else if ('freeIn' in target) void insertBlock(blockId, { freeIn: target.freeIn, x: 40, y: 40 })
    else void insertBlock(blockId, { targetId: target.id, where: target.where })
    return
  }
  useDesigner.getState().setRevealSelection(true)
  void insertBlock(blockId, { targetId: selected.id, where: 'after' })
}

function PaletteItem({ block, tile }: { block: Block; tile: boolean }) {
  const Glyph = ICONS[block.id] ?? (block.category === 'modelli' ? LayoutTemplate : Square)
  return (
    <button
      className={`palette-item${tile ? ' tile' : ''}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/x-lab-block', block.id)
        event.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={() => insertWithClick(block.id)}
      data-block={block.id}
      title={t('designer.paletteItemHint')}
    >
      <Glyph size={tile ? 18 : 14} />
      <span>{block.label}</span>
    </button>
  )
}

export function Palette() {
  const query = useDesigner((s) => s.paletteQuery)
  const found = searchBlocks(query)
  const categories = (Object.keys(CATEGORY_LABELS) as BlockCategory[]).filter((c) => found.some((b) => b.category === c))
  return (
    <div className="designer-palette" data-testid="designer-palette">
      <div className="palette-search">
        <Search size={13} />
        <input
          value={query}
          placeholder={t('designer.paletteSearch')}
          spellCheck={false}
          onChange={(e) => useDesigner.getState().setPaletteQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') useDesigner.getState().setPaletteQuery('')
            // Invio = inserisce il primo risultato: si cerca e si aggiunge senza toccare il mouse.
            if (e.key === 'Enter' && found[0]) insertWithClick(found[0].id)
          }}
          data-testid="designer-palette-search"
        />
        {query && (
          <button className="icon-btn" title={t('designer.paletteClear')} onClick={() => useDesigner.getState().setPaletteQuery('')}>
            <X size={12} />
          </button>
        )}
      </div>
      {!query && (
        <div className="hint" style={{ padding: '2px 10px 6px' }}>
          {t('designer.paletteHint')}
        </div>
      )}
      {categories.length === 0 && (
        <div className="hint" style={{ padding: '6px 10px' }}>
          {t('designer.paletteNone')}
        </div>
      )}
      {categories.map((category) => {
        const tile = TILE_CATEGORIES.has(category)
        return (
          <section key={category}>
            <h4>{CATEGORY_LABELS[category]}</h4>
            <div className={`palette-items${tile ? ' tiles' : ''}`}>
              {found
                .filter((b) => b.category === category)
                .map((block) => (
                  <PaletteItem key={block.id} block={block} tile={tile} />
                ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
