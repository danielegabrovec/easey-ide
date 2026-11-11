// Stato della didattica: catalogo dei corsi, corso aperto, esercizio selezionato, esiti delle verifiche.
import { create } from 'zustand'
import type { CheckResult, Course, CourseProgress, CourseSummary, Exercise, LearnEvent } from '@shared/contracts/learn'
import { ide } from '../../ipc'

export type LearnView = 'catalogo' | 'corso' | 'esercizio'

interface LearnState {
  view: LearnView
  courses: CourseSummary[]
  /** Esercizi superati per corso (per le barre del catalogo). */
  passedByCourse: Record<string, number>
  course: Course | null
  progress: CourseProgress
  exerciseId: string | null
  results: Record<string, CheckResult>
  checking: boolean
  /** Esercizi la cui soluzione è mostrata nel pannello. */
  showSolution: Record<string, boolean>

  loadCatalog: () => Promise<void>
  openCourse: (courseId: string) => Promise<void>
  openExercise: (exerciseId: string) => void
  back: () => void
  record: (exerciseId: string, event: LearnEvent) => Promise<void>
  setResult: (exerciseId: string, result: CheckResult | null) => void
  setChecking: (checking: boolean) => void
  toggleSolution: (exerciseId: string, show: boolean) => void
}

const countPassed = (progress: CourseProgress) => Object.values(progress).filter((p) => p.stato === 'superato').length

export const useLearn = create<LearnState>((set, get) => ({
  view: 'catalogo',
  courses: [],
  passedByCourse: {},
  course: null,
  progress: {},
  exerciseId: null,
  results: {},
  checking: false,
  showSolution: {},

  loadCatalog: async () => {
    const courses = await ide.invoke('learn:list')
    const passed: Record<string, number> = {}
    await Promise.all(courses.map(async (c) => (passed[c.id] = countPassed(await ide.invoke('learn:progress', c.id)))))
    set({ courses, passedByCourse: passed })
  },
  openCourse: async (courseId) => {
    const [course, progress] = await Promise.all([ide.invoke('learn:course', courseId), ide.invoke('learn:progress', courseId)])
    set({ course, progress, view: 'corso', exerciseId: null })
  },
  openExercise: (exerciseId) => set({ exerciseId, view: 'esercizio' }),
  back: () => {
    const { view } = get()
    if (view === 'esercizio') set({ view: 'corso', exerciseId: null })
    else {
      set({ view: 'catalogo', course: null })
      void get().loadCatalog()
    }
  },
  record: async (exerciseId, event) => {
    const course = get().course
    if (!course) return
    const progress = await ide.invoke('learn:record', course.id, exerciseId, event)
    set((state) => ({ progress, passedByCourse: { ...state.passedByCourse, [course.id]: countPassed(progress) } }))
  },
  setResult: (exerciseId, result) =>
    set((state) => {
      const results = { ...state.results }
      if (result) results[exerciseId] = result
      else delete results[exerciseId]
      return { results }
    }),
  setChecking: (checking) => set({ checking }),
  toggleSolution: (exerciseId, show) => set((state) => ({ showSolution: { ...state.showSolution, [exerciseId]: show } }))
}))

export function currentExercise(): Exercise | null {
  const { course, exerciseId } = useLearn.getState()
  return course?.lessonList.flatMap((l) => l.exercises).find((e) => e.id === exerciseId) ?? null
}
