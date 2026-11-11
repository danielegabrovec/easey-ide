// Voci della console dell'anteprima web.
import { create } from 'zustand'
import type { ConsoleLevel, PreviewMessage, SerializedValue, SourceLocation } from '@shared/contracts/runner'
import { PREVIEW_SCHEME } from '@shared/contracts/runner'
import { firstProjectFrame } from '@shared/stack'
import { ide } from '../../ipc'
import { emit } from '../../workbench/events'
import { chordOf, runChord } from '../../workbench/commands'

export type EntryKind = ConsoleLevel | 'table' | 'result' | 'input' | 'system'

export interface ConsoleEntry {
  id: number
  kind: EntryKind
  args: SerializedValue[]
  location?: SourceLocation
  /** Messaggi identici consecutivi vengono raggruppati. */
  repeat: number
  group: number
  stack?: string
}

interface ConsoleState {
  entries: ConsoleEntry[]
  add: (entry: Omit<ConsoleEntry, 'id' | 'repeat'>) => number
  setLocation: (id: number, location: SourceLocation) => void
  clear: () => void
}

const MAX_ENTRIES = 1000
let nextId = 1

function sameEntry(a: ConsoleEntry, b: Omit<ConsoleEntry, 'id' | 'repeat'>): boolean {
  return a.kind === b.kind && a.group === b.group && JSON.stringify(a.args) === JSON.stringify(b.args) && a.location?.line === b.location?.line
}

export const useConsole = create<ConsoleState>((set, get) => ({
  entries: [],
  add: (entry) => {
    const entries = get().entries
    const last = entries[entries.length - 1]
    if (last && !entry.location && sameEntry(last, entry)) {
      set({ entries: [...entries.slice(0, -1), { ...last, repeat: last.repeat + 1 }] })
      return last.id
    }
    const id = nextId++
    set({ entries: [...entries.slice(-(MAX_ENTRIES - 1)), { ...entry, id, repeat: 1 }] })
    return id
  },
  setLocation: (id, location) => set({ entries: get().entries.map((e) => (e.id === id ? { ...e, location } : e)) }),
  clear: () => set({ entries: [] })
}))

const str = (v: string): SerializedValue => ({ t: 'string', v })

async function resolveLocation(id: number, url?: string, line?: number, column?: number): Promise<void> {
  if (!url || !line) return
  try {
    const location = await ide.invoke('preview:mapLocation', url, line, column ?? 1)
    if (location) useConsole.getState().setLocation(id, location)
  } catch {
    /* posizione non disponibile */
  }
}

/** Traduce un messaggio del ponte in una voce di console. */
export function handlePreviewMessage(message: PreviewMessage): void {
  const store = useConsole.getState()
  switch (message.kind) {
    case 'ready':
      return
    case 'key':
      runChord(chordOf({ key: message.key, code: message.code, ctrlKey: message.ctrl, altKey: message.alt, shiftKey: message.shift }))
      return
    case 'step':
      if (typeof message.id === 'string') emit('preview:step', { id: message.id })
      return
    case 'clear':
      store.clear()
      store.add({ kind: 'system', args: [str('Console pulita da console.clear()')], group: 0 })
      return
    case 'console': {
      if (message.result) {
        store.add({ kind: 'result', args: message.args, group: 0 })
        return
      }
      const id = store.add({ kind: message.level, args: message.args, group: message.group ?? 0 })
      void resolveLocation(id, message.url, message.line, message.column)
      return
    }
    case 'table': {
      const id = store.add({ kind: 'table', args: [message.rows], group: 0 })
      void resolveLocation(id, message.url, message.line, message.column)
      return
    }
    case 'compile-error':
      store.add({
        kind: 'error',
        args: [str(`Errore di compilazione: ${message.message}`)],
        location: { path: message.path, line: message.line, column: message.column },
        group: 0
      })
      return
    case 'error': {
      const text = /^Uncaught\b/.test(message.message) ? message.message : `Uncaught ${message.message}`
      const id = store.add({ kind: 'error', args: [str(text)], group: 0, stack: message.stack })
      const frame = message.stack ? firstProjectFrame(message.stack, PREVIEW_SCHEME) : null
      if (frame) void resolveLocation(id, frame.url, frame.line, frame.column)
      else void resolveLocation(id, message.url, message.line, message.column)
      return
    }
  }
}

export function isPreviewMessage(data: unknown): data is PreviewMessage {
  return typeof data === 'object' && data !== null && (data as { __ide?: unknown }).__ide === 1 && typeof (data as { kind?: unknown }).kind === 'string'
}
