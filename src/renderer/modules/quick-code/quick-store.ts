// Stato della Scrittura rapida: un documento per linguaggio (JS, TS, SQL), la raccolta dei salvataggi,
// gli eventi dell'ultima esecuzione e i risultati SQL. Il testo vive nel modello Monaco mentre si
// scrive; qui c'è la copia per la bozza (ripristinata al riavvio) e lo stato "modificato".
import { create } from 'zustand'
import type { DbSchema, QueryOutcome } from '@shared/contracts/db'
import { QUICK_LANGUAGES, type QuickLanguage, type QuickRunEvent, type QuickSnippetInfo, type QuickSqlEngine } from '@shared/contracts/quick'
import { ide } from '../../ipc'
import { notifyError } from '../../workbench/notifications'

export interface QuickDoc {
  /** File della raccolta da cui viene (null = mai salvato). */
  snippetId: string | null
  title: string
  /** Testo dell'ultimo salvataggio: serve a sapere se ci sono modifiche. */
  saved: string
  content: string
}

export type RunStatus = 'ok' | 'error' | 'timeout' | 'stopped'

export interface RunSummary {
  status: RunStatus
  durationMs: number
  truncated: boolean
  /** Partita da sola mentre si scriveva (gli errori di sintassi si mostrano con discrezione). */
  auto: boolean
}

export interface SqlRun {
  outcomes: QueryOutcome[]
  durationMs: number
  auto: boolean
}

interface QuickState {
  language: QuickLanguage
  docs: Record<QuickLanguage, QuickDoc>
  /** Contatore che cambia a ogni modifica del testo (per i componenti che mostrano "modificato"). */
  revision: number
  snippets: QuickSnippetInfo[]
  runId: string | null
  runAuto: boolean
  events: QuickRunEvent[]
  summary: RunSummary | null
  sql: SqlRun | null
  sqlRunning: boolean
  schemas: Partial<Record<QuickSqlEngine, DbSchema>>
  generating: boolean
  /** Barra "Genera con AI" aperta. */
  promptOpen: boolean
  /** HTML: indirizzo della pagina pubblicata nell'anteprima (null = non ancora). */
  pageUrl: string | null
  setLanguage: (language: QuickLanguage) => void
  setContent: (language: QuickLanguage, content: string) => void
  setDoc: (language: QuickLanguage, doc: QuickDoc) => void
  refreshSnippets: () => Promise<void>
  startRun: (runId: string, auto: boolean) => void
  addEvents: (events: QuickRunEvent[]) => void
  setSql: (sql: SqlRun | null) => void
  setSqlRunning: (running: boolean) => void
  setSchema: (engine: QuickSqlEngine, schema: DbSchema) => void
  setGenerating: (generating: boolean) => void
  setPromptOpen: (open: boolean) => void
  setPageUrl: (url: string | null) => void
}

const STORAGE_KEY = 'easey.quick.v1'

export const STARTERS: Record<QuickLanguage, string> = {
  javascript: `// Scrittura rapida · JavaScript — i risultati compaiono accanto alle righe.
const numeri = [3, 1, 4, 1, 5, 9]
const doppi = numeri.map((n) => n * 2)
console.log('somma', doppi.reduce((a, b) => a + b, 0))
Math.max(...numeri)
`,
  typescript: `// Scrittura rapida · TypeScript — i tipi sono controllati mentre scrivi.
interface Persona {
  nome: string
  anni: number
}
const persone: Persona[] = [{ nome: 'Ada', anni: 36 }, { nome: 'Alan', anni: 41 }]
const nomi = persone.map((p) => p.nome).join(', ')
persone.filter((p) => p.anni > 40).length
`,
  sql: `-- Scrittura rapida · SQL — database in memoria (Ctrl+Invio esegue).
CREATE TABLE IF NOT EXISTS prova (id INTEGER PRIMARY KEY, nome TEXT, voto INTEGER);
INSERT INTO prova (nome, voto) VALUES ('Ada', 9), ('Alan', 8), ('Grace', 10);
SELECT nome, voto FROM prova ORDER BY voto DESC;
`,
  python: `# Scrittura rapida · Python — i risultati compaiono accanto alle righe.
numeri = [3, 1, 4, 1, 5, 9]
quadrati = [n * n for n in numeri]
print("somma dei quadrati:", sum(quadrati))
max(numeri), min(numeri)
`,
  html: `<!-- Scrittura rapida · HTML con CSS e JavaScript: l'anteprima si aggiorna mentre scrivi. -->
<style>
  body { font-family: system-ui, sans-serif; padding: 24px; }
  button { padding: 8px 16px; border-radius: 8px; border: 0; background: #6d7cff; color: white; }
</style>
<h1>Ciao!</h1>
<button id="conta">Cliccami</button>
<p>Clic: <span id="valore">0</span></p>
<script>
  let clic = 0
  document.querySelector('#conta').addEventListener('click', () => {
    clic++
    document.querySelector('#valore').textContent = clic
    console.log('clic numero', clic)
  })
</script>
`
}

