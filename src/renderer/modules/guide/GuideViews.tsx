// Viste del modulo Guide: invito al primo percorso (Benvenuto), «Cosa fare adesso», elenco «Percorsi guidati»,
// aiuto contestuale (F1) e pannello del Glossario.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { IDockviewPanelProps } from 'dockview'
import { ArrowRight, BookA, CheckCircle2, Circle, Compass, Lightbulb, Play, Search, X } from 'lucide-react'
import type { Hint } from '@shared/guide/hints'
import { isHelpPage, type HelpPage } from '@shared/guide/help'
import { searchGlossary } from '@shared/guide/glossary'
import { executeCommand } from '../../workbench/commands'
import { useWorkbench } from '../../workbench/store'
import { Modal } from '../../ui/dialogs'
import { Markdown } from '../../ui/Markdown'
import { t } from '../../i18n'
import type { MessageKey } from '../../i18n/it'
import { dismissTip, requestRefresh, useGuide } from './guide-store'
import { allTours } from './tours'

export const OFFER_TIP = 'offer-first-tour'

/** Pagine d'aiuto incluse nella build (resources/help/*.md). */
const HELP_TEXTS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob('../../../../resources/help/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>).map(([file, text]) => [
    file.slice(file.lastIndexOf('/') + 1).replace(/\.md$/, ''),
    text
  ])
)

export function helpText(page: HelpPage): string {
  return HELP_TEXTS[page] ?? ''
}

/** Invito al primo percorso (Benvenuto, primo avvio): «Inizia» o «Più tardi». */
export function TourOffer() {
  const visible = useGuide((s) => s.offerVisible)
  if (!visible) return null
  const close = () => {
    useGuide.setState({ offerVisible: false })
    void dismissTip(OFFER_TIP)
  }
  return (
    <div className="tour-offer" data-testid="guide-offer" role="region" aria-label={t('guide.offerTitle')}>
      <Compass size={22} />
      <div className="tour-offer-text">
        <strong>{t('guide.offerTitle')}</strong>
        <span className="hint">{t('guide.offerText')}</span>
      </div>
      <button
        className="btn primary"
        onClick={() => {
          close()
          void executeCommand('guide.start', { id: 'prima-pagina' })
        }}
        data-testid="guide-offer-start"
      >
        <Play size={13} /> {t('guide.offerStart')}
      </button>
      <button className="btn ghost" onClick={close} data-testid="guide-offer-later">
        {t('guide.offerLater')}
      </button>
    </div>
  )
}

function hintText(hint: Hint): string {
  return t(`guide.hint.${hint.kind}` as MessageKey, hint.params)
}

