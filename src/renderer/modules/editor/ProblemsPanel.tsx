// Elenco degli errori e avvisi del codice (TypeScript, CSS, JSON…), aggiornato in tempo reale.
import { useEffect, useState } from 'react'
import { AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { executeCommand } from '../../workbench/commands'
import { workbench } from '../../workbench/store'
import { t } from '../../i18n'
import { monaco } from './monaco-setup'
import { pathFor } from './models'

interface Problem {
  path: string
  line: number
  column: number
  message: string
  severity: 'error' | 'warning' | 'info'
  source?: string
}

function collect(): Problem[] {
  const problems: Problem[] = []
  for (const marker of monaco.editor.getModelMarkers({})) {
    const path = pathFor(marker.resource)
    if (path === null) continue
    const severity = marker.severity === monaco.MarkerSeverity.Error ? 'error' : marker.severity === monaco.MarkerSeverity.Warning ? 'warning' : 'info'
    if (marker.severity === monaco.MarkerSeverity.Hint) continue
    problems.push({ path, line: marker.startLineNumber, column: marker.startColumn, message: typeof marker.message === 'string' ? marker.message : String(marker.message), severity, source: marker.source })
  }
  const rank = { error: 0, warning: 1, info: 2 }
  return problems.sort((a, b) => a.path.localeCompare(b.path) || rank[a.severity] - rank[b.severity] || a.line - b.line)
}

/** Tiene aggiornato il contatore nella barra di stato anche a pannello chiuso. */
export function trackProblemCounts(): void {
  const update = () => {
    const problems = collect()
    workbench().setProblems({
      errors: problems.filter((p) => p.severity === 'error').length,
      warnings: problems.filter((p) => p.severity === 'warning').length
    })
  }
  monaco.editor.onDidChangeMarkers(update)
  update()
}

export function ProblemsPanel() {
  const [problems, setProblems] = useState<Problem[]>(collect)
  useEffect(() => {
    const sub = monaco.editor.onDidChangeMarkers(() => setProblems(collect()))
    setProblems(collect())
    return () => sub.dispose()
  }, [])

  if (problems.length === 0) return <div className="empty-state">{t('problems.none')}</div>

  let lastPath = ''
  return (
    <div className="panel">
      <div className="panel-body problems">
        {problems.map((problem, index) => {
          const header = problem.path !== lastPath
          lastPath = problem.path
          return (
            <div key={index}>
              {header && <div className="problem-file">{problem.path}</div>}
              <button className="problem-row" onClick={() => executeCommand('editor.reveal', { path: problem.path, line: problem.line, column: problem.column })}>
                {problem.severity === 'error' ? <AlertCircle size={14} color="var(--danger)" /> : problem.severity === 'warning' ? <AlertTriangle size={14} color="var(--warning)" /> : <Info size={14} color="var(--info)" />}
                <span className="message">{problem.message}</span>
                <span className="where">
                  {problem.source ? `${problem.source} · ` : ''}
                  {t('problems.position', { line: problem.line, column: problem.column })}
                </span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