function emptyDoc(language: QuickLanguage, content = STARTERS[language]): QuickDoc {
  return { snippetId: null, title: '', saved: '', content }
}

interface Persisted {
  language: QuickLanguage
  docs: Record<QuickLanguage, QuickDoc>
}

function load(): Persisted {
  const fallback: Persisted = { language: 'javascript', docs: Object.fromEntries(QUICK_LANGUAGES.map((l) => [l, emptyDoc(l)])) as Record<QuickLanguage, QuickDoc> }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<Persisted>
    const docs = { ...fallback.docs }
    for (const language of Object.keys(docs) as QuickLanguage[]) {
      const doc = parsed.docs?.[language]
      if (doc && typeof doc.content === 'string') docs[language] = { snippetId: doc.snippetId ?? null, title: doc.title ?? '', saved: doc.saved ?? '', content: doc.content }
    }
    const language = parsed.language && parsed.language in docs ? parsed.language : fallback.language
    return { language, docs }
  } catch {
    return fallback
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null
function persist(state: Persisted): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ language: state.language, docs: state.docs }))
    } catch {
      /* archiviazione non disponibile: la bozza resta solo in memoria */
    }
  }, 300)
}

const initial = load()

export const useQuick = create<QuickState>((set, get) => ({
  language: initial.language,
  docs: initial.docs,
  revision: 0,
  snippets: [],
  runId: null,
  runAuto: false,
  events: [],
  summary: null,
  sql: null,
  sqlRunning: false,
  schemas: {},
  generating: false,
  promptOpen: false,
  pageUrl: null,
  setLanguage: (language) => {
    set({ language, events: [], summary: null, runId: null })
    persist(get())
  },
  setContent: (language, content) => {
    const doc = get().docs[language]
    if (doc.content === content) return
    set((state) => ({ docs: { ...state.docs, [language]: { ...doc, content } }, revision: state.revision + 1 }))
    persist(get())
  },
  setDoc: (language, doc) => {
    set((state) => ({ docs: { ...state.docs, [language]: doc }, revision: state.revision + 1 }))
    persist(get())
  },
  refreshSnippets: async () => {
    try {
      set({ snippets: await ide.invoke('quick:list') })
    } catch (error) {
      notifyError(error)
    }
  },
  startRun: (runId, auto) => set({ runId, runAuto: auto, events: [], summary: null }),
  addEvents: (events) => {
    const { runId, runAuto } = get()
    const mine = events.filter((e) => e.runId === runId)
    if (!mine.length) return
    const done = mine.find((e) => e.kind === 'done')
    set((state) => ({
      events: [...state.events, ...mine.filter((e) => e.kind !== 'done')],
      summary: done && done.kind === 'done' ? { status: done.status, durationMs: done.durationMs, truncated: !!done.truncated, auto: runAuto } : state.summary
    }))
  },
  setSql: (sql) => set({ sql }),
  setSqlRunning: (sqlRunning) => set({ sqlRunning }),
  setSchema: (engine, schema) => set((state) => ({ schemas: { ...state.schemas, [engine]: schema } })),
  setGenerating: (generating) => set({ generating }),
  setPromptOpen: (promptOpen) => set({ promptOpen }),
  setPageUrl: (pageUrl) => set({ pageUrl })
}))

export const quick = () => useQuick.getState()

/** Ci sono modifiche da salvare? (Un documento mai salvato vuoto o con l'esempio iniziale non conta.) */
export function isDirty(doc: QuickDoc, language: QuickLanguage): boolean {
  if (doc.snippetId === null) return doc.content.trim() !== '' && doc.content !== STARTERS[language] && doc.content !== doc.saved
  return doc.content !== doc.saved
}

export function blankDoc(language: QuickLanguage): QuickDoc {
  return emptyDoc(language, '')
}
