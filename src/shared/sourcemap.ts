// Lettore minimo di source map v3: serve a riportare errori e console.log
// dell'anteprima sulla riga del file TypeScript originale.

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const BASE64_INDEX: Record<string, number> = Object.fromEntries([...BASE64].map((c, i) => [c, i]))

export interface RawSourceMap {
  version: number
  sources: string[]
  mappings: string
}

/** Un segmento: colonna generata → (sorgente, riga, colonna) originali. Tutto a base 0. */
interface Segment {
  generatedColumn: number
  source: number
  line: number
  column: number
}

export function decodeVlq(segment: string): number[] {
  const values: number[] = []
  let shift = 0
  let value = 0
  for (const char of segment) {
    const digit = BASE64_INDEX[char]
    if (digit === undefined) throw new Error(`Carattere VLQ non valido: ${char}`)
    const continuation = digit & 32
    value += (digit & 31) << shift
    if (continuation) {
      shift += 5
    } else {
      const negative = value & 1
      value >>>= 1
      values.push(negative ? -value : value)
      value = 0
      shift = 0
    }
  }
  return values
}

export class SourceMapReader {
  private readonly lines: Segment[][]

  constructor(private readonly map: RawSourceMap) {
    this.lines = []
    let source = 0
    let line = 0
    let column = 0
    for (const lineText of map.mappings.split(';')) {
      const segments: Segment[] = []
      let generatedColumn = 0
      if (lineText) {
        for (const raw of lineText.split(',')) {
          if (!raw) continue
          const fields = decodeVlq(raw)
          generatedColumn += fields[0] ?? 0
          if (fields.length >= 4) {
            source += fields[1]!
            line += fields[2]!
            column += fields[3]!
            segments.push({ generatedColumn, source, line, column })
          }
        }
      }
      this.lines.push(segments)
    }
  }

  /**
   * Posizione originale per una posizione generata. Righe a base 1, colonne a base 1
   * (come negli stack del browser). Restituisce null se la riga non ha mappature.
   */
  originalPosition(line: number, column: number): { source: string; line: number; column: number } | null {
    const segments = this.lines[line - 1]
    if (!segments || segments.length === 0) return null
    const col0 = Math.max(0, column - 1)
    let best = segments[0]!
    for (const segment of segments) {
      if (segment.generatedColumn <= col0) best = segment
      else break
    }
    const source = this.map.sources[best.source]
    if (source === undefined) return null
    return { source, line: best.line + 1, column: best.column + 1 }
  }
}
