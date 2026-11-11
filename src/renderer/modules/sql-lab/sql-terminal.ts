// Logica del terminale SQL, indipendente da xterm (testabile): riga in composizione, istruzioni su più
// righe fino al ";", cronologia, comandi speciali (.tables, .schema, \d, \dt…). Restituisce il testo da stampare.
import type { DbSchema, QueryOutcome, SqlDialect } from '@shared/contracts/db'
import { createTableSql, draftFromTable } from '@shared/sql/ddl'
import { formatTable } from '@shared/sql/format-table'

export interface SqlTerminalHost {
  dialect: () => SqlDialect
  name: () => string
  execute: (sql: string) => Promise<QueryOutcome[]>
  schema: () => Promise<DbSchema | null>
}

const NL = '\r\n'
const color = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`
}

export const HELP = [
  'Comandi:',
  '  istruzione SQL;      esegue (anche su più righe, termina con ;)',
  '  .tables   oppure \\dt  elenca le tabelle',
  '  .schema [tabella]    mostra il CREATE TABLE (\\d tabella in stile psql)',
  '  .clear               pulisce lo schermo',
  '  .help                questo aiuto',
  '  Frecce su/giù: cronologia · Ctrl+C: annulla la riga'
].join(NL)

export function outcomesToText(outcomes: QueryOutcome[]): string {
  const parts: string[] = []
  for (const outcome of outcomes) {
    if (outcome.kind === 'error') {
      parts.push(color.red(`Errore: ${outcome.message}`))
      continue
    }
    if (outcome.columns.length) {
      parts.push(formatTable(outcome.columns, outcome.rows).split('\n').join(NL))
      parts.push(color.dim(`(${outcome.rows.length} ${outcome.rows.length === 1 ? 'riga' : 'righe'}${outcome.truncated ? ', mostrate solo le prime' : ''})`))
    } else {
      parts.push(color.green(`OK${outcome.changes ? `, ${outcome.changes} ${outcome.changes === 1 ? 'riga modificata' : 'righe modificate'}` : ''}`))
    }
  }
  return parts.join(NL)
}

export class SqlTerminalSession {
  private line = ''
  private buffer: string[] = []
  private history: string[] = []
  private historyIndex = -1
  private busy = false

  constructor(
    private readonly host: SqlTerminalHost,
    private readonly write: (text: string) => void
  ) {}

  prompt(): string {
    const base = this.host.dialect() === 'postgres' ? `${this.host.name()}=` : 'sqlite'
    return this.buffer.length ? color.cyan(`${' '.repeat(Math.max(0, base.length - 3))}...> `) : color.cyan(`${base}> `)
  }

  start(): void {
    this.write(color.dim(`Terminale SQL collegato a ${this.host.name()} (${this.host.dialect() === 'postgres' ? 'PostgreSQL' : 'SQLite'}). Scrivi .help per l’aiuto.`) + NL + this.prompt())
  }

  /** Dati digitati (anche incollati: più caratteri e più righe insieme). */
  async input(data: string): Promise<void> {
    for (let i = 0; i < data.length; i++) {
      if (this.busy) return
      const char = data[i]!
      if (char === '\x1b') {
        const seq = data.slice(i, i + 3)
        if (seq === '\x1b[A') this.recall(1)
        else if (seq === '\x1b[B') this.recall(-1)
        i += seq.startsWith('\x1b[') ? 2 : 0
      } else if (char === '\r' || char === '\n') {
        if (char === '\n' && data[i - 1] === '\r') continue
        this.write(NL)
        await this.submit(this.line)
        this.line = ''
      } else if (char === '\x7f' || char === '\b') {
        if (this.line.length) {
          this.line = [...this.line].slice(0, -1).join('')
          this.write('\b \b')
        }
      } else if (char === '\x03') {
        this.line = ''
        this.buffer = []
        this.write('^C' + NL + this.prompt())
      } else if (char >= ' ') {
        this.line += char
        this.write(char)
      }
    }
  }

  private recall(direction: number): void {
    if (!this.history.length) return
    this.historyIndex = Math.max(-1, Math.min(this.history.length - 1, this.historyIndex + direction))
    const next = this.historyIndex >= 0 ? this.history[this.historyIndex]! : ''
    this.write('\b \b'.repeat([...this.line].length) + next)
    this.line = next
  }

  private async submit(line: string): Promise<void> {
    const trimmed = line.trim()
    if (!this.buffer.length && (trimmed.startsWith('.') || trimmed.startsWith('\\'))) {
      this.remember(trimmed)
      await this.meta(trimmed)
      this.write(this.prompt())
      return
    }
    if (trimmed || this.buffer.length) this.buffer.push(line)
    const statement = this.buffer.join('\n').trim()
    if (!statement) {
      this.write(this.prompt())
      return
    }
    if (!statement.endsWith(';')) {
      this.write(this.prompt())
      return
    }
    this.buffer = []
    this.remember(statement.replace(/\s*\n\s*/g, ' '))
    this.busy = true
    try {
      this.write(outcomesToText(await this.host.execute(statement)) + NL)
    } catch (error) {
      this.write(color.red(`Errore: ${(error as Error).message}`) + NL)
    } finally {
      this.busy = false
    }
    this.write(this.prompt())
  }

  private remember(entry: string): void {
    this.history = [entry, ...this.history.filter((h) => h !== entry)].slice(0, 100)
    this.historyIndex = -1
  }

  private async meta(command: string): Promise<void> {
    const [name, argument] = command.split(/\s+/, 2)
    switch (name) {
      case '.help':
      case '\\?':
      case '\\h':
        this.write(HELP + NL)
        return
      case '.clear':
        this.write('\x1b[2J\x1b[H')
        return
      case '.tables':
      case '\\dt': {
        const schema = await this.host.schema()
        const tables = schema?.tables.map((t) => (t.kind === 'view' ? `${t.name} (vista)` : t.name)) ?? []
        this.write((tables.length ? tables.join('  ') : color.dim('(nessuna tabella)')) + NL)
        return
      }
      case '.schema':
      case '\\d': {
        const schema = await this.host.schema()
        const tables = (schema?.tables ?? []).filter((t) => t.kind === 'table' && (!argument || t.name.toLowerCase() === argument.toLowerCase()))
        if (!tables.length) {
          this.write(color.dim(argument ? `Tabella "${argument}" non trovata.` : '(nessuna tabella)') + NL)
          return
        }
        this.write(tables.map((t) => createTableSql(draftFromTable(t), this.host.dialect())).join(NL + NL).split('\n').join(NL) + NL)
        return
      }
      default:
        this.write(color.red(`Comando sconosciuto: ${name}. Scrivi .help`) + NL)
    }
  }
}
