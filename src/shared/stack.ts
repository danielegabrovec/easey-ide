// Estrae la posizione utile da uno stack del browser (Chromium).

export interface StackFrame {
  url: string
  line: number
  column: number
}

const FRAME = /\(?((?:[a-z][a-z0-9+.-]*):\/\/[^\s)]+?):(\d+):(\d+)\)?\s*$/i

export function parseStackFrames(stack: string): StackFrame[] {
  const frames: StackFrame[] = []
  for (const raw of stack.split('\n')) {
    const match = FRAME.exec(raw.trim())
    if (match) frames.push({ url: match[1]!, line: Number(match[2]), column: Number(match[3]) })
  }
  return frames
}

/** Primo frame che appartiene al progetto (schema dell'anteprima), saltando il ponte iniettato. */
export function firstProjectFrame(stack: string, scheme: string): StackFrame | null {
  return parseStackFrames(stack).find((frame) => frame.url.startsWith(`${scheme}://`) && !frame.url.includes(BRIDGE_DIR)) ?? null
}

/** Cartella virtuale dell'anteprima dove vive lo script ponte (non appartiene al progetto). */
export const BRIDGE_DIR = '/__ide__/'
export const BRIDGE_PATH = '__ide__/bridge.js'
