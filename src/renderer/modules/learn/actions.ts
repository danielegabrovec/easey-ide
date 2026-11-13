// Azioni della didattica: iniziare, verificare, suggerimenti, soluzione, tutor AI, importazione.
import type { CheckResult, Exercise, HtmlRule } from '@shared/contracts/learn'
import { checkHtmlRules, inlineDocument, type DomProbe } from '@shared/learn/checks'
import { ide } from '../../ipc'
import { executeCommand } from '../../workbench/commands'
import { notify, notifyError } from '../../workbench/notifications'
import { workbench } from '../../workbench/store'
import { confirm } from '../../ui/dialogs'
import { t } from '../../i18n'
import { currentExercise, useLearn } from './learn-store'

const courseId = () => useLearn.getState().course?.id ?? null

/** true se il progetto aperto è la cartella di lavoro di questo esercizio. */
export function isExerciseOpen(exercise: Exercise): boolean {
  const root = workbench().project?.root.replace(/\\/g, '/') ?? ''
  const id = courseId()
  return !!id && root.endsWith(`/${id}/${exercise.id}`)
}

export async function startExercise(exercise: Exercise, reset = false): Promise<void> {
  const id = courseId()
  if (!id) return
  try {
    const root = await ide.invoke('learn:start', id, exercise.id, reset)
    if (reset) {
      await useLearn.getState().record(exercise.id, { kind: 'reset' })
      useLearn.getState().setResult(exercise.id, null)
      useLearn.getState().toggleSolution(exercise.id, false)
    }
    if (!isExerciseOpen(exercise) || reset) {
      const opened = await executeCommand('workspace.openPath', { root })
      if (opened === false) return
    }
    useLearn.setState({ progress: await ide.invoke('learn:progress', id) })
    await executeCommand('editor.open', { path: exercise.entry })
  } catch (error) {
    notifyError(error)
  }
}

/** Verifica HTML/CSS: documento statico in un iframe nascosto (niente script), regole sugli stili calcolati. */
async function checkHtml(files: Record<string, string>, entry: string, rules: HtmlRule[]): Promise<CheckResult> {
  const html = files[entry]
  if (html === undefined) return { passed: false, items: [], error: t('learn.missingFile', { file: entry }) }
  const baseDir = entry.includes('/') ? entry.slice(0, entry.lastIndexOf('/')) : ''
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-same-origin')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:1024px;height:768px;border:0;visibility:hidden'
  document.body.appendChild(frame)
  try {
    await new Promise<void>((resolve) => {
      frame.onload = () => resolve()
      frame.srcdoc = inlineDocument(html, files, baseDir)
    })
    const doc = frame.contentDocument
    const win = frame.contentWindow
    if (!doc || !win) return { passed: false, items: [], error: t('learn.noDocument') }
    const probe: DomProbe<Element> = {
      query: (selector) => [...doc.querySelectorAll(selector)],
      text: (el) => el.textContent ?? '',
      attribute: (el, name) => el.getAttribute(name),
      computed: (el, property) => win.getComputedStyle(el).getPropertyValue(property),
      normalize: (property, value) => {
        const probeEl = doc.createElement('div')
        probeEl.style.setProperty(property, value)
        doc.body.appendChild(probeEl)
        const result = win.getComputedStyle(probeEl).getPropertyValue(property)
        probeEl.remove()
        return result
      }
    }
    return checkHtmlRules(rules, probe)
  } finally {
    frame.remove()
  }
}

export async function checkExercise(exercise: Exercise | null = currentExercise()): Promise<CheckResult | null> {
  const id = courseId()
  if (!exercise || !id) return null
  const store = useLearn.getState()
  if (exercise.check.tipo === 'autovalutazione') {
    notify(t('learn.selfCheckShort'), 'info')
    return null
  }
  store.setChecking(true)
  try {
    await executeCommand('editor.saveAll')
    const result =
      exercise.check.tipo === 'html'
        ? await checkHtml(await ide.invoke('learn:files', id, exercise.id), exercise.entry, exercise.check.regole)
        : await ide.invoke('learn:check', id, exercise.id)
    store.setResult(exercise.id, result)
    await store.record(exercise.id, { kind: 'attempt', passed: result.passed })
    if (result.passed) notify(t('learn.passed'), 'success')
    return result
  } catch (error) {
    notifyError(error)
    return null
  } finally {
    store.setChecking(false)
  }
}

