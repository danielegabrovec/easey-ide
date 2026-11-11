// Lettura e scrittura del formato pacchetto-corso (logica pura: riceve testi, restituisce oggetti).
import type { CheckSpec, Course, Exercise, ExerciseLanguage } from '../contracts/learn'

export const COURSE_FILE = 'corso.json'

export interface CourseManifest {
  id: string
  titolo: string
  descrizione?: string
  lezioni: { id: string; titolo: string; capitolo?: string; testo?: string; esercizi?: string[] }[]
}

export function parseManifest(json: string): CourseManifest {
  const raw = JSON.parse(json.replace(/^﻿/, '')) as Partial<CourseManifest>
  if (!raw.id || !raw.titolo || !Array.isArray(raw.lezioni)) throw new Error('corso.json: servono "id", "titolo" e "lezioni"')
  return { id: slugify(raw.id), titolo: raw.titolo, descrizione: raw.descrizione, lezioni: raw.lezioni.filter((l) => l && l.id && l.titolo) }
}

function exerciseMarkdown(exercise: Exercise): string {
  const meta: [string, string | undefined][] = [
    ['titolo', exercise.title],
    ['linguaggio', exercise.language],
    ['livello', exercise.level],
    ['capitolo', exercise.chapter],
    ['file', exercise.entry]
  ]
  const front = meta
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v!.replace(/\n/g, ' ')}`)
    .join('\n')
  const hints = exercise.hints.length ? `\n\n## Suggerimenti\n\n${exercise.hints.map((h) => `- ${h}`).join('\n')}` : ''
  return `---\n${front}\n---\n\n${exercise.body.trim()}${hints}\n`
}

/** Un corso in memoria → i file del suo pacchetto (percorsi relativi alla cartella del corso). */
export function coursePackFiles(course: Course): Record<string, string> {
  const files: Record<string, string> = {}
  const manifest: CourseManifest = {
    id: course.id,
    titolo: course.title,
    descrizione: course.description,
    lezioni: course.lessonList.map((lesson) => ({
      id: lesson.id,
      titolo: lesson.title,
      capitolo: lesson.chapter,
      testo: lesson.body.trim() ? `lezioni/${lesson.id}.md` : undefined,
      esercizi: lesson.exercises.map((e) => e.id)
    }))
  }
  files[COURSE_FILE] = JSON.stringify(manifest, null, 2) + '\n'
  for (const lesson of course.lessonList) {
    if (lesson.body.trim()) files[`lezioni/${lesson.id}.md`] = lesson.body.trim() + '\n'
    for (const exercise of lesson.exercises) {
      const base = `esercizi/${exercise.id}`
      files[`${base}/esercizio.md`] = exerciseMarkdown(exercise)
      files[`${base}/verifica.json`] = JSON.stringify(exercise.check, null, 2) + '\n'
      for (const [path, content] of Object.entries(exercise.starter)) files[`${base}/starter/${path}`] = content
      for (const [path, content] of Object.entries(exercise.solution)) files[`${base}/soluzione/${path}`] = content
    }
  }
  return files
}

/** Ricostruisce un esercizio dai testi del suo pacchetto. */
export function parseExercise(
  id: string,
  markdown: string,
  verifica: string | null,
  starter: Record<string, string>,
  solution: Record<string, string>,
  setupSql: string | null
): Exercise {
  const { data, body } = parseFrontmatter(markdown)
  const { body: text, hints } = splitHints(body)
  const language = normalizeLanguage(data['linguaggio'])
  const entry = data['file'] || Object.keys(starter)[0] || DEFAULT_ENTRY[language]
  let check = parseCheckSpec(verifica, language)
  if (check.tipo === 'sql') {
    const solutionSql = check.soluzione ?? Object.entries(solution).find(([p]) => p.endsWith('.sql'))?.[1]
    check = { ...check, setup: setupSql ?? check.setup ?? '', soluzione: solutionSql }
    if (!check.soluzione) check = { tipo: 'autovalutazione' }
  }
  return {
    id,
    title: data['titolo'] || /^#\s+(.+)$/m.exec(text)?.[1] || id,
    language,
    level: data['livello'] || undefined,
    chapter: data['capitolo'] || undefined,
    entry,
    body: text,
    hints,
    starter: Object.keys(starter).length ? starter : { [entry]: '' },
    solution,
    check
  }
}

