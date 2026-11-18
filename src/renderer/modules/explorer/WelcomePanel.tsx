// Pannello «Inizio» al centro della griglia: cosa fare con il progetto aperto quando nessun file lo è ancora —
// aprire un file, eseguire, gli strumenti visuali. La schermata di benvenuto vera è StartScreen (a tutta finestra).
import { Database, FileCode2, Home, PenTool, Play, Puzzle, Workflow } from 'lucide-react'
import { executeCommand } from '../../workbench/commands'
import { useWorkbench } from '../../workbench/store'
import { t } from '../../i18n'

export function WelcomePanel() {
  const project = useWorkbench((s) => s.project)
  return (
    <div className="panel project-home" data-testid="project-home">
      <div className="project-home-inner">
        {project ? (
          <>
            <h2>{t('projectHome.title', { name: project.name })}</h2>
            <p className="hint">{t('projectHome.hint')}</p>
            <div className="welcome-actions">
              <button className="btn primary" onClick={() => executeCommand('run.project')} data-testid="project-home-run">
                <Play size={14} fill="currentColor" /> {t('toolbar.run')} <kbd>F5</kbd>
              </button>
              <button className="btn" onClick={() => executeCommand('workbench.quickOpen')}>
                <FileCode2 size={15} /> {t('projectHome.openFile')} <kbd>Ctrl+P</kbd>
              </button>
            </div>
            <h3>{t('welcome.visual')}</h3>
            <div className="welcome-actions">
              <button className="btn" onClick={() => executeCommand('designer.open')} data-testid="welcome-designer">
                <PenTool size={15} /> {t('toolbar.designer')}
              </button>
              <button className="btn" onClick={() => executeCommand('visual.newBlocks')} data-testid="welcome-blocks">
                <Puzzle size={15} /> {t('visual.newBlocks')}
              </button>
              <button className="btn" onClick={() => executeCommand('visual.newNodes')} data-testid="welcome-nodes">
                <Workflow size={15} /> {t('visual.newNodes')}
              </button>
              <button className="btn" onClick={() => executeCommand('sql.show')} data-testid="welcome-database">
                <Database size={15} /> {t('toolbar.database')}
              </button>
            </div>
          </>
        ) : (
          <p className="hint">{t('projectHome.noProject')}</p>
        )}
        <button className="link-btn project-home-start" onClick={() => executeCommand('workbench.welcome')}>
          <Home size={13} /> {t('cmd.welcome')}
        </button>
      </div>
    </div>
  )
}
