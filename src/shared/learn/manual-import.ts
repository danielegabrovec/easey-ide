// Importatore dei manuali della Collana "Imparare a programmare".
// Struttura reale di un manuale: cartella con README.md, "00 - Indice.md" e capitoli "NN - Titolo.md";
// gli esercizi sono i riquadri che iniziano con 🧪 ("> 🧪 Crea la pagina…").
// Ogni capitolo diventa una lezione, ogni riquadro 🧪 un esercizio ad autovalutazione
// (con l'aiuto del tutor AI), con un file di partenza adatto al linguaggio del manuale.
import type { Course, Exercise, ExerciseLanguage, Lesson } from '../contracts/learn'
import { DEFAULT_ENTRY, slugify } from './pack'

export interface ManualFile {
  name: string
  content: string
}

const CHAPTER = /^(\d{1,3})\s*-\s*(.+)\.md$/i

export function isManualChapter(name: string): boolean {
  const match = CHAPTER.exec(name)
  return !!match && Number(match[1]) > 0
}

/** Linguaggio prevalente dal nome del manuale. */
export function manualLanguage(name: string): ExerciseLanguage {
  const n = name.toLowerCase()
  if (/typescript|\bts\b/.test(n)) return 'ts'
  if (/sql|sqlite|postgres/.test(n) && !/html|javascript/.test(n)) return 'sql'
  if (/html|css|htmx/.test(n) && !/javascript/.test(n)) return 'html'
  return 'js'
}

/** Nei manuali misti decide il testo dell'esercizio. */
export function exerciseLanguage(text: string, fallback: ExerciseLanguage): ExerciseLanguage {
  if (/\b(SELECT|INSERT INTO|CREATE TABLE|UPDATE|DELETE FROM|JOIN|GROUP BY)\b/.test(text)) return 'sql'
  if (fallback === 'ts' || fallback === 'js') return fallback
  if (/<[a-z][a-z0-9]*[\s>/]|`[a-z-]+\s*:\s*[^`]+`|\bCSS\b|selettor/i.test(text)) return 'html'
  return fallback
}

/** Estrae i riquadri 🧪 di un capitolo (righe ">" consecutive). */
export function extractExercises(markdown: string): string[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const found: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*>\s*🧪/.test(lines[i]!)) continue
    const block: string[] = []
    while (i < lines.length && /^\s*>/.test(lines[i]!)) block.push(lines[i++]!.replace(/^\s*>\s?/, ''))
    found.push(block.join('\n').replace(/^\s*🧪\s*/, '').trim())
  }
  return found
}

function firstHeading(markdown: string): string | null {
  return /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? null
}

function shortTitle(text: string): string {
  const firstLine = text.split('\n')[0]!.replace(/[*`_]/g, '').trim()
  const sentence = firstLine.split(/(?<=[.:;!?])\s/)[0]!.replace(/[.:;]$/, '')
  return sentence.length > 70 ? sentence.slice(0, 67).trimEnd() + '…' : sentence
}

function comment(language: ExerciseLanguage, lines: string[]): string {
  if (language === 'sql') return lines.map((l) => `-- ${l}`).join('\n')
  if (language === 'html') return `<!--\n${lines.map((l) => `  ${l}`).join('\n')}\n-->`
  return lines.map((l) => `// ${l}`).join('\n')
}

export function starterFor(language: ExerciseLanguage, title: string): Record<string, string> {
  const header = comment(language, [`Esercizio: ${title}`, 'Scrivi qui la tua soluzione, poi premi «Ho finito» o chiedi al tutor di controllarla.'])
  switch (language) {
    case 'html':
      return {
        'index.html': `<!DOCTYPE html>\n<html lang="it">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${title.replace(/[<>&"]/g, '')}</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n${header}\n\n</body>\n</html>\n`,
        'style.css': '/* I tuoi stili */\n'
      }
    case 'sql':
      return { [DEFAULT_ENTRY.sql]: `${header}\n\n` }
    default:
      return { [DEFAULT_ENTRY[language]]: `${header}\n\nconsole.log('Pronto!')\n` }
  }
}

export function importManual(folderName: string, files: ManualFile[]): Course {
  const language = manualLanguage(folderName)
  const courseId = `manuale-${slugify(folderName)}`
  const chapters = files
    .filter((f) => isManualChapter(f.name))
    .map((f) => ({ ...f, number: Number(CHAPTER.exec(f.name)![1]) }))
    .sort((a, b) => a.number - b.number)
  const readme = files.find((f) => /^readme\.md$/i.test(f.name))?.content ?? ''
  const description =
    readme
      .replace(/\r\n/g, '\n')
      .split('\n\n')
      .map((p) => p.trim())
      .find((p) => p && !p.startsWith('#') && !p.startsWith('>') && !p.startsWith('|')) ?? `Lezioni ed esercizi dal manuale «${folderName}».`

  const lessons: Lesson[] = chapters.map((chapter) => {
    const content = chapter.content.replace(/\r\n/g, '\n')
    const title = firstHeading(content) ?? CHAPTER.exec(chapter.name)![2]!.trim()
    const number = String(chapter.number).padStart(2, '0')
    const exercises: Exercise[] = extractExercises(content).map((text, index) => {
      const exLanguage = exerciseLanguage(text, language)
      const exTitle = shortTitle(text) || `Esercizio ${index + 1}`
      const starter = starterFor(exLanguage, exTitle)
      return {
        id: `cap${number}-es${index + 1}`,
        title: exTitle,
        language: exLanguage,
        chapter: `${folderName}, cap. ${chapter.number}`,
        entry: Object.keys(starter)[0]!,
        body: text,
        hints: [],
        starter,
        solution: {},
        check: { tipo: 'autovalutazione' }
      }
    })
    return { id: `cap${number}`, title, chapter: `Capitolo ${chapter.number}`, body: content.replace(/^#\s+.+\n+/, ''), exercises }
  })

  return {
    id: courseId,
    title: folderName,
    description: description.replace(/\s+/g, ' ').slice(0, 300),
    origin: 'importato',
    lessons: lessons.length,
    exercises: lessons.reduce((n, l) => n + l.exercises.length, 0),
    lessonList: lessons
  }
}
