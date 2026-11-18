// Scheda «Manuale» nella colonna «Impara» della schermata iniziale: il corso su cui stai lavorando, con
// l'avanzamento vero (esercizi superati), e un clic per riprenderlo.
import { useEffect } from 'react'
import { executeCommand } from '../../workbench/commands'
import { t } from '../../i18n'
import { useLearn } from './learn-store'

export function StartManualCard() {
  const courses = useLearn((s) => s.courses)
  const passed = useLearn((s) => s.passedByCourse)
  useEffect(() => {
    if (useLearn.getState().courses.length === 0) void useLearn.getState().loadCatalog().catch(() => undefined)
  }, [])
  // Il corso già cominciato e più avanti; altrimenti il primo.
  const course = [...courses].sort((a, b) => (passed[b.id] ?? 0) - (passed[a.id] ?? 0))[0]
  const done = course ? (passed[course.id] ?? 0) : 0
  const total = course?.exercises ?? 0
  const open = async () => {
    await executeCommand('learn.show')
    if (course) await useLearn.getState().openCourse(course.id)
  }
  return (
    <button className="start-card book" onClick={() => void open()} data-testid="start-manual">
      <strong>{t('panel.learn')}</strong>
      <span>{course ? (done > 0 ? t('start.manualResume', { course: course.title }) : t('start.manualBegin', { course: course.title })) : t('start.manualEmpty')}</span>
      {course && total > 0 && (
        <>
          <div className="start-bar">
            <i style={{ width: `${Math.round((done / total) * 100)}%` }} />
          </div>
          <span className="meta">{t('start.manualProgress', { done, total })}</span>
        </>
      )}
    </button>
  )
}
