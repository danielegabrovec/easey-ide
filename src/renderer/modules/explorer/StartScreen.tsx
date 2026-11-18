// Schermata iniziale di Easey IDE (disegno comune approvato dal titolare: docs/SCHERMATA-INIZIALE.md di Easey DB).
// A tutta finestra (workbench/start.ts la mostra senza progetto o col logo): chi sono e cosa faccio, l'idea dell'app
// disegnata con contenuto vero (codice a sinistra, la pagina che funziona a destra), tre strade, «Oppure», i progetti
// recenti con le date in parole, «Impara» (schede dei moduli Manuale e Guide nello spazio welcome.learn), i modelli.
import { useEffect, useState } from 'react'
import { FilePlus2, FolderOpen, GraduationCap, X } from 'lucide-react'
import type { AppInfo } from '@shared/contracts/settings'
import type { ProjectTemplate } from '@shared/contracts/workspace'
import { relativeWhen } from '@shared/start-kit/when'
import { ide } from '../../ipc'
import { useAi } from '../../services/ai-client'
import { executeCommand } from '../../workbench/commands'
import { Slot } from '../../workbench/slots'
import { hideStart } from '../../workbench/start'
import { useWorkbench } from '../../workbench/store'
import { t } from '../../i18n'
import { forgetRecent, openRecent } from './project'
import logo from '../../assets/logo.svg'
import './start.css'

/** Colori dei modelli (sempre dai token del tema). */
const TEMPLATE_COLORS = ['var(--accent)', 'var(--page)', 'var(--info)', 'var(--warning)', 'var(--code)', 'var(--text-faint)']

function AiChip() {
  const status = useAi((s) => s.status)
  const enabled = useWorkbench((s) => s.settings.ai.enabled)
  const ready = enabled && !!status?.available && status.models.length > 0
  return (
    <button className={`start-ai${ready ? ' ready' : ''}`} onClick={() => void executeCommand('workbench.settings')} title={t('start.aiHint')} data-testid="start-ai">
      <i /> {ready ? t('start.aiReady') : t('start.aiMissing')}
    </button>
  )
}

/** L'idea dell'app: questo codice (vero) e la pagina che produce, collegati. */
function Illustration() {
  return (
    <div className="start-views" aria-hidden="true">
      <div className="start-view start-code">
        <div className="cap">
          <b /> index.html
        </div>
        <pre>
          <span className="tg">&lt;h1&gt;</span>Ciao, Ada!<span className="tg">&lt;/h1&gt;</span>
          {'\n'}
          <span className="tg">&lt;button </span>
          <span className="at">id</span>=<span className="st">"conta"</span>
          <span className="tg">&gt;</span>Cliccami<span className="tg">&lt;/button&gt;</span>
          {'\n'}
          <span className="tg">&lt;p&gt;</span>Clic: <span className="tg">&lt;b </span>
          <span className="at">id</span>=<span className="st">"n"</span>
          <span className="tg">&gt;</span>0<span className="tg">&lt;/b&gt;&lt;/p&gt;</span>
          {'\n'}
          <span className="tg">&lt;script&gt;</span>
          {'\n'}
          {'  '}
          <span className="kw">let</span> clic = <span className="nu">0</span>
          {'\n'}
          {'  '}conta.onclick = () =&gt;
          {'\n'}
          {'    '}n.textContent = ++clic
          {'\n'}
          <span className="tg">&lt;/script&gt;</span>
        </pre>
      </div>
      <div className="start-view start-page">
        <div className="cap">
          <span className="dots">
            <i />
            <i />
            <i />
          </span>
          <span className="url">index.html</span>
        </div>
        <div className="body">
          <strong>Ciao, Ada!</strong>
          <span className="fake-btn">Cliccami</span>
          <span className="count">
            Clic: <b>3</b>
          </span>
        </div>
      </div>
      <span className="start-run">{t('start.runPill')}</span>
      <svg viewBox="0 0 560 250">
        <path d="M 296 125 C 318 125, 362 125, 384 125" fill="none" stroke="var(--code)" strokeWidth="1.5" strokeDasharray="4 4" />
      </svg>
    </div>
  )
}

