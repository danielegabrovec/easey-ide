// Database "usa e getta" della Scrittura rapida: SQLite e PostgreSQL (PGlite) in memoria, senza progetto.
// Restano vivi fra un'esecuzione e l'altra (CREATE TABLE ora, SELECT dopo) finché non si azzerano.
import type { DbDriver, DbSchema, QueryOutcome } from '@shared/contracts/db'
import type { QuickSqlEngine } from '@shared/contracts/quick'
import { SAMPLE_DATABASES } from '@shared/sql/samples'
import { PgliteDriver } from '../db/pglite-driver'
import { SqliteDriver } from '../db/sqlite-driver'

export class QuickSql {
  private readonly drivers = new Map<QuickSqlEngine, Promise<DbDriver>>()

  private driver(engine: QuickSqlEngine): Promise<DbDriver> {
    let pending = this.drivers.get(engine)
    if (!pending) {
      pending = engine === 'sqlite' ? Promise.resolve(new SqliteDriver(':memory:')) : PgliteDriver.open('memory://')
      pending.catch(() => this.drivers.delete(engine))
      this.drivers.set(engine, pending)
    }
    return pending
  }

  async execute(engine: QuickSqlEngine, sql: string): Promise<QueryOutcome[]> {
    return (await this.driver(engine)).execute(sql)
  }

  async schema(engine: QuickSqlEngine): Promise<DbSchema> {
    return (await this.driver(engine)).schema()
  }

  /** Svuota il database e, se richiesto, carica i dati d'esempio (vedi shared/sql/samples.ts). */
  async reset(engine: QuickSqlEngine, sample: string | null): Promise<DbSchema> {
    await this.close(engine)
    if (sample) {
      const found = SAMPLE_DATABASES.find((s) => s.id === sample)
      if (!found) throw new Error(`Dati d'esempio sconosciuti: ${sample}`)
      const outcomes = await this.execute(engine, found.sql[engine])
      const failure = outcomes.find((o) => o.kind === 'error')
      if (failure && failure.kind === 'error') throw new Error(`Dati d'esempio non caricati: ${failure.message}`)
    }
    return this.schema(engine)
  }

  async close(engine: QuickSqlEngine): Promise<void> {
    const pending = this.drivers.get(engine)
    this.drivers.delete(engine)
    if (pending) await (await pending.catch(() => null))?.close()
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.drivers.keys()].map((engine) => this.close(engine)))
  }
}
