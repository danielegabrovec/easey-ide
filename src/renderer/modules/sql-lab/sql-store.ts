// Stato del SQL Lab: connessioni del progetto, connessione attiva, schema, ultimi risultati e piano.
import { create } from 'zustand'
import type { DbConnectionInfo, DbSchema, QueryOutcome, QueryPlan } from '@shared/contracts/db'
import { EMPTY_MODEL, type QueryModel } from '@shared/sql/query-model'
import { ide } from '../../ipc'
import { notifyError } from '../../workbench/notifications'
import { workbench } from '../../workbench/store'

export const MEMORY_ID = 'sqlite::memory:'

export interface ResultSet {
  id: number
  connectionId: string
  outcomes: QueryOutcome[]
  at: number
}

interface SqlState {
  connections: DbConnectionInfo[]
  activeId: string
  schemas: Record<string, DbSchema>
  results: ResultSet | null
  plan: (QueryPlan & { statement: string }) | null
  running: boolean
  /** Modello del costruttore visuale per connessione. */
  builders: Record<string, QueryModel>
  refresh: () => Promise<void>
  setActive: (id: string) => void
  loadSchema: (id?: string) => Promise<DbSchema | null>
  run: (sql: string, id?: string) => Promise<QueryOutcome[]>
  explain: (sql: string, id?: string) => Promise<void>
  setBuilder: (id: string, model: QueryModel) => void
  reset: () => void
}

let resultCounter = 0
const activeKey = () => `sql.active:${workbench().project?.root ?? ''}`

/** Le istruzioni che cambiano struttura o dati invalidano lo schema in cache. */
export function changesSchema(statement: string): boolean {
  return !/^\s*(SELECT|WITH|EXPLAIN|PRAGMA\s+\w+\s*$|VALUES|SHOW)\b/i.test(statement)
}

export const useSql = create<SqlState>((set, get) => ({
  connections: [],
  activeId: MEMORY_ID,
  schemas: {},
  results: null,
  plan: null,
  running: false,
  builders: {},
  refresh: async () => {
    try {
      const connections = await ide.invoke('db:list')
      let activeId = get().activeId
      try {
        activeId = localStorage.getItem(activeKey()) ?? activeId
      } catch {
        /* archiviazione non disponibile */
      }
      if (!connections.some((c) => c.id === activeId)) activeId = connections.find((c) => c.id !== MEMORY_ID)?.id ?? MEMORY_ID
      set({ connections, activeId })
    } catch (error) {
      notifyError(error)
    }
  },
  setActive: (id) => {
    set({ activeId: id, plan: null })
    try {
      localStorage.setItem(activeKey(), id)
    } catch {
      /* archiviazione non disponibile */
    }
    void get().loadSchema(id)
  },
  loadSchema: async (id) => {
    const target = id ?? get().activeId
    try {
      const schema = await ide.invoke('db:schema', target)
      set((state) => ({ schemas: { ...state.schemas, [target]: schema } }))
      return schema
    } catch (error) {
      notifyError(error)
      return null
    }
  },
  run: async (sql, id) => {
    const target = id ?? get().activeId
    set({ running: true })
    try {
      const outcomes = await ide.invoke('db:execute', target, sql)
      set({ results: { id: ++resultCounter, connectionId: target, outcomes, at: Date.now() }, plan: null })
      if (outcomes.some((o) => o.kind === 'result' && changesSchema(o.statement))) void get().loadSchema(target)
      return outcomes
    } catch (error) {
      notifyError(error)
      return []
    } finally {
      set({ running: false })
    }
  },
  explain: async (sql, id) => {
    const target = id ?? get().activeId
    try {
      const plan = await ide.invoke('db:explain', target, sql)
      set({ plan: { ...plan, statement: sql } })
    } catch (error) {
      notifyError(error)
    }
  },
  setBuilder: (id, model) => set((state) => ({ builders: { ...state.builders, [id]: model } })),
  reset: () => set({ connections: [], activeId: MEMORY_ID, schemas: {}, results: null, plan: null, builders: {} })
}))

export function activeConnection(): DbConnectionInfo | undefined {
  const { connections, activeId } = useSql.getState()
  return connections.find((c) => c.id === activeId)
}

export function builderFor(id: string): QueryModel {
  return useSql.getState().builders[id] ?? EMPTY_MODEL
}