function Roads() {
  return (
    <>
      <section className="start-roads">
        <button className="start-road main" onClick={() => void executeCommand('workspace.newProject')} data-testid="welcome-new-project">
          <span className="ic a">
            <FilePlus2 size={22} />
          </span>
          <strong>{t('welcome.newProject')}</strong>
          <span className="t">{t('start.newProjectText')}</span>
        </button>
        <button className="start-road" onClick={() => void executeCommand('workspace.openFolder')} data-testid="welcome-open-folder">
          <span className="ic b">
            <FolderOpen size={22} />
          </span>
          <strong>{t('welcome.openFolder')}</strong>
          <span className="t">{t('start.openFolderText')}</span>
        </button>
        <button className="start-road" onClick={() => void executeCommand('learn.show')} data-testid="welcome-courses">
          <span className="ic c">
            <GraduationCap size={22} />
          </span>
          <strong>{t('start.coursesTitle')}</strong>
          <span className="t">{t('start.coursesText')}</span>
        </button>
      </section>
      <div className="start-more">
        <span>{t('start.or')}</span>
        <button className="link-btn" onClick={() => void executeCommand('quick.open')} data-testid="welcome-quick" title={t('welcome.quickHint')}>
          {t('welcome.quick')}
          <kbd>Ctrl+Shift+Q</kbd>
        </button>
        <button className="link-btn" onClick={() => void executeCommand('layout.lab')} data-testid="welcome-lab">
          {t('start.lab')}
        </button>
        <button className="link-btn" onClick={() => void executeCommand('guide.tours')} data-testid="welcome-tours">
          {t('start.tours')}
        </button>
        <button className="link-btn" onClick={() => void executeCommand('workbench.commandPalette')} data-testid="welcome-palette">
          {t('start.palette')}
          <kbd>Ctrl+Shift+P</kbd>
        </button>
      </div>
    </>
  )
}

function Recent() {
  const recent = useWorkbench((s) => s.settings.recent)
  const project = useWorkbench((s) => s.project)
  const lang = useWorkbench((s) => (s.settings.language === 'en' ? 'en' : 'it'))
  const now = Date.now()
  return (
    <div>
      <h2>{t('start.recentTitle')}</h2>
      {recent.length === 0 ? (
        <p className="start-empty" data-testid="start-recent-empty">
          {t('start.recentEmpty')}
        </p>
      ) : (
        <ul className="start-recent">
          {recent.slice(0, 6).map((item, index) => {
            const current = project?.root === item.root
            return (
              <li key={item.root} className={index === 0 ? 'first' : undefined} data-recent={item.name}>
                <button className="start-recent-open" onClick={() => (current ? hideStart() : void openRecent(item.root))} title={item.root}>
                  <span className="tile">{item.name.slice(0, 2).toUpperCase()}</span>
                  <span className="text">
                    <span className="name">{item.name}</span>
                    <span className="path">{item.root}</span>
                  </span>
                  <span className="when">{current ? t('start.openNow') : relativeWhen(item.at, now, lang)}</span>
                  {index === 0 && <span className="btn primary start-open">{current ? t('start.backShort') : t('start.open')}</span>}
                </button>
                <button className="icon-btn recent-forget" onClick={() => void forgetRecent(item.root)} title={t('welcome.removeRecent')} aria-label={t('welcome.removeRecentNamed', { name: item.name })} data-testid="recent-forget">
                  <X size={14} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {/* «Cosa fare adesso» col progetto aperto (senza progetto lo dicono già le tre strade). */}
      {project && <Slot name="welcome.column" />}
    </div>
  )
}

function Learn({ version }: { version: string }) {
  return (
    <div>
      <h2>{t('start.learnTitle')}</h2>
      <div className="start-learn">
        <Slot name="welcome.learn" />
        <button className="start-card" onClick={() => void executeCommand('workbench.about')} data-testid="start-news">
          <strong>{t('start.newsTitle', { version: version.split('.').slice(0, 2).join('.') })}</strong>
          <span>{t('start.newsText')}</span>
        </button>
      </div>
    </div>
  )
}

function Templates() {
  const [templates, setTemplates] = useState<ProjectTemplate[]>([])
  useEffect(() => {
    void ide.invoke('workspace:templates').then(setTemplates).catch(() => setTemplates([]))
  }, [])
  if (!templates.length) return null
  return (
    <section className="start-models">
      <h2>{t('start.modelsTitle')}</h2>
      <div className="start-model-row">
        {templates.slice(0, 6).map((template, index) => (
          <button key={template.id} className="start-model" onClick={() => void executeCommand('workspace.newProject', { templateId: template.id })} title={template.description} data-testid={`start-template-${template.id}`}>
            <span className="sw" style={{ background: TEMPLATE_COLORS[index % TEMPLATE_COLORS.length] }} />
            <strong>{template.title}</strong>
            <span>{template.description}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

export function StartScreen() {
  const project = useWorkbench((s) => s.project)
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => {
    void ide.invoke('app:info').then(setInfo).catch(() => setInfo(null))
  }, [])
  const version = info?.version ?? ''
  return (
    <main className="start welcome" data-testid="start-screen">
      <div className="start-desk">
        {project && (
          <button className="btn start-back" onClick={() => hideStart()} title={t('start.backHint')} data-testid="start-back">
            {t('start.back', { name: project.name })}
          </button>
        )}
        <section className="start-hero">
          <div>
            <div className="start-who">
              <img src={logo} alt="" width={30} height={30} />
              <strong>Easey IDE</strong>
              {version && <span>{t('start.version', { version })}</span>}
              <AiChip />
            </div>
            <h1>{t('start.title')}</h1>
            <p>{t('start.lead')}</p>
          </div>
          <Illustration />
        </section>
        <Roads />
        <section className="start-cols">
          <Recent />
          <Learn version={version} />
        </section>
        <Templates />
        <footer className="start-foot">
          <span>{t('start.footShortcuts')}</span>
        </footer>
      </div>
    </main>
  )
}
