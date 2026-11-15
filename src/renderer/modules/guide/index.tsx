// Modulo Guide (come in Easey DB): percorsi guidati con il motore di ui/Tour.tsx, «Cosa fare adesso» nel Benvenuto
// (src/shared/guide/hints.ts), Glossario con la ricerca, aiuto contestuale (F1) con le pagine di resources/help e
// l'invito al primo percorso al primo avvio. Non importa altri moduli: comandi, eventi, selettori e spazi (slots).
// Comandi pubblici: guide.show (pannello Guida), guide.start { id }, guide.tours, guide.glossary { id? }, guide.help { page? } (F1).
// La Guida dice come si usa l'app; per imparare un linguaggio c'è il Manuale (modulo learn): GuideHome lo spiega in cima.
import { helpPageFor, isHelpPage } from '@shared/guide/help'
import { registerCommand } from '../../workbench/commands'
import { dockApi, registerPanel, showPanel } from '../../workbench/layout'
import { notify } from '../../workbench/notifications'
import { registerSlot } from '../../workbench/slots'
import { workbench } from '../../workbench/store'
import { openDialog } from '../../ui/dialogs'
import { runTour } from '../../ui/Tour'
import { t } from '../../i18n'
import { dismissTip, installGuideRefresh, markTourCompleted, useGuide } from './guide-store'
import { GlossaryPanel, HelpDialog, OFFER_TIP, ToursDialog, TourOffer, WelcomeNextSteps } from './GuideViews'
import { GuideHomePanel } from './GuideHome'
import { tourById } from './tours'
import './guide.css'

export const GLOSSARY_PANEL = 'glossary'
/** Il pannello «Guida» (come si usa Easey IDE). */
export const GUIDE_PANEL = 'guide-home'

function startTourById(id: string): boolean {
  const tour = tourById(id)
  if (!tour) {
    notify(t('guide.tourUnknown', { id }), 'warning')
    return false
  }
  useGuide.setState({ offerVisible: false })
  runTour(tour, (end) => {
    if (end.status !== 'done') return
    void markTourCompleted(tour.id)
    notify(t('guide.tourCompleted', { title: tour.title }), 'success')
  })
  return true
}

export function activateGuide(): void {
  registerPanel(GLOSSARY_PANEL, GlossaryPanel)
  registerPanel(GUIDE_PANEL, GuideHomePanel)
  registerSlot('welcome.top', 'guide-offer', TourOffer, 0)
  registerSlot('welcome.column', 'guide-next', WelcomeNextSteps)
  installGuideRefresh()

  const category = t('category.help')
  registerCommand({ id: 'guide.show', title: t('cmd.guideShow'), category, run: () => void showPanel({ id: GUIDE_PANEL, component: GUIDE_PANEL, title: t('guideHome.title'), area: 'center' }) })
  registerCommand({ id: 'guide.tours', title: t('cmd.guideTours'), category, run: () => openDialog((close) => <ToursDialog close={close} />) })
  registerCommand<{ id: string }>({ id: 'guide.start', title: 'guide.start', palette: false, run: (args) => (args?.id ? startTourById(args.id) : false) })
  registerCommand<{ id?: string }>({
    id: 'guide.glossary',
    title: t('cmd.guideGlossary'),
    category,
    run: (args) => {
      const params = { id: args?.id, seq: Date.now() }
      const panel = showPanel({ id: GLOSSARY_PANEL, component: GLOSSARY_PANEL, title: t('glossary.title'), area: 'right', params })
      panel?.api.updateParameters(params)
    }
  })
  registerCommand<{ page?: string }>({
    id: 'guide.help',
    title: t('cmd.guideHelp'),
    category,
    keybinding: 'F1',
    run: (args) => {
      const inAssistant = !!document.activeElement?.closest('[data-testid="side-panel"]')
      const page = isHelpPage(args?.page) ? args.page : helpPageFor(dockApi()?.activePanel?.id, inAssistant)
      openDialog((close) => <HelpDialog close={close} page={page} />)
    }
  })

  // Primo avvio: l'invito al primo percorso, una volta sola (chiuso subito per i prossimi avvii).
  const guide = workbench().settings.guide
  if (!guide.dismissedTips.includes(OFFER_TIP) && !guide.completed.includes('prima-pagina')) {
    useGuide.setState({ offerVisible: true })
    void dismissTip(OFFER_TIP)
  }
}
