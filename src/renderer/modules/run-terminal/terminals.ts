// Sessioni di terminale lato interfaccia: istanze xterm, buffer dei dati in arrivo, schede.
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { create } from 'zustand'
import type { CreateTerminalRequest, TerminalKind } from '@shared/contracts/runner'
import { ide } from '../../ipc'
import { workbench } from '../../workbench/store'

export interface SessionView {
  id: string
  title: string
  kind: TerminalKind
  entry?: string
  exitCode: number | null
}

interface TerminalState {
  sessions: SessionView[]
  active: string | null
  add: (session: SessionView) => void
  remove: (id: string) => void
  setActive: (id: string | null) => void
  markExited: (id: string, code: number) => void
}

export const useTerminals = create<TerminalState>((set) => ({
  sessions: [],
  active: null,
  add: (session) => set((state) => ({ sessions: [...state.sessions, session], active: session.id })),
  remove: (id) =>
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== id)
      return { sessions, active: state.active === id ? (sessions[sessions.length - 1]?.id ?? null) : state.active }
    }),
  setActive: (active) => set({ active }),
  markExited: (id, code) => set((state) => ({ sessions: state.sessions.map((s) => (s.id === id ? { ...s, exitCode: code } : s)) }))
}))

interface Instance {
  terminal: Terminal
  fit: FitAddon
  opened: boolean
}

const instances = new Map<string, Instance>()
const pending = new Map<string, string>()

const DARK: ITheme = {
  background: '#12141a',
  foreground: '#e3e6ed',
  cursor: '#8692ff',
  selectionBackground: '#3a4a8a88',
  black: '#1c1f26',
  brightBlack: '#6b7385'
}

const LIGHT: ITheme = {
  background: '#ffffff',
  foreground: '#1d2230',
  cursor: '#4f5bea',
  selectionBackground: '#4f5bea33',
  black: '#1d2230',
  white: '#8a93a6',
  brightWhite: '#566075',
  yellow: '#a8770c',
  brightYellow: '#a8770c'
}

export function themeFor(theme: 'dark' | 'light'): ITheme {
  return theme === 'dark' ? DARK : LIGHT
}

function instanceFor(id: string): Instance {
  let instance = instances.get(id)
  if (instance) return instance
  const settings = workbench().settings
  const terminal = new Terminal({
    fontFamily: "'Cascadia Mono', 'Cascadia Code', Consolas, monospace",
    fontSize: Math.max(11, settings.fontSize - 1),
    cursorBlink: true,
    scrollback: 5000,
    allowProposedApi: false,
    theme: themeFor(settings.theme)
  })
  const fit = new FitAddon()
  terminal.loadAddon(fit)
  terminal.onData((data) => void ide.invoke('terminal:write', id, data))
  terminal.attachCustomKeyEventHandler((event) => {
    // Ctrl+C con testo selezionato = copia; senza selezione = interrompi (passa al processo).
    if (event.type === 'keydown' && event.ctrlKey && event.key.toLowerCase() === 'c' && terminal.hasSelection()) {
      void navigator.clipboard.writeText(terminal.getSelection())
      terminal.clearSelection()
      return false
    }
    return true
  })
  instance = { terminal, fit, opened: false }
  instances.set(id, instance)
  const buffered = pending.get(id)
  if (buffered) {
    terminal.write(buffered)
    pending.delete(id)
  }
  return instance
}

/** Collega l'istanza xterm al suo contenitore (una volta sola) e la adatta alle dimensioni. */
export function mountTerminal(id: string, container: HTMLElement): void {
  const instance = instanceFor(id)
  if (!instance.opened) {
    instance.terminal.open(container)
    instance.opened = true
  }
  fitTerminal(id)
}

export function fitTerminal(id: string): void {
  const instance = instances.get(id)
  if (!instance?.opened) return
  const element = instance.terminal.element?.parentElement
  if (!element || element.clientWidth === 0 || element.clientHeight === 0) return
  try {
    instance.fit.fit()
    void ide.invoke('terminal:resize', id, instance.terminal.cols, instance.terminal.rows)
  } catch {
    /* contenitore non visibile */
  }
}

export function focusTerminal(id: string): void {
  instances.get(id)?.terminal.focus()
}

export function clearTerminal(id: string): void {
  instances.get(id)?.terminal.clear()
}

export function applyTerminalOptions(theme: 'dark' | 'light', fontSize: number): void {
  for (const instance of instances.values()) {
    instance.terminal.options.theme = themeFor(theme)
    instance.terminal.options.fontSize = Math.max(11, fontSize - 1)
  }
}

/** Testo visibile del terminale (usato dai test e2e e, in futuro, dal tutor). */
export function terminalText(id: string): string {
  const instance = instances.get(id)
  if (!instance) return pending.get(id) ?? ''
  const buffer = instance.terminal.buffer.active
  const lines: string[] = []
  for (let i = 0; i < buffer.length; i++) lines.push(buffer.getLine(i)?.translateToString(true) ?? '')
  return lines.join('\n')
}

export function installTerminalListeners(): void {
  ide.on('terminal:data', ({ id, data }) => {
    const instance = instances.get(id)
    if (instance) instance.terminal.write(data)
    else pending.set(id, (pending.get(id) ?? '') + data)
  })
  ide.on('terminal:exit', ({ id, code }) => useTerminals.getState().markExited(id, code))
}

export async function createSession(request: CreateTerminalRequest): Promise<string> {
  const info = await ide.invoke('terminal:create', request)
  const entry = request.kind === 'run' ? request.entry : undefined
  if (entry) {
    // Le esecuzioni precedenti dello stesso file già terminate lasciano il posto alla nuova.
    for (const old of useTerminals.getState().sessions) {
      if (old.entry === entry && old.exitCode !== null) disposeSession(old.id)
    }
  }
  useTerminals.getState().add({ id: info.id, title: info.title, kind: info.kind, entry, exitCode: null })
  instanceFor(info.id)
  return info.id
}

export function disposeSession(id: string): void {
  void ide.invoke('terminal:kill', id)
  instances.get(id)?.terminal.dispose()
  instances.delete(id)
  pending.delete(id)
  useTerminals.getState().remove(id)
}

export function disposeAllSessions(): void {
  for (const session of [...useTerminals.getState().sessions]) disposeSession(session.id)
}
