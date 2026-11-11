// Dialoghi modali: prompt, conferma e dialoghi personalizzati, aperti con una promessa.
import { useEffect, useRef, useState, type ReactNode } from 'react'
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

export function Modal({ title, children, footer, onClose, wide }: { title: string; children: ReactNode; footer?: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>{title}</header>
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
        <label>{options.label}</label>
        <input ref={input} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} spellCheck={false} />
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