/** «Cosa fare adesso» nel Benvenuto: i suggerimenti (un clic e si fa, ✕ per non vederli più) e i percorsi. */
export function WelcomeNextSteps() {
  const hints = useGuide((s) => s.hints)
  useEffect(() => requestRefresh(50), [])
  return (
    <section className="home-next" data-testid="welcome-next-steps">
      <h2>
        <Lightbulb size={14} /> {t('guide.homeTitle')}
      </h2>
      {hints.length > 0 ? (
        <ul className="home-next-list">
          {hints.map((hint) => (
            <li key={hint.id} className="next-hint" data-hint={hint.kind}>
              <button className="next-hint-run" onClick={() => void executeCommand(hint.command, hint.args)} title={t('guide.hintRun')} data-testid={`next-hint-${hint.kind}`}>
                <span>{hintText(hint)}</span>
                <ArrowRight size={12} />
              </button>
              <button className="icon-btn" title={t('guide.hintDismiss')} aria-label={t('guide.hintDismiss')} onClick={() => void dismissTip(hint.id)} data-testid={`next-hint-dismiss-${hint.kind}`}>
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">{t('guide.homeNothing')}</p>
      )}
      <div className="welcome-actions">
        <button className="btn ghost" onClick={() => void executeCommand('guide.tours')} data-testid="welcome-tours">
          <Compass size={13} /> {t('guide.toursOpen')}
        </button>
        <button className="btn ghost" onClick={() => void executeCommand('guide.glossary')} data-testid="welcome-glossary">
          <BookA size={13} /> {t('glossary.title')}
        </button>
      </div>
    </section>
  )
}

/** «Percorsi guidati» (menu Aiuto): l'elenco con ✓ per quelli finiti. */
export function ToursDialog({ close }: { close: () => void }) {
  const completed = useWorkbench((s) => s.settings.guide.completed)
  const tours = allTours()
  return (
    <Modal
      title={t('guide.toursTitle')}
      onClose={close}
      wide
      footer={
        <button className="btn primary" onClick={close}>
          {t('common.close')}
        </button>
      }
    >
      <p className="hint">{t('guide.toursIntro')}</p>
      <ul className="tour-list" data-testid="tour-list">
        {tours.map((tour) => {
          const done = completed.includes(tour.id)
          return (
            <li key={tour.id} data-tour-item={tour.id} data-done={done ? 'true' : 'false'}>
              {done ? <CheckCircle2 size={18} className="tour-done" aria-label={t('guide.tourDone')} /> : <Circle size={18} className="tour-todo" />}
              <div>
                <strong>{tour.title}</strong>
                <span className="hint">
                  {tour.description} · {t('guide.minutes', { n: tour.minutes })} · {t('guide.steps', { n: tour.steps.length })}
                </span>
              </div>
              <button
                className={`btn${done ? '' : ' primary'}`}
                onClick={() => {
                  close()
                  void executeCommand('guide.start', { id: tour.id })
                }}
                data-testid={`tour-start-${tour.id}`}
              >
                <Play size={13} /> {done ? t('guide.tourAgain') : t('guide.tourStart')}
              </button>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}

/** Aiuto contestuale (F1): la pagina dell'area in cui si sta lavorando. */
export function HelpDialog({ close, page }: { close: () => void; page: HelpPage }) {
  const text = isHelpPage(page) ? helpText(page) : ''
  return (
    <Modal
      title={t('help.title', { area: t(`help.page.${page}` as MessageKey) })}
      onClose={close}
      wide
      footer={
        <>
          <button
            className="btn"
            onClick={() => {
              close()
              void executeCommand('guide.glossary')
            }}
          >
            {t('glossary.title')}
          </button>
          <button
            className="btn"
            onClick={() => {
              close()
              void executeCommand('guide.tours')
            }}
          >
            {t('guide.toursOpen')}
          </button>
          <button className="btn primary" onClick={close}>
            {t('common.close')}
          </button>
        </>
      }
    >
      <div className="help-page" data-testid="help-page" data-page={page}>
        <Markdown source={text} renderCode={({ code }) => <pre>{code}</pre>} />
      </div>
    </Modal>
  )
}

/** Pannello «Glossario»: i termini della programmazione in parole semplici, con la ricerca e un esempio. */
export function GlossaryPanel({ params }: IDockviewPanelProps<{ id?: string; seq?: number }>) {
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const language = useWorkbench((s) => s.settings.language)
  const terms = useMemo(() => searchGlossary(query, language), [query, language])
  const focusId = params?.id

  useEffect(() => {
    if (!focusId) {
      input.current?.focus()
      return
    }
    setQuery('')
    requestAnimationFrame(() => document.querySelector(`[data-glossary-term="${focusId}"]`)?.scrollIntoView({ block: 'center' }))
  }, [focusId, params?.seq])

  return (
    <div className="panel glossary" data-testid="glossary-panel">
      <div className="panel-toolbar">
        <BookA size={14} color="var(--text-muted)" />
        <div className="glossary-search">
          <Search size={13} />
          <input ref={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('glossary.search')} aria-label={t('glossary.search')} spellCheck={false} data-testid="glossary-search" />
        </div>
      </div>
      <div className="glossary-scroll">
        {terms.length === 0 && (
          <p className="hint" data-testid="glossary-empty">
            {t('glossary.none', { query })}
          </p>
        )}
        <dl>
          {terms.map((term) => (
            <div key={term.id} className={`glossary-entry${term.id === focusId ? ' focus' : ''}`} data-glossary-term={term.id}>
              <dt>
                <strong>{term.plain}</strong> <code>{term.term}</code>
              </dt>
              <dd>
                {term.explanation}
                {term.example && (
                  <span className="glossary-example">
                    <em>{t('glossary.example')}</em> <code>{term.example}</code>
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