export async function showHint(exercise: Exercise): Promise<void> {
  const seen = useLearn.getState().progress[exercise.id]?.suggerimenti ?? 0
  if (seen >= exercise.hints.length) return
  await useLearn.getState().record(exercise.id, { kind: 'hint' })
}

export async function revealSolution(exercise: Exercise): Promise<void> {
  const progress = useLearn.getState().progress[exercise.id]
  const earned = (progress?.tentativi ?? 0) > 0 || (progress?.suggerimenti ?? 0) >= exercise.hints.length || progress?.stato === 'superato'
  if (!progress?.soluzione && !earned) {
    const ok = await confirm({ title: t('learn.solution'), message: t('learn.solutionConfirm'), confirmLabel: t('learn.solutionShow') })
    if (!ok) return
  }
  if (!progress?.soluzione) await useLearn.getState().record(exercise.id, { kind: 'solution' })
  useLearn.getState().toggleSolution(exercise.id, true)
}

export async function markDone(exercise: Exercise): Promise<void> {
  await useLearn.getState().record(exercise.id, { kind: 'done' })
  notify(t('learn.markedDone'), 'success')
}

/** Il tutor AI riceve consegna, file dello studente ed esito della verifica; non deve dare la soluzione. */
export async function askTutor(exercise: Exercise, mode: 'aiuto' | 'controllo'): Promise<void> {
  const id = courseId()
  if (!id) return
  let files: Record<string, string> = {}
  try {
    files = await ide.invoke('learn:files', id, exercise.id)
  } catch {
    /* esercizio non ancora iniziato */
  }
  const code = Object.entries(files)
    .slice(0, 6)
    .map(([path, content]) => `File ${path}:\n\`\`\`${path.split('.').pop()}\n${content.slice(0, 6000)}\n\`\`\``)
    .join('\n\n')
  const result = useLearn.getState().results[exercise.id]
  const outcome = result
    ? [result.error ? `Errore: ${result.error}` : '', ...result.items.map((i) => `${i.ok ? '✓' : '✗'} ${i.descrizione}${i.dettaglio ? ` — ${i.dettaglio}` : ''}`)].filter(Boolean).join('\n')
    : ''
  const prompt = [
    mode === 'aiuto' ? t('learn.tutorPrompt') : t('learn.reviewPrompt'),
    `\n## Consegna: ${exercise.title}\n${exercise.body}`,
    code ? `\n## Il lavoro dello studente\n${code}` : '\n(Lo studente non ha ancora scritto codice.)',
    outcome ? `\n## Esito della verifica automatica\n${outcome}` : ''
  ].join('\n')
  await executeCommand('ai.ask', { prompt, display: `${mode === 'aiuto' ? t('learn.tutor') : t('learn.tutorReview')} · ${exercise.title}` })
}

export async function importCourse(kind: 'manuale' | 'pacchetto'): Promise<void> {
  try {
    const summary = await ide.invoke('learn:import', kind)
    if (!summary) return
    await useLearn.getState().loadCatalog()
    notify(t('learn.imported', { title: summary.title, lessons: summary.lessons, exercises: summary.exercises }), 'success')
  } catch (error) {
    notifyError(error)
  }
}

export async function removeCourse(courseIdToRemove: string, title: string): Promise<void> {
  const ok = await confirm({ title: t('learn.remove'), message: t('learn.confirmRemove', { title }), confirmLabel: t('learn.remove'), danger: true })
  if (!ok) return
  try {
    await ide.invoke('learn:remove', courseIdToRemove)
    await useLearn.getState().loadCatalog()
  } catch (error) {
    notifyError(error)
  }
}
