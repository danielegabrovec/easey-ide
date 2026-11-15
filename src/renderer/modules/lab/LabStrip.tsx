// Striscia degli esempi del Laboratorio (1.6, come quella del Laboratorio SQL di Easey DB), sottile, sopra l'editor
// della Scrittura rapida: esempi pronti nel linguaggio scelto (@shared/quick/lab-examples; clic = scrive, ▶ = scrive
// ed esegue) e i pulsanti «Guida» (come si usa l'app) e «Manuale» (imparare il linguaggio). Solo nel Laboratorio.
import { BookOpen, Compass, Lightbulb, Play } from 'lucide-react'
import { labExamples } from '@shared/quick/lab-examples'
import { executeCommand } from '../../workbench/commands'
import { useLayout } from '../../workbench/layout'
import { t } from '../../i18n'
import type { MessageKey } from '../../i18n/it'
import { useQuick } from '../quick-code/quick-store'

export function LabStrip() {
  const lab = useLayout((s) => s.preset === 'lab')
  const language = useQuick((s) => s.language)
  if (!lab) return null
  const examples = labExamples(language)
  return (
    <div className="lab-strip" data-testid="lab-strip" role="region" aria-label={t('lab.stripTitle')}>
      <Lightbulb size={13} className="lab-strip-icon" />
      <span className="lab-strip-label">{t('lab.try')}</span>
      {examples.map((example) => (
        <span key={example.kind} className="lab-chip" data-lab-example={example.kind}>
          <button className="lab-chip-insert" title={t('lab.exampleInsertHint')} onClick={() => void executeCommand('quick.insertCode', { code: example.code })} data-testid={`lab-example-${example.kind}`}>
            {t(`lab.ex.${example.kind}` as MessageKey)}
          </button>
          <button className="lab-chip-run" title={t('lab.exampleRunHint')} aria-label={t('lab.exampleRunHint')} onClick={() => void executeCommand('quick.insertCode', { code: example.code, run: true })} data-testid={`lab-example-run-${example.kind}`}>
            <Play size={10} fill="currentColor" />
          </button>
        </span>
      ))}
      <span style={{ flex: 1 }} />
      <button className="btn ghost lab-strip-btn" title={t('lab.guideHint')} onClick={() => void executeCommand('lab.guide')} data-testid="lab-guide">
        <Compass size={13} /> {t('lab.guide')}
      </button>
      <button className="btn ghost lab-strip-btn" title={t('lab.manualHint')} onClick={() => void executeCommand('lab.manual')} data-testid="lab-manual">
        <BookOpen size={13} /> {t('lab.manual')}
      </button>
    </div>
  )
}
