// Servizio della didattica: carica i pacchetti-corso (inclusi nell'app e importati), prepara la cartella
// di lavoro di un esercizio, lo verifica (JS/TS e SQL qui; HTML/CSS nel renderer) e salva i progressi.
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { CheckResult, Course, CourseProgress, CourseSummary, Exercise, ExerciseProgress, LearnEvent, Lesson } from '@shared/contracts/learn'
import { EMPTY_PROGRESS } from '@shared/contracts/learn'
import { LEGACY_PROJECT_CONFIG_FILE, PROJECT_CONFIG_FILE } from '@shared/contracts/workspace'
import { importManual, type ManualFile } from '@shared/learn/manual-import'
import { COURSE_FILE, coursePackFiles, parseExercise, parseManifest } from '@shared/learn/pack'
import { checkJs, checkSql } from './checkers'

const TEXT_FILE = /\.(html?|css|js|mjs|cjs|ts|mts|tsx|jsx|json|sql|md|txt|svg)$/i
const MAX_FILE = 512 * 1024

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

/** Legge ricorsivamente i file di testo di una cartella (percorsi relativi con "/"). */
async function readTree(dir: string, prefix = ''): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return files
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) Object.assign(files, await readTree(join(dir, entry.name), rel))
    else if (entry.isFile() && TEXT_FILE.test(entry.name)) {
      const content = await readFile(join(dir, entry.name), 'utf8')
      if (content.length <= MAX_FILE) files[rel] = content
    }
  }
  return files
}

async function writeTree(dir: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const target = join(dir, ...path.split('/'))
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content, 'utf8')
  }
}

export class LearnService {
  private cache = new Map<string, { dir: string; course: Course }>()

  constructor(
    /** Corsi inclusi nell'app (sola lettura, anche dentro app.asar). */
    private readonly bundledDir: string,
    /** Corsi importati dall'utente. */
    private readonly userDir: string,
    private readonly progressFile: string,
    /** Dove nascono le cartelle di lavoro degli esercizi. */
    private readonly workDir: string
  ) {}

  private async loadPack(dir: string, origin: Course['origin']): Promise<Course> {
    const manifest = parseManifest(await readFile(join(dir, COURSE_FILE), 'utf8'))
    const lessons: Lesson[] = []
    for (const entry of manifest.lezioni) {
      const exercises: Exercise[] = []
      for (const id of entry.esercizi ?? []) {
        const base = join(dir, 'esercizi', id)
        const markdown = await readOptional(join(base, 'esercizio.md'))
        if (markdown === null) continue
        exercises.push(
          parseExercise(id, markdown, await readOptional(join(base, 'verifica.json')), await readTree(join(base, 'starter')), await readTree(join(base, 'soluzione')), await readOptional(join(base, 'setup.sql')))
        )
      }
      const body = entry.testo ? ((await readOptional(join(dir, ...entry.testo.split('/')))) ?? '') : ''
      lessons.push({ id: entry.id, title: entry.titolo, chapter: entry.capitolo, body, exercises })
    }
    return {
      id: manifest.id,
      title: manifest.titolo,
      description: manifest.descrizione ?? '',
      origin,
      lessons: lessons.length,
      exercises: lessons.reduce((n, l) => n + l.exercises.length, 0),
      lessonList: lessons
    }
  }

