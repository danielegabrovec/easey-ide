// Barra «Allinea» sopra la tela (1.7): appare con due o più elementi scelti. Allinea (6 modi), distribuisci,
// stessa larghezza/altezza e livelli; con elementi in fila nella selezione avvisa e propone di renderli liberi.
import type { ComponentType } from 'react'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  ArrowDownToLine,
  ArrowDown,
  ArrowUp,
  ArrowUpToLine,
  MoveHorizontal,
  MoveVertical
} from 'lucide-react'
import type { AlignMode, RestackOp } from '@shared/canvas-kit/align'
import { isFreeElement } from '@shared/designer/html-model'
import { t } from '../../i18n'
import { alignSelection, distributeSelection, matchSelectionSize, restackSelection } from './arrange'
import { resolveSelection, useDesigner } from './designer-store'

type Icon = ComponentType<{ size?: number }>

const ALIGN: [AlignMode, Icon][] = [
  ['left', AlignStartVertical],
  ['center', AlignCenterVertical],
  ['right', AlignEndVertical],
  ['top', AlignStartHorizontal],
  ['middle', AlignCenterHorizontal],
  ['bottom', AlignEndHorizontal]
]

const RESTACK: [RestackOp, Icon][] = [
  ['front', ArrowUpToLine],
  ['forward', ArrowUp],
  ['backward', ArrowDown],
  ['back', ArrowDownToLine]
]

export function ArrangeBar() {
  const page = useDesigner((s) => s.html)
  const selection = useDesigner((s) => s.selection)
  const others = useDesigner((s) => s.others)
  const elements = [selection, ...others].map((key) => resolveSelection(page, key)).filter((e): e is NonNullable<typeof e> => !!e && !['html', 'body', 'head'].includes(e.tag))
  if (elements.length < 2 || !page) return null
  const inFlow = elements.filter((e) => !isFreeElement(page, e.id)).length
  const button = (key: string, label: string, Icon: Icon, run: () => void, disabled = false) => (
    <button key={key} className="icon-btn" title={label} aria-label={label} onClick={run} disabled={disabled} data-testid={`arrange-${key}`}>
      <Icon size={14} />
    </button>
  )
  return (
    <div className="arrange-bar" role="toolbar" aria-label={t('designer.arrange')} data-testid="arrange-bar">
      <span className="arrange-count">{t('designer.multiCount', { n: elements.length })}</span>
      {ALIGN.map(([mode, Icon]) => button(mode, t(`designer.align.${mode}` as 'designer.align.left'), Icon, () => void alignSelection(mode)))}
      <span className="arrange-sep" />
      {button('distribute-h', t('designer.distributeH'), AlignHorizontalSpaceAround, () => void distributeSelection('horizontal'), elements.length < 3)}
      {button('distribute-v', t('designer.distributeV'), AlignVerticalSpaceAround, () => void distributeSelection('vertical'), elements.length < 3)}
      {button('same-width', t('designer.sameWidth'), MoveHorizontal, () => void matchSelectionSize('width'))}
      {button('same-height', t('designer.sameHeight'), MoveVertical, () => void matchSelectionSize('height'))}
      <span className="arrange-sep" />
      {RESTACK.map(([op, Icon]) => button(op, t(`designer.restack.${op}` as 'designer.restack.front'), Icon, () => void restackSelection(op), inFlow === elements.length))}
      {inFlow > 0 && (
        <span className="arrange-note" title={t('designer.arrangeFlowHint')}>
          {t('designer.arrangeInFlow', { n: inFlow })}
        </span>
      )}
    </div>
  )
}
