// Motore dei percorsi guidati (Fase 10): riquadro evidenziato sull'elemento del passo (`[data-testid=…]`), freccia e
// nuvoletta con titolo, testo, «Passo 2 di 6», Indietro/Avanti/Esci. La logica dei passi è pura
// (src/shared/guide/tour.ts); qui si osservano il DOM (a giri di 200 ms), i comandi eseguiti e gli eventi del workbench.
// Il velo non blocca i clic (pointer-events: none): l'utente fa l'azione vera e il passo va avanti da solo. Se si apre
// un dialogo e il bersaglio non c'è dentro, il velo sparisce e la nuvoletta si sposta in un angolo.
// Esc esce, Invio va avanti (se il fuoco non è in un campo). I percorsi si registrano nel modulo `guide`.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { create } from 'zustand'
import { ArrowLeft, ArrowRight, Compass, Hand, X } from 'lucide-react'
import { applySignal, bubblePlacement, currentStep, exitTour, nextStep, previousStep, startTour, stepProgress, type TourDefinition, type TourSignal, type TourState } from '@shared/guide/tour'
import { executeCommand, onCommandExecuted } from '../workbench/commands'
import { onAnyEvent } from '../workbench/events'
import { t } from '../i18n'
import './tour.css'

interface TourStore {
  tour: TourDefinition | null
  state: TourState | null
  /** Chiamata una volta a fine percorso (finito o interrotto). */
  onEnd: ((state: TourState) => void) | null
}

export const useTour = create<TourStore>(() => ({ tour: null, state: null, onEnd: null }))

/** Avvia un percorso (quello in corso si interrompe). */
export function runTour(tour: TourDefinition, onEnd?: (state: TourState) => void): void {
  const current = useTour.getState()
  if (current.tour && current.state?.status === 'running') finish(exitTour(current.state))
  installListeners()
  useTour.setState({ tour, state: startTour(tour, Date.now()), onEnd: onEnd ?? null })
}

export function stopTour(): void {
  const { state } = useTour.getState()
  if (state) finish(exitTour(state))
}

function finish(state: TourState): void {
  const { onEnd } = useTour.getState()
  useTour.setState({ tour: null, state: null, onEnd: null })
  onEnd?.(state)
}

function setState(next: TourState): void {
  if (next.status !== 'running') finish(next)
  else useTour.setState({ state: next })
}

function signal(sig: TourSignal): void {
  const { tour, state } = useTour.getState()
  if (!tour || !state || state.status !== 'running') return
  const outcome = applySignal(tour, state, sig)
  if (outcome.open) void executeCommand(outcome.open.command, outcome.open.args)
  if (outcome.state !== state) setState(outcome.state)
}

let listening = false
function installListeners(): void {
  if (listening) return
  listening = true
  onCommandExecuted((command, _args, result) => signal({ kind: 'command', command, result }))
  onAnyEvent((event, payload) => signal({ kind: 'event', event, payload }))
}