export interface Frontmatter {
  data: Record<string, string>
  body: string
}

/** Frontmatter YAML minimale: righe "chiave: valore" fra due righe "---". */
export function parseFrontmatter(source: string): Frontmatter {
  const text = source.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text)
  if (!match) return { data: {}, body: text }
  const data: Record<string, string> = {}
  for (const line of match[1]!.split('\n')) {
    const pair = /^\s*([\w-]+)\s*:\s*(.*)$/.exec(line)
    if (pair) data[pair[1]!] = pair[2]!.trim().replace(/^(['"])(.*)\1$/, '$2')
  }
  return { data, body: text.slice(match[0].length) }
}

/** Separa la consegna dalla sezione "## Suggerimenti" (un indizio per voce d'elenco). */
export function splitHints(body: string): { body: string; hints: string[] } {
  const lines = body.split('\n')
  const start = lines.findIndex((line) => /^#{2,3}\s+suggeriment/i.test(line.trim()))
  if (start < 0) return { body: body.trim(), hints: [] }
  let end = lines.findIndex((line, i) => i > start && /^#{1,3}\s+/.test(line.trim()))
  if (end < 0) end = lines.length
  const hints: string[] = []
  for (const line of lines.slice(start + 1, end)) {
    const item = /^\s*(?:[-*]|\d+[.)])\s+(.*)$/.exec(line)
    if (item) hints.push(item[1]!.trim())
    else if (line.trim() && hints.length) hints[hints.length - 1] += ' ' + line.trim()
  }
  return { body: [...lines.slice(0, start), ...lines.slice(end)].join('\n').trim(), hints }
}

const LANGUAGES: Record<string, ExerciseLanguage> = {
  js: 'js',
  javascript: 'js',
  ts: 'ts',
  typescript: 'ts',
  html: 'html',
  css: 'html',
  'html-css': 'html',
  sql: 'sql',
  sqlite: 'sql'
}

export function normalizeLanguage(value: string | undefined, fallback: ExerciseLanguage = 'js'): ExerciseLanguage {
  return LANGUAGES[(value ?? '').toLowerCase().trim()] ?? fallback
}

export const DEFAULT_ENTRY: Record<ExerciseLanguage, string> = { js: 'main.js', ts: 'main.ts', html: 'index.html', sql: 'query.sql' }

/** Valida (e completa) una specifica di verifica letta da verifica.json. */
export function parseCheckSpec(json: string | null, language: ExerciseLanguage): CheckSpec {
  if (!json) return language === 'sql' ? { tipo: 'sql' } : { tipo: 'autovalutazione' }
  const raw = JSON.parse(json) as Partial<CheckSpec> & Record<string, unknown>
  switch (raw.tipo) {
    case 'js':
      if (!Array.isArray(raw['test'])) throw new Error('verifica.json: "test" deve essere un elenco')
      return { tipo: 'js', test: raw['test'] as never }
    case 'html':
      if (!Array.isArray(raw['regole'])) throw new Error('verifica.json: "regole" deve essere un elenco')
      return { tipo: 'html', regole: raw['regole'] as never }
    case 'sql':
      return { tipo: 'sql', setup: raw['setup'] as string | undefined, soluzione: raw['soluzione'] as string | undefined, ordine: raw['ordine'] === true }
    case 'autovalutazione':
      return { tipo: 'autovalutazione' }
    default:
      throw new Error(`verifica.json: tipo sconosciuto "${String(raw.tipo)}"`)
  }
}

/** Identificatore sicuro per cartelle e chiavi (minuscole, trattini). */
export function slugify(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'corso'
  )
}
