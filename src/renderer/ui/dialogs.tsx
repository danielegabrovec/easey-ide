// Dialoghi modali: prompt, conferma e dialoghi personalizzati, aperti con una promessa.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { create } from 'zustand'
import { t } from '../i18n'

type Render = (close: () => void) => ReactNode

interface DialogState {
  stack: { id: number; render: Render }[]
  open: (render: Render) => number
  close: (id: number) => void
}

let nextId = 1

const useDialogs = create<DialogState>((set) => ({
  stack: [],
  open: (render) => {
    const id = nextId++
    set((state) => ({ stack: [...state.stack, { id, render }] }))
    return id
  },
  close: (id) => set((state) => ({ stack: state.stack.filter((d) => d.id !== id) }))
}))

export function openDialog(render: Render): void {
  const { open, close } = useDialogs.getState()
  const id = open(() => render(() => close(id)))
}

export function DialogHost() {
  const stack = useDialogs((s) => s.stack)
  return (
    <>
      {stack.map((dialog) => (
        <div key={dialog.id}>{dialog.render(() => useDialogs.getState().close(dialog.id))}</div>
      ))}
    </>
  )
}

/** Dialoghi aperti, dal più vecchio al più recente: Esc e Tab valgono solo per quello in cima. */
const modalStack: number[] = []
let nextModalId = 1

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement)
}

export function Modal({ title, children, footer, onClose, wide }: { title: string; children: ReactNode; footer?: ReactNode; onClose: () => void; wide?: boolean }) {
  const dialog = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // Accessibilità: il fuoco entra nel dialogo, Tab gira al suo interno, alla chiusura torna dov'era.
  useEffect(() => {
    const id = nextModalId++
    modalStack.push(id)
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = dialog.current
    if (root && !root.contains(document.activeElement)) {
      const content = root.querySelector<HTMLElement>('.content')
      const first = (content && focusables(content)[0]) ?? focusables(root)[0]
      ;(first ?? root).focus()
    }
    const onKey = (event: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== id || !root) return
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeRef.current()
      } else if (event.key === 'Tab') {
        const items = focusables(root)
        if (items.length === 0) return
        const active = document.activeElement
        const first = items[0]!
        const last = items[items.length - 1]!
        if (!root.contains(active) || (event.shiftKey && active === first) || (!event.shiftKey && active === last)) {
          event.preventDefault()
          ;(event.shiftKey ? last : first).focus()
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      modalStack.splice(modalStack.indexOf(id), 1)
      // Si torna all'elemento di prima solo se il fuoco era rimasto nel dialogo (non se l'azione lo ha già spostato).
      // Dopo l'evento in corso: un Invio che ha confermato il dialogo non deve «premere» anche il pulsante
      // che lo aveva aperto (il keypress arriva all'elemento che ha il fuoco in quel momento).
      setTimeout(() => {
        const active = document.activeElement
        if (previous?.isConnected && (!active || active === document.body || root?.contains(active))) previous.focus()
      }, 0)
    }
  }, [])

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialog} className={`dialog${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header id={titleId}>{title}</header>
        <div className="content">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  )
}

interface PromptOptions {
  title: string
  label: string
  value?: string
  okLabel?: string
  /** Restituisce un messaggio d'errore, o null se il valore va bene. */
  validate?: (value: string) => string | null
  /** Seleziona solo il nome, non l'estensione. */
  selectStem?: boolean
}

function PromptDialog({ options, done }: { options: PromptOptions; done: (value: string | null) => void }) {
  const [value, setValue] = useState(options.value ?? '')
  const input = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const error = options.validate?.(value) ?? null
  useEffect(() => {
    const el = input.current
    if (!el) return
    el.focus()
    const dot = options.selectStem ? (options.value ?? '').lastIndexOf('.') : -1
    el.setSelectionRange(0, dot > 0 ? dot : el.value.length)
  }, [options.selectStem, options.value])
  const submit = () => {
    if (!error && value.trim()) done(value.trim())
  }
  return (
    <Modal
      title={options.title}
      onClose={() => done(null)}
      footer={
        <>
          <button className="btn" onClick={() => done(null)}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" disabled={!!error || !value.trim()} onClick={submit}>
            {options.okLabel ?? t('common.ok')}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor={inputId}>{options.label}</label>
        <input id={inputId} ref={input} value={value} aria-invalid={!!(error && value)} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            submit()
          }} spellCheck={false} />
        {error && value && <span className="error-text">{error}</span>}
      </div>
    </Modal>
  )
}

export function prompt(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    openDialog((close) => (
      <PromptDialog
        options={options}
        done={(value) => {
          close()
          resolve(value)
        }}
      />
    ))
  })
}

interface ConfirmOptions {
  title: string
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
}

export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    openDialog((close) => {
      const done = (ok: boolean) => {
        close()
        resolve(ok)
      }
      return (
        <Modal
          title={options.title}
          onClose={() => done(false)}
          footer={
            <>
              <button className="btn" onClick={() => done(false)}>
                {t('common.cancel')}
              </button>
              <button className={`btn ${options.danger ? 'danger' : 'primary'}`} autoFocus onClick={() => done(true)}>
                {options.confirmLabel ?? t('common.ok')}
              </button>
            </>
          }
        >
          <div>{options.message}</div>
        </Modal>
      )
    })
  })
}

interface ChooseOptions<T extends string> {
  title: string
  message: ReactNode
  /** Scelte da destra a sinistra in ordine d'importanza: la prima è quella consigliata (pulsante principale). */
  choices: { value: T; label: string; testId?: string }[]
}

/** Dialogo con più scelte (più «Annulla»): restituisce il valore scelto o null. */
export function choose<T extends string>(options: ChooseOptions<T>): Promise<T | null> {
  return new Promise((resolve) => {
    openDialog((close) => {
      const done = (value: T | null) => {
        close()
        resolve(value)
      }
      return (
        <Modal
          title={options.title}
          onClose={() => done(null)}
          footer={
            <>
              <button className="btn" onClick={() => done(null)}>
                {t('common.cancel')}
              </button>
              {[...options.choices].reverse().map((choice, index, all) => (
                <button key={choice.value} className={`btn${index === all.length - 1 ? ' primary' : ''}`} autoFocus={index === all.length - 1} onClick={() => done(choice.value)} data-testid={choice.testId}>
                  {choice.label}
                </button>
              ))}
            </>
          }
        >
          <div>{options.message}</div>
        </Modal>
      )
    })
  })
}
