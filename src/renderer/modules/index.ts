// UNICO punto in cui i moduli vengono attivati. Un nuovo modulo (SQL Lab, Designer, AI…) si aggiunge qui.
import { activateAiAssist } from './ai-assist'
import { activateDesigner } from './designer'
import { activateDiagrams } from './diagrams'
import { activateEditor } from './editor'
import { activateExplorer } from './explorer'
import { activateGit } from './git'
import { activateLearn } from './learn'
import { activateRunTerminal } from './run-terminal'
import { activateRunWeb } from './run-web'
import { activateSqlLab } from './sql-lab'
import { activateStepRun } from './step-run'
import { activateVisualCode } from './visual-code'

export function activateModules(): void {
  activateEditor()
  activateExplorer()
  activateRunWeb()
  activateRunTerminal()
  activateAiAssist()
  activateSqlLab()
  activateDesigner()
  activateVisualCode()
  activateDiagrams()
  activateLearn()
  activateStepRun()
  activateGit()
}

export { restoreLastProject } from './explorer'
