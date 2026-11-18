// Modulo Didattica: corsi ed esercizi con verifica automatica, suggerimenti, soluzione sbloccabile,
// tutor AI e importazione dei manuali della Collana "Imparare a programmare".
import { registerCommand } from '../../workbench/commands'
import { registerPanel, showPanel } from '../../workbench/layout'
import { t } from '../../i18n'
import { checkExercise, importCourse } from './actions'
import { LearnPanel } from './LearnPanel'
import { StartManualCard } from './StartManualCard'
import { registerSlot } from '../../workbench/slots'
import { currentExercise, useLearn } from './learn-store'

function showLearn(): void {
  showPanel({ id: 'learn', component: 'learn', title: t('panel.learn'), area: 'right' })
}

export function activateLearn(): void {
  registerPanel('learn', LearnPanel)
  // Schermata iniziale, colonna «Impara»: il corso in corso con l'avanzamento.
  registerSlot('welcome.learn', 'learn-manual', StartManualCard, 0)
  const category = t('category.learn')
  registerCommand({ id: 'learn.show', title: t('cmd.learnShow'), category, keybinding: 'Ctrl+Alt+L', run: () => showLearn() })
  registerCommand({
    id: 'learn.check',
    title: t('cmd.learnCheck'),
    category,
    keybinding: 'F9',
    when: () => useLearn.getState().view === 'esercizio' && currentExercise() !== null,
    run: async () => {
      showLearn()
      await checkExercise()
    }
  })
  registerCommand({
    id: 'learn.importManual',
    title: t('cmd.learnImportManual'),
    category,
    run: async () => {
      showLearn()
      await importCourse('manuale')
    }
  })
  registerCommand({
    id: 'learn.importPack',
    title: t('cmd.learnImportPack'),
    category,
    run: async () => {
      showLearn()
      await importCourse('pacchetto')
    }
  })
}
