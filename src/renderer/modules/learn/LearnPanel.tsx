// Pannello Lezioni: catalogo dei corsi → corso (lezioni ed esercizi) → esercizio (consegna, verifica, aiuti).
import { useEffect } from 'react'
import { ArrowLeft, BookOpen, Bot, Check, CheckCircle2, Circle, CircleDot, Eye, FolderInput, Lightbulb, Play, RotateCcw, ShieldCheck, Trash2, Upload, XCircle } from 'lucide-react'
import type { CodeBlockProps } from '../../ui/Markdown'
import { Markdown } from '../../ui/Markdown'
import type { Exercise, ExerciseState } from '@shared/contracts/learn'
import { useWorkbench } from '../../workbench/store'
import { confirm } from '../../ui/dialogs'
import { t } from '../../i18n'
import { askTutor, checkExercise, importCourse, isExerciseOpen, markDone, removeCourse, revealSolution, showHint, startExercise } from './actions'
import { currentExercise, useLearn } from './learn-store'

function Code({ language, code }: CodeBlockProps) {
  return (
    <pre className="learn-code" data-lang={language}>
      <code>{code}</code>
    </pre>
  )
}

const LANG_LABEL: Record<string, string> = { js: 'JavaScript', ts: 'TypeScript', html: 'HTML e CSS', sql: 'SQL' }

function StateIcon({ state }: { state: ExerciseState }) {
  if (state === 'superato') return <CheckCircle2 size={15} className="learn-state ok" aria-label={t('learn.stateDone')} />
  if (state === 'in-corso') return <CircleDot size={15} className="learn-state doing" aria-label={t('learn.stateDoing')} />
  return <Circle size={15} className="learn-state" aria-label={t('learn.stateNew')} />
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const percent = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="learn-progress" title={t('learn.progress', { done, total })}>
      <div className="learn-progress-bar">
        <div style={{ width: `${percent}%` }} />
      </div>
      <span>{t('learn.progress', { done, total })}</span>
    </div>
  )
}

