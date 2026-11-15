// Modulo Laboratorio (1.6, come il Laboratorio SQL di Easey DB): la disposizione didattica intorno alla Scrittura
// rapida. Qui: la striscia degli esempi (spazio «quick.top»), il pannello «Esecuzioni» con la cronologia e i
// pulsanti Guida/Manuale. La griglia la costruisce workbench/presets.ts (comandi layout.lab / layout.standard).
import { registerCommand, executeCommand } from '../../workbench/commands'
import { registerPanel } from '../../workbench/layout'
import { toggleLabPanel } from '../../workbench/presets'
import { registerSlot } from '../../workbench/slots'
import { t } from '../../i18n'
import { HistoryPanel } from './HistoryPanel'
import { installHistoryRecorder } from './history-store'
import { LabStrip } from './LabStrip'
import './lab.css'

export function activateLab(): void {
  registerPanel('lab-history', HistoryPanel)
  registerSlot('quick.top', 'lab-strip', LabStrip)
  installHistoryRecorder()
  const category = t('category.view')
  // «Guida» = come si usa l'app (pannello Guida); «Manuale» = imparare il linguaggio (corsi). Un secondo clic chiude.
  registerCommand({ id: 'lab.guide', title: t('lab.guide'), category, palette: false, run: () => toggleLabPanel('guide-home', () => executeCommand('guide.show')) })
  registerCommand({ id: 'lab.manual', title: t('lab.manual'), category, palette: false, run: () => toggleLabPanel('learn', () => executeCommand('learn.show')) })
}