  private async scan(): Promise<void> {
    this.cache.clear()
    for (const [root, origin] of [
      [this.bundledDir, 'incluso'],
      [this.userDir, 'importato']
    ] as const) {
      let entries
      try {
        entries = await readdir(root, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const dir = join(root, entry.name)
        if (!existsSync(join(dir, COURSE_FILE))) continue
        try {
          const course = await this.loadPack(dir, origin)
          if (!this.cache.has(course.id)) this.cache.set(course.id, { dir, course })
        } catch (error) {
          console.warn(`Corso non valido in ${dir}:`, (error as Error).message)
        }
      }
    }
  }

  async list(): Promise<CourseSummary[]> {
    await this.scan()
    return [...this.cache.values()].map(({ course: { lessonList: _, ...summary } }) => summary)
  }

  async course(id: string): Promise<Course> {
    if (!this.cache.has(id)) await this.scan()
    const found = this.cache.get(id)
    if (!found) throw new Error(`Corso non trovato: ${id}`)
    return found.course
  }

  private async exercise(courseId: string, exerciseId: string): Promise<Exercise> {
    const course = await this.course(courseId)
    const exercise = course.lessonList.flatMap((l) => l.exercises).find((e) => e.id === exerciseId)
    if (!exercise) throw new Error(`Esercizio non trovato: ${exerciseId}`)
    return exercise
  }

  exerciseDir(courseId: string, exerciseId: string): string {
    return join(this.workDir, courseId, exerciseId)
  }

  /** Crea (o ricrea con `reset`) la cartella di lavoro con i file di partenza; restituisce il percorso. */
  async start(courseId: string, exerciseId: string, reset = false): Promise<string> {
    const exercise = await this.exercise(courseId, exerciseId)
    const dir = this.exerciseDir(courseId, exerciseId)
    if (reset) await rm(dir, { recursive: true, force: true })
    if (!existsSync(dir)) {
      await writeTree(dir, exercise.starter)
      const config = { name: exercise.title, run: { mode: exercise.language === 'html' ? 'web' : 'terminal', entry: exercise.entry } }
      await writeFile(join(dir, PROJECT_CONFIG_FILE), JSON.stringify(config, null, 2) + '\n', 'utf8')
    }
    await this.touch(courseId, exerciseId, (p) => (p.stato === 'nuovo' ? { ...p, stato: 'in-corso' } : p))
    return dir
  }

  /** File di testo della cartella di lavoro (per la verifica HTML e per il tutor). */
  async files(courseId: string, exerciseId: string): Promise<Record<string, string>> {
    const files = await readTree(this.exerciseDir(courseId, exerciseId))
    delete files[PROJECT_CONFIG_FILE]
    delete files[LEGACY_PROJECT_CONFIG_FILE]
    return files
  }

  async check(courseId: string, exerciseId: string): Promise<CheckResult> {
    const exercise = await this.exercise(courseId, exerciseId)
    const dir = this.exerciseDir(courseId, exerciseId)
    if (!existsSync(dir)) return { passed: false, items: [], error: 'Prima inizia l’esercizio: la cartella di lavoro non esiste.' }
    const check = exercise.check
    if (check.tipo === 'js') {
      if (!existsSync(join(dir, exercise.entry))) return { passed: false, items: [], error: `Manca il file ${exercise.entry}.` }
      return checkJs(dir, exercise.entry, check.test)
    }
    if (check.tipo === 'sql') {
      const student = (await readOptional(join(dir, exercise.entry))) ?? ''
      return checkSql(check.setup ?? '', student, check.soluzione ?? '', check.ordine === true)
    }
    return { passed: false, items: [], error: check.tipo === 'html' ? 'La verifica HTML/CSS avviene nel renderer.' : 'Esercizio ad autovalutazione.' }
  }

  // ---------- progressi ----------

  private async readProgress(): Promise<Record<string, CourseProgress>> {
    try {
      return JSON.parse(await readFile(this.progressFile, 'utf8')) as Record<string, CourseProgress>
    } catch {
      return {}
    }
  }

  async progress(courseId: string): Promise<CourseProgress> {
    return (await this.readProgress())[courseId] ?? {}
  }

  private async touch(courseId: string, exerciseId: string, change: (p: ExerciseProgress) => ExerciseProgress): Promise<CourseProgress> {
    const all = await this.readProgress()
    const course = all[courseId] ?? {}
    course[exerciseId] = { ...change(course[exerciseId] ?? EMPTY_PROGRESS), aggiornato: Date.now() }
    all[courseId] = course
    await mkdir(dirname(this.progressFile), { recursive: true })
    await writeFile(this.progressFile, JSON.stringify(all, null, 2), 'utf8')
    return course
  }

  /** Registra un evento: tentativo di verifica, suggerimento visto, soluzione sbloccata, segnato come fatto. */
  record(courseId: string, exerciseId: string, event: LearnEvent): Promise<CourseProgress> {
    return this.touch(courseId, exerciseId, (p) => {
      switch (event.kind) {
        case 'attempt':
          return { ...p, tentativi: p.tentativi + 1, stato: event.passed || p.stato === 'superato' ? 'superato' : 'in-corso' }
        case 'hint':
          return { ...p, suggerimenti: p.suggerimenti + 1 }
        case 'solution':
          return { ...p, soluzione: true }
        case 'done':
          return { ...p, stato: 'superato' }
        case 'reset':
          return { ...EMPTY_PROGRESS }
      }
    })
  }

  // ---------- importazione ----------

  /** Importa un manuale della Collana (cartella con capitoli "NN - Titolo.md"). */
  async importManual(folder: string): Promise<CourseSummary> {
    const entries = await readdir(folder, { withFileTypes: true })
    const files: ManualFile[] = []
    for (const entry of entries) if (entry.isFile() && /\.md$/i.test(entry.name)) files.push({ name: entry.name, content: await readFile(join(folder, entry.name), 'utf8') })
    const course = importManual(basename(folder), files)
    if (course.lessons === 0) throw new Error('In questa cartella non ci sono capitoli «NN - Titolo.md»: scegli la cartella di un manuale della Collana.')
    return this.installCourse(course)
  }

  /** Importa un pacchetto-corso (cartella con corso.json) copiandolo fra i corsi dell'utente. */
  async importPack(folder: string): Promise<CourseSummary> {
    const course = await this.loadPack(folder, 'importato')
    return this.installCourse(course)
  }

  private async installCourse(course: Course): Promise<CourseSummary> {
    const target = join(this.userDir, course.id)
    await rm(target, { recursive: true, force: true })
    await writeTree(target, coursePackFiles(course))
    this.cache.delete(course.id)
    const { lessonList: _, ...summary } = { ...course, origin: 'importato' as const }
    return summary
  }

  async remove(courseId: string): Promise<void> {
    const course = await this.course(courseId)
    if (course.origin !== 'importato') throw new Error('I corsi inclusi nell’app non si possono rimuovere.')
    await rm(this.cache.get(courseId)!.dir, { recursive: true, force: true })
    this.cache.delete(courseId)
  }
}