function Catalog() {
  const courses = useLearn((s) => s.courses)
  const passed = useLearn((s) => s.passedByCourse)
  return (
    <div className="learn-scroll">
      <div className="learn-head">
        <h2>
          <BookOpen size={16} /> {t('learn.courses')}
        </h2>
      </div>
      <div className="learn-actions">
        <button className="btn" onClick={() => importCourse('manuale')} data-testid="learn-import-manual" title={t('cmd.learnImportManual')}>
          <FolderInput size={14} /> {t('learn.importManual')}
        </button>
        <button className="btn ghost" onClick={() => importCourse('pacchetto')} title={t('cmd.learnImportPack')}>
          <Upload size={14} /> {t('learn.importPack')}
        </button>
      </div>
      {courses.length === 0 && <p className="hint">{t('learn.noCourses')}</p>}
      <ul className="learn-courses">
        {courses.map((course) => (
          <li key={course.id}>
            <button className="learn-card" onClick={() => useLearn.getState().openCourse(course.id)} data-course={course.id}>
              <strong>{course.title}</strong>
              <span className="hint">{course.description}</span>
              <span className="learn-meta">
                {t('learn.counts', { lessons: course.lessons, exercises: course.exercises })}
                {course.origin === 'importato' && <em> · {t('learn.importedTag')}</em>}
              </span>
              <ProgressBar done={passed[course.id] ?? 0} total={course.exercises} />
            </button>
            {course.origin === 'importato' && (
              <button className="icon-btn learn-remove" title={t('learn.remove')} onClick={() => removeCourse(course.id, course.title)}>
                <Trash2 size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function CourseView() {
  const course = useLearn((s) => s.course)
  const progress = useLearn((s) => s.progress)
  if (!course) return null
  const all = course.lessonList.flatMap((l) => l.exercises)
  const done = all.filter((e) => progress[e.id]?.stato === 'superato').length
  const firstOpen = course.lessonList.find((l) => l.exercises.some((e) => progress[e.id]?.stato !== 'superato'))?.id ?? course.lessonList[0]?.id
  return (
    <div className="learn-scroll">
      <div className="learn-head">
        <button className="icon-btn" onClick={() => useLearn.getState().back()} title={t('learn.back')} data-testid="learn-back">
          <ArrowLeft size={16} />
        </button>
        <h2>{course.title}</h2>
      </div>
      <p className="hint">{course.description}</p>
      <ProgressBar done={done} total={all.length} />
      {course.lessonList.map((lesson, index) => (
        <details key={lesson.id} className="learn-lesson" open={lesson.id === firstOpen} data-lesson={lesson.id}>
          <summary>
            <span className="learn-lesson-n">{index + 1}</span>
            <span className="learn-lesson-title">{lesson.title}</span>
            {lesson.chapter && <span className="hint">{lesson.chapter}</span>}
          </summary>
          {lesson.body.trim() && <Markdown source={lesson.body} renderCode={Code} />}
          {lesson.exercises.length > 0 && (
            <ul className="learn-exercises">
              {lesson.exercises.map((exercise) => (
                <li key={exercise.id}>
                  <button onClick={() => useLearn.getState().openExercise(exercise.id)} data-exercise={exercise.id}>
                    <StateIcon state={progress[exercise.id]?.stato ?? 'nuovo'} />
                    <span>{exercise.title}</span>
                    <span className="learn-lang">{LANG_LABEL[exercise.language]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </details>
      ))}
    </div>
  )
}

function Results({ exercise }: { exercise: Exercise }) {
  const result = useLearn((s) => s.results[exercise.id])
  const attempts = useLearn((s) => s.progress[exercise.id]?.tentativi ?? 0)
  if (!result) return null
  const failed = result.items.filter((i) => !i.ok).length
  return (
    <section className={`learn-result ${result.passed ? 'ok' : 'ko'}`} data-testid="learn-result" data-passed={result.passed} data-attempts={attempts}>
      <h3>{result.passed ? t('learn.passed') : result.error ? t('learn.errorTitle') : t('learn.failed', { n: failed })}</h3>
      {result.error && <pre className="learn-error">{result.error}</pre>}
      <ul>
        {result.items.map((item, i) => (
          <li key={i} className={item.ok ? 'ok' : 'ko'}>
            {item.ok ? <Check size={14} /> : <XCircle size={14} />}
            <span>
              {item.descrizione}
              {item.dettaglio && <small>{item.dettaglio}</small>}
            </span>
          </li>
        ))}
      </ul>
      {result.output && (
        <details>
          <summary>{t('learn.output')}</summary>
          <pre className="learn-output">{result.output}</pre>
        </details>
      )}
    </section>
  )
}

function ExerciseView() {
  useWorkbench((s) => s.project?.root)
  const exerciseId = useLearn((s) => s.exerciseId)
  const progress = useLearn((s) => (s.exerciseId ? s.progress[s.exerciseId] : undefined))
  const checking = useLearn((s) => s.checking)
  const showSolution = useLearn((s) => (s.exerciseId ? !!s.showSolution[s.exerciseId] : false))
  const exercise = exerciseId ? currentExercise() : null
  if (!exercise) return null
  const open = isExerciseOpen(exercise)
  const hintsSeen = Math.min(progress?.suggerimenti ?? 0, exercise.hints.length)
  const selfCheck = exercise.check.tipo === 'autovalutazione'
  const hasSolution = Object.keys(exercise.solution).length > 0
  return (
    <div className="learn-scroll" data-testid="learn-exercise" data-exercise={exercise.id}>
      <div className="learn-head">
        <button className="icon-btn" onClick={() => useLearn.getState().back()} title={t('learn.back')} data-testid="learn-back">
          <ArrowLeft size={16} />
        </button>
        <h2>{exercise.title}</h2>
      </div>
      <div className="learn-meta">
        <StateIcon state={progress?.stato ?? 'nuovo'} />
        <span>{LANG_LABEL[exercise.language]}</span>
        {exercise.level && <span>· {exercise.level}</span>}
        {exercise.chapter && <span>· {exercise.chapter}</span>}
        {(progress?.tentativi ?? 0) > 0 && <span>· {t('learn.attempts', { n: progress!.tentativi })}</span>}
      </div>
      <Markdown source={exercise.body} renderCode={Code} />

      <div className="learn-actions">
        {!open ? (
          <button className="btn primary" onClick={() => startExercise(exercise)} data-testid="learn-start">
            <Play size={14} /> {progress && progress.stato !== 'nuovo' ? t('learn.reopen') : t('learn.start')}
          </button>
        ) : selfCheck ? (
          <button className="btn primary" onClick={() => markDone(exercise)} data-testid="learn-done">
            <Check size={14} /> {t('learn.done')}
          </button>
        ) : (
          <button className="btn primary" onClick={() => checkExercise(exercise)} disabled={checking} data-testid="learn-check" title={`${t('learn.check')} (F9)`}>
            <ShieldCheck size={14} /> {checking ? t('learn.checking') : t('learn.check')}
          </button>
        )}
        <button className="btn" onClick={() => askTutor(exercise, selfCheck ? 'controllo' : 'aiuto')} data-testid="learn-tutor">
          <Bot size={14} /> {selfCheck ? t('learn.tutorReview') : t('learn.tutor')}
        </button>
        {exercise.hints.length > 0 && (
          <button className="btn ghost" onClick={() => showHint(exercise)} disabled={hintsSeen >= exercise.hints.length} data-testid="learn-hint">
            <Lightbulb size={14} /> {t('learn.hint', { n: hintsSeen, total: exercise.hints.length })}
          </button>
        )}
        {hasSolution && (
          <button className="btn ghost" onClick={() => (showSolution ? useLearn.getState().toggleSolution(exercise.id, false) : revealSolution(exercise))} data-testid="learn-solution">
            <Eye size={14} /> {showSolution ? t('learn.solutionHide') : t('learn.solution')}
          </button>
        )}
        {open && (
          <button
            className="btn ghost"
            onClick={async () => {
              if (await confirm({ title: t('learn.reset'), message: t('learn.resetConfirm'), confirmLabel: t('learn.reset'), danger: true })) await startExercise(exercise, true)
            }}
            title={t('learn.reset')}
          >
            <RotateCcw size={14} /> {t('learn.reset')}
          </button>
        )}
      </div>
      {selfCheck && <p className="hint">{t('learn.selfCheck')}</p>}

      {hintsSeen > 0 && (
        <section className="learn-hints" data-testid="learn-hints">
          <h3>
            <Lightbulb size={14} /> {t('learn.hintsTitle')}
          </h3>
          <ol>
            {exercise.hints.slice(0, hintsSeen).map((hint, i) => (
              <li key={i}>
                <Markdown source={hint} renderCode={Code} />
              </li>
            ))}
          </ol>
        </section>
      )}

      <Results exercise={exercise} />

      {showSolution && (
        <section className="learn-solution" data-testid="learn-solution-code">
          <h3>
            <Eye size={14} /> {t('learn.solutionTitle')}
          </h3>
          {Object.entries(exercise.solution).map(([path, content]) => (
            <div key={path}>
              <div className="learn-file">{path}</div>
              <Code language={path.split('.').pop() ?? ''} code={content} />
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

export function LearnPanel() {
  const view = useLearn((s) => s.view)
  useEffect(() => {
    if (useLearn.getState().courses.length === 0) void useLearn.getState().loadCatalog()
  }, [])
  return (
    <div className="panel learn" data-testid="learn-panel">
      {view === 'catalogo' ? <Catalog /> : view === 'corso' ? <CourseView /> : <ExerciseView />}
    </div>
  )
}
