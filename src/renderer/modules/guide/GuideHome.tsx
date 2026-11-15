// Pannello «Guida» (1.6, come in Easey DB): COME SI USA EASEY IDE — percorsi guidati, aiuto della parte in cui sei
// (F1), tutte le pagine d'aiuto, glossario, scorciatoie, Laboratorio. Per imparare un linguaggio c'è il Manuale
// (modulo learn, comando learn.show): la prima riga lo dice e ci porta, così Guida e Manuale non si confondono.
import { BookOpen, CircleHelp, Compass, FlaskConical, Keyboard, Map as MapIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { HELP_PAGES } from '@shared/guide/help'
import { executeCommand } from '../../workbench/commands'
import { t } from '../../i18n'
import type { MessageKey } from '../../i18n/it'

const CARDS: { command: string; args?: unknown; title: MessageKey; text: MessageKey; icon: ReactNode; testId: string }[] = [
  { command: 'guide.tours', title: 'guideHome.toursTitle', text: 'guideHome.toursText', icon: <Compass size={18} />, testId: 'guide-home-tours' },
  { command: 'guide.help', title: 'guideHome.helpTitle', text: 'guideHome.helpText', icon: <CircleHelp size={18} />, testId: 'guide-home-help' },
  { command: 'guide.glossary', title: 'guideHome.glossaryTitle', text: 'guideHome.glossaryText', icon: <MapIcon size={18} />, testId: 'guide-home-glossary' },
  { command: 'workbench.shortcuts', title: 'guideHome.shortcutsTitle', text: 'guideHome.shortcutsText', icon: <Keyboard size={18} />, testId: 'guide-home-shortcuts' },
  { command: 'layout.lab', title: 'guideHome.labTitle', text: 'guideHome.labText', icon: <FlaskConical size={18} />, testId: 'guide-home-lab' }
]

export function GuideHomePanel() {
  return (
    <div className="panel guide-home" data-testid="guide-home">
      <div className="guide-home-scroll">
        <h2>{t('guideHome.title')}</h2>
        <p className="guide-home-difference" data-testid="guide-home-difference">
          {t('guideHome.difference')}{' '}
          <button className="link-btn" onClick={() => void executeCommand('learn.show')} data-testid="guide-home-manual">
            <BookOpen size={13} /> {t('guideHome.openManual')}
          </button>
          .
        </p>
        <div className="guide-home-cards">
          {CARDS.map((card) => (
            <button key={card.command} className="guide-home-card" onClick={() => void executeCommand(card.command, card.args)} data-testid={card.testId}>
              <span className="guide-home-icon">{card.icon}</span>
              <strong>{t(card.title)}</strong>
              <span className="hint">{t(card.text)}</span>
            </button>
          ))}
        </div>
        <h3>{t('guideHome.pagesTitle')}</h3>
        <ul className="guide-home-pages">
          {HELP_PAGES.map((page) => (
            <li key={page}>
              <button className="link-btn" onClick={() => void executeCommand('guide.help', { page })} data-testid={`guide-home-page-${page}`}>
                {t(`help.page.${page}` as MessageKey)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
