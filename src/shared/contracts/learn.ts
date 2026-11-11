// Contratti della didattica: corsi, lezioni, esercizi, verifica e progressi.
//
// Formato di un pacchetto-corso (cartella):
//   corso.json                       { id, titolo, descrizione, lezioni: [{ id, titolo, capitolo?, testo?, esercizi: [id] }] }
//   lezioni/<id>.md                  testo della lezione (facoltativo, indicato da "testo")
//   esercizi/<id>/esercizio.md       frontmatter (titolo, linguaggio, livello, capitolo, file) + consegna;
//                                    la sezione "## Suggerimenti" elenca gli indizi progressivi
//   esercizi/<id>/starter/…          file di partenza copiati nella cartella di lavoro
//   esercizi/<id>/soluzione/…        soluzione (sbloccabile)
//   esercizi/<id>/verifica.json      CheckSpec (vedi sotto); per SQL anche setup.sql

export type ExerciseLanguage = 'js' | 'ts' | 'html' | 'sql'

export interface JsTest {
  descrizione: string
  /** Espressione valutata dopo aver eseguito il file (le funzioni del file sono visibili per nome). */
  espressione?: string
  /** Valore atteso (confronto profondo). */
  atteso?: unknown
  /** In alternativa: testo che deve comparire nell'output della console. */
  output?: string
}

export interface HtmlRule {
  descrizione: string
  selettore: string
  /** Quanti elementi devono esserci almeno (predefinito 1). 0 = nessuno. */
  minimo?: number
  massimo?: number
  /** Testo che il primo elemento deve contenere (senza distinguere maiuscole). */
  testo?: string
  attributo?: { nome: string; valore?: string }
  /** Stili calcolati attesi sul primo elemento, es. { "color": "red", "display": "flex" }. */
  stile?: Record<string, string>
}

export type CheckSpec =
  | { tipo: 'js'; test: JsTest[] }
  | { tipo: 'html'; regole: HtmlRule[] }
  | { tipo: 'sql'; setup?: string; soluzione?: string; ordine?: boolean }
  | { tipo: 'autovalutazione' }

export interface Exercise {
  id: string
  title: string
  language: ExerciseLanguage
  level?: string
  chapter?: string
  /** File principale (aperto all'inizio, eseguito dalla verifica). */
  entry: string
  /** Consegna in Markdown. */
  body: string
  hints: string[]
  starter: Record<string, string>
  solution: Record<string, string>
  check: CheckSpec
}

export interface Lesson {
  id: string
  title: string
  chapter?: string
  body: string
  exercises: Exercise[]
}

export interface CourseSummary {
  id: string
  title: string
  description: string
  origin: 'incluso' | 'importato'
  lessons: number
  exercises: number
}

export interface Course extends CourseSummary {
  lessonList: Lesson[]
}

export interface CheckItem {
  descrizione: string
  ok: boolean
  dettaglio?: string
}

export interface CheckResult {
  passed: boolean
  items: CheckItem[]
  /** Errore di compilazione/esecuzione che ha impedito la verifica. */
  error?: string
  /** Output della console raccolto durante l'esecuzione. */
  output?: string
}

export type ExerciseState = 'nuovo' | 'in-corso' | 'superato'

export interface ExerciseProgress {
  stato: ExerciseState
  tentativi: number
  suggerimenti: number
  soluzione: boolean
  aggiornato: number
}

/** Progressi di un corso: id esercizio → stato. */
export type CourseProgress = Record<string, ExerciseProgress>

export const EMPTY_PROGRESS: ExerciseProgress = { stato: 'nuovo', tentativi: 0, suggerimenti: 0, soluzione: false, aggiornato: 0 }

export type LearnEvent = { kind: 'attempt'; passed: boolean } | { kind: 'hint' } | { kind: 'solution' } | { kind: 'done' } | { kind: 'reset' }
