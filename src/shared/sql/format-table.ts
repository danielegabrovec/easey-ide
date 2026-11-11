// Tabelle di testo (stile psql) per il terminale SQL.
import type { CellValue } from '../contracts/db'

const MAX_CELL = 40

export function cellText(value: CellValue): string {
  if (value === null) return 'NULL'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

function clip(text: string): string {
  const single = text.replace(/\r?\n/g, '↵')
  return single.length > MAX_CELL ? `${single.slice(0, MAX_CELL - 1)}…` : single
}

/** Larghezza a video: i caratteri "larghi" (emoji, CJK) contano doppio. */
export function displayWidth(text: string): number {
  let width = 0
  for (const char of text) width += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1f300}-\u{1faff}]/u.test(char) ? 2 : 1
  return width
}

function pad(text: string, width: number, right: boolean): string {
  const fill = ' '.repeat(Math.max(0, width - displayWidth(text)))
  return right ? fill + text : text + fill
}

export function formatTable(columns: string[], rows: CellValue[][]): string {
  if (columns.length === 0) return ''
  const cells = rows.map((row) => row.map((v) => clip(cellText(v))))
  const numeric = columns.map((_, i) => rows.length > 0 && rows.every((r) => r[i] === null || typeof r[i] === 'number'))
  const widths = columns.map((c, i) => Math.max(displayWidth(c), ...cells.map((r) => displayWidth(r[i] ?? ''))))
  const line = (l: string, m: string, r: string) => l + widths.map((w) => '─'.repeat(w + 2)).join(m) + r
  const out = [line('┌', '┬', '┐'), '│' + columns.map((c, i) => ` ${pad(c, widths[i]!, false)} `).join('│') + '│', line('├', '┼', '┤')]
  for (const row of cells) out.push('│' + row.map((v, i) => ` ${pad(v, widths[i]!, numeric[i]!)} `).join('│') + '│')
  out.push(line('└', '┴', '┘'))
  return out.join('\n')
}

/** CSV con separatore ";" (Excel in italiano) e virgolette dove servono. */
export function toCsv(columns: string[], rows: CellValue[][], separator = ';'): string {
  const escape = (value: string) => (/[";\n\r,]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  return [columns.map(escape).join(separator), ...rows.map((r) => r.map((v) => (v === null ? '' : escape(cellText(v)))).join(separator))].join('\r\n')
}
