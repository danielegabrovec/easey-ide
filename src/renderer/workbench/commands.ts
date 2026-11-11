// Registro dei comandi: UNICA fonte delle azioni dell'IDE (menu, palette, scorciatoie, pulsanti).
import { dockApi } from './layout'
import { notifyError } from './notifications'

export interface Command<A = unknown> {
  id: string
  /** Titolo mostrato nella palette. */
  title: string
  category?: string
  /** Es. "Ctrl+Shift+P", "F5". */
  keybinding?: string
  /** Se false il comando non compare nella palette (es. comandi con argomenti obbligatori). */
  palette?: boolean
  when?: () => boolean
  /**
   * Id del pannello in cui vale la scorciatoia: con quel pannello attivo il comando ha la precedenza
   * su quelli generici con la stessa combinazione (es. Ctrl+S nella Scrittura rapida); altrove la
   * sua scorciatoia non scatta.
   */
  panel?: string
  run: (args?: A) => unknown | Promise<unknown>
}

const registry = new Map<string, Command>()
const changeListeners = new Set<() => void>()

export function registerCommand<A>(command: Command<A>): () => void {
  registry.set(command.id, command as Command)
  changeListeners.forEach((l) => l())
  return () => {
    registry.delete(command.id)
    changeListeners.forEach((l) => l())
  }
}

export function listCommands(): Command[] {
  return [...registry.values()]
}

export function getCommand(id: string): Command | undefined {
  return registry.get(id)
}

export async function executeCommand<A>(id: string, args?: A): Promise<unknown> {
  const command = registry.get(id)
  if (!command) {
    console.warn(`Comando sconosciuto: ${id}`)
    return undefined
  }
  if (command.when && !command.when()) return undefined
  try {
    return await command.run(args)
  } catch (error) {
    notifyError(error)
    return undefined
  }
}

/** Normalizza un evento tastiera nel formato delle keybinding ("Ctrl+Shift+P"). */
export function chordOf(event: { key: string; code: string; ctrlKey: boolean; metaKey?: boolean; altKey: boolean; shiftKey: boolean }): string {
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  let key = event.key
  if (event.code === 'Backquote') key = '`'
  else if (event.code === 'Equal' || key === '+') key = '='
  else if (event.code === 'Minus') key = '-'
  else if (key.length === 1) key = key.toUpperCase()
  parts.push(key)
  return parts.join('+')
}

/** Comando da eseguire per una combinazione: prima quelli del pannello attivo, poi quelli generici. */
export function commandForChord(chord: string): Command | undefined {
  const activePanel = dockApi()?.activePanel?.id
  let generic: Command | undefined
  for (const command of registry.values()) {
    if (command.keybinding !== chord || (command.when && !command.when())) continue
    if (command.panel) {
      if (command.panel === activePanel) return command
    } else generic ??= command
  }
  return generic
}

/** Ascolta la tastiera in fase di cattura (prima di Monaco e xterm). */
export function installKeybindings(): () => void {
  const handler = (event: KeyboardEvent) => {
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return
    const command = commandForChord(chordOf(event))
    if (!command) return
    event.preventDefault()
    event.stopPropagation()
    void executeCommand(command.id)
  }
  window.addEventListener('keydown', handler, true)
  return () => window.removeEventListener('keydown', handler, true)
}

/** Esegue il comando associato a una combinazione (es. arrivata dall'anteprima). Restituisce true se trovato. */
export function runChord(chord: string): boolean {
  const command = commandForChord(chord)
  if (command) void executeCommand(command.id)
  return !!command
}

export function onCommandsChanged(listener: () => void): () => void {
  changeListeners.add(listener)
  return () => changeListeners.delete(listener)
}
