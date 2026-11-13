// Pagina di benvenuto: nuovo progetto, apri cartella, progetti recenti, scorciatoie principali.
import { FolderOpen, Plus, Clock, GraduationCap, X, Zap } from 'lucide-react'
import { executeCommand } from '../../workbench/commands'
import { useWorkbench } from '../../workbench/store'
import { t } from '../../i18n'
import { forgetRecent, openRecent } from './project'
import logo from '../../assets/logo.svg'

export function WelcomePanel() {
  const recent = useWorkbench((s) => s.settings.recent)
  const project = useWorkbench((s) => s.project)
  return (
    <div className="panel welcome">
      <div className="welcome-inner">
        <h1 className="welcome-title">
          <img src={logo} alt="" width={44} height={44} />
          Easey IDE
        </h1>
        <p className="lead">{t('welcome.lead')}</p>
        <div className="welcome-actions">
          <button className="btn primary" onClick={() => executeCommand('workspace.newProject')} data-testid="welcome-new-project">
            <Plus size={15} /> {t('welcome.newProject')}
          </button>
          <button className="btn" onClick={() => executeCommand('workspace.openFolder')}>
            <FolderOpen size={15} /> {t('welcome.openFolder')}
          </button>
          <button className="btn" onClick={() => executeCommand('quick.open')} data-testid="welcome-quick" title={t('welcome.quickHint')}>
            <Zap size={15} /> {t('welcome.quick')}
          </button>
          <button className="btn" onClick={() => executeCommand('learn.show')} data-testid="welcome-courses">
            <GraduationCap size={15} /> {t('welcome.courses')}
          </button>
        </div>
        {recent.length > 0 && (
          <section>
            <h2>
              <Clock size={14} /> {t('welcome.recent')}
            </h2>
            <ul className="recent-list">
              {recent.map((item) => (
                <li key={item.root} data-recent={item.name}>
                  <button className="recent-open" onClick={() => openRecent(item.root)} title={item.root} disabled={project?.root === item.root}>
                    <strong>{item.name}</strong>
                    <span className="hint">{item.root}</span>
                  </button>
                  <button
                    className="icon-btn recent-forget"
                    onClick={() => forgetRecent(item.root)}
                    title={t('welcome.removeRecent')}
                    aria-label={t('welcome.removeRecentNamed', { name: item.name })}
                    data-testid="recent-forget"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <h2>{t('welcome.shortcuts')}</h2>
          <table className="shortcut-table">
            <tbody>
              <tr>
                <td>{t('welcome.kRun')}</td>
                <td>
                  <kbd>F5</kbd>
                </td>
              </tr>
              <tr>
                <td>{t('welcome.kRunTerminal')}</td>
                <td>
                  <kbd>Ctrl+F5</kbd>
                </td>
              </tr>
              <tr>
                <td>{t('welcome.kQuick')}</td>
                <td>
                  <kbd>Ctrl+Shift+Q</kbd>
                </td>
              </tr>
              <tr>
                <td>{t('welcome.kSave')}</td>
                <td>
                  <kbd>Ctrl+S</kbd>
                </td>
              </tr>
              <tr>
                <td>{t('welcome.kPalette')}</td>
                <td>
                  <kbd>Ctrl+Shift+P</kbd>
                </td>
              </tr>
              <tr>
                <td>{t('welcome.kTerminal')}</td>
                <td>
                  <kbd>Ctrl+Shift+`</kbd>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