/** Il primo elemento visibile per il selettore (dockview tiene nel DOM anche schede nascoste). */
export function findVisible(selector: string): HTMLElement | null {
  let nodes: NodeListOf<HTMLElement>
  try {
    nodes = document.querySelectorAll<HTMLElement>(selector)
  } catch {
    return null
  }
  for (const node of nodes) {
    const box = node.getBoundingClientRect()
    if (box.width > 0 && box.height > 0 && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden') return node
  }
  return null
}

const present = (selector: string) => findVisible(selector) !== null

/** Un dialogo modale è aperto (e il bersaglio non c'è dentro). */
function modalOpen(): HTMLElement | null {
  const overlays = document.querySelectorAll<HTMLElement>('.overlay')
  return overlays.length ? overlays[overlays.length - 1]! : null
}

function typingIn(element: Element | null): boolean {
  if (!element) return false
  const el = element as HTMLElement
  return el.isContentEditable || !!el.closest('input, textarea, select, .monaco-editor, .data-grid, .xterm')
}

const BUBBLE_WIDTH = 340

interface Box {
  x: number
  y: number
  width: number
  height: number
}

export function TourHost() {
  const tour = useTour((s) => s.tour)
  const state = useTour((s) => s.state)
  const [box, setBox] = useState<Box | null>(null)
  const [covered, setCovered] = useState(false)
  const bubble = useRef<HTMLDivElement>(null)
  const [bubbleHeight, setBubbleHeight] = useState(180)
  const scrolledFor = useRef<string | null>(null)
  const step = tour && state ? currentStep(tour, state) : null
  const running = !!step

  // Un percorso nuovo riporta in vista ogni bersaglio (gli id dei passi si ripetono fra i percorsi).
  useEffect(() => {
    scrolledFor.current = null
  }, [tour])

  // Giro di controllo: avanza se il passo è compiuto, apre il pannello giusto, misura il bersaglio.
  useEffect(() => {
    if (!running) return
    const tick = () => {
      signal({ kind: 'poll', now: Date.now(), present })
      const current = useTour.getState()
      const live = current.tour && current.state ? currentStep(current.tour, current.state) : null
      const target = live?.target ? findVisible(live.target) : null
      const modal = modalOpen()
      // Un dialogo aperto senza il bersaglio dentro: niente velo, la nuvoletta va in un angolo.
      const covered = !!modal && (!target || !modal.contains(target))
      setCovered(covered)
      if (!target || covered) {
        setBox(null)
        return
      }
      if (live && scrolledFor.current !== live.id) {
        scrolledFor.current = live.id
        target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      }
      const r = target.getBoundingClientRect()
      setBox((old) => (old && old.x === r.x && old.y === r.y && old.width === r.width && old.height === r.height ? old : { x: r.x, y: r.y, width: r.width, height: r.height }))
    }
    tick()
    const timer = setInterval(tick, 200)
    return () => clearInterval(timer)
  }, [running, state?.index])

  useEffect(() => {
    if (bubble.current) setBubbleHeight(bubble.current.offsetHeight)
  })

  // Tastiera: Esc esce, Invio va avanti (mai mentre si scrive o con un dialogo aperto: lì valgono i loro tasti).
  useEffect(() => {
    if (!running) return
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || modalOpen()) return
      const active = document.activeElement
      const inBubble = !!bubble.current && !!active && bubble.current.contains(active)
      if (!inBubble && typingIn(active)) return
      const live = useTour.getState()
      if (!live.state) return
      if (event.key === 'Escape') {
        event.preventDefault()
        finish(exitTour(live.state))
      } else if (event.key === 'Enter' && (inBubble || !active || active === document.body)) {
        if (inBubble && active instanceof HTMLButtonElement) return
        event.preventDefault()
        setState(nextStep(live.state, Date.now()))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running])

  if (!tour || !state || !step) return null
  const { n, total } = stepProgress(state)
  const last = state.index === total - 1
  const waiting = !!step.wait
  const viewport = { width: window.innerWidth, height: window.innerHeight }
  const pad = 6
  const hole = box && !covered ? { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 } : null
  // In un angolo: dialogo aperto, passo «di lavoro» (dock) o bersaglio che non c'è (ancora): mai sopra al lavoro.
  const docked = covered || !!step.dock || (!!step.target && !hole)

  let style: CSSProperties
  let side: 'top' | 'bottom' | 'left' | 'right' | null = null
  if (docked) style = { left: 16, bottom: 40, width: BUBBLE_WIDTH }
  else if (!hole) style = { left: Math.max(16, (viewport.width - BUBBLE_WIDTH) / 2), top: Math.max(16, viewport.height * 0.28), width: BUBBLE_WIDTH }
  else {
    side = bubblePlacement(hole, viewport, { width: BUBBLE_WIDTH, height: bubbleHeight }, step.placement)
    const clampX = (x: number) => Math.min(Math.max(12, x), viewport.width - BUBBLE_WIDTH - 12)
    const clampY = (y: number) => Math.min(Math.max(12, y), viewport.height - bubbleHeight - 12)
    if (side === 'bottom') style = { left: clampX(hole.x + hole.width / 2 - BUBBLE_WIDTH / 2), top: hole.y + hole.height + 12 }
    else if (side === 'top') style = { left: clampX(hole.x + hole.width / 2 - BUBBLE_WIDTH / 2), top: hole.y - bubbleHeight - 12 }
    else if (side === 'right') style = { left: hole.x + hole.width + 12, top: clampY(hole.y + hole.height / 2 - bubbleHeight / 2) }
    else style = { left: hole.x - BUBBLE_WIDTH - 12, top: clampY(hole.y + hole.height / 2 - bubbleHeight / 2) }
    style.width = BUBBLE_WIDTH
  }
  // La freccia punta al centro del bersaglio, lungo il lato della nuvoletta che lo guarda.
  let arrow: CSSProperties | null = null
  if (hole && side && typeof style.left === 'number' && typeof style.top === 'number') {
    const cx = hole.x + hole.width / 2 - style.left
    const cy = hole.y + hole.height / 2 - style.top
    const within = (v: number, max: number) => Math.min(Math.max(18, v), max - 18)
    if (side === 'bottom') arrow = { top: -7, left: within(cx, BUBBLE_WIDTH) - 6 }
    else if (side === 'top') arrow = { bottom: -7, left: within(cx, BUBBLE_WIDTH) - 6 }
    else if (side === 'right') arrow = { left: -7, top: within(cy, bubbleHeight) - 6 }
    else arrow = { right: -7, top: within(cy, bubbleHeight) - 6 }
  }

  return (
    <div className="tour-layer" data-testid="tour" data-tour={tour.id}>
      {hole ? (
        <div className="tour-spot" style={{ left: hole.x, top: hole.y, width: hole.width, height: hole.height }} data-testid="tour-spot" />
      ) : (
        !docked && <div className="tour-veil" />
      )}
      <div ref={bubble} className={`tour-bubble${docked ? ' docked' : ''}`} style={style} role="dialog" aria-label={step.title} data-testid="tour-bubble" data-step={step.id} data-waiting={waiting ? 'true' : 'false'}>
        {arrow && <span className={`tour-arrow ${side}`} style={arrow} />}
        <header>
          <Compass size={14} />
          <span className="tour-title">{step.title}</span>
          <button className="icon-btn" title={`${t('tour.exit')} (Esc)`} aria-label={t('tour.exit')} onClick={() => finish(exitTour(state))} data-testid="tour-exit">
            <X size={14} />
          </button>
        </header>
        <p className="tour-text">{step.text}</p>
        {state.missing && (
          <p className="tour-missing" data-testid="tour-missing">
            {t('tour.missing')}
          </p>
        )}
        {waiting && !state.missing && (
          <p className="tour-waiting">
            <Hand size={13} /> {t('tour.waiting')}
          </p>
        )}
        {step.action && (
          <button className="btn" onClick={() => void executeCommand(step.action!.command, step.action!.args)} data-testid="tour-action">
            {step.action.label}
          </button>
        )}
        <footer>
          <span className="tour-progress" data-testid="tour-progress">
            {t('tour.progress', { n, total })}
          </span>
          <span style={{ flex: 1 }} />
          {state.index > 0 && (
            <button className="btn ghost" onClick={() => setState(previousStep(state, Date.now()))} data-testid="tour-back">
              <ArrowLeft size={13} /> {t('tour.back')}
            </button>
          )}
          <button className={`btn${waiting && !state.missing ? '' : ' primary'}`} onClick={() => setState(nextStep(state, Date.now()))} data-testid="tour-next">
            {last ? t('tour.finish') : waiting && !state.missing ? t('tour.skip') : t('tour.next')} {!last && <ArrowRight size={13} />}
          </button>
        </footer>
      </div>
    </div>
  )
}
