// Barra comune agli editor visuali: destinazione, pagina collegata, passi evidenziati, Esegui, Converti in codice.
import { useEffect, useState } from 'react'
import { Columns2, FileCode2, Link2, Play } from 'lucide-react'
import { toggleSplitCode } from '../../workbench/split-code'
import { useCodeSideOpen } from './code-side'
import type { VisualProgram, VisualTarget } from '@shared/visual/program'
import { generatedPath } from '@shared/visual/program'
import { ide } from '../../ipc'
import { executeCommand } from '../../workbench/commands'
import { notify, notifyError } from '../../workbench/notifications'
import { t } from '../../i18n'
import { htmlPages, linkedPage, linkToPage } from './project-files'

interface Props {
  path: string
  program: VisualProgram
  /** Codice senza i segnali dei passi, per "Converti in codice". */
  cleanCode: string
  allowConsole: boolean
  onChange: (program: VisualProgram) => void
  /** Scrive subito su disco programma e codice (prima di eseguire). */
  flush: () => Promise<void>
}

export function VisualToolbar({ path, program, cleanCode, allowConsole, onChange, flush }: Props) {
  const split = useCodeSideOpen(`visual:${path}`)
  const [page, setPage] = useState<string | null>(null)
  const [pages, setPages] = useState<string[]>([])

  useEffect(() => {
    setPages(htmlPages())
    void linkedPage(path).then(setPage)
  }, [path])

  const run = async () => {
    try {
      await flush()
      if (program.target === 'console') {
        await executeCommand('run.fileInTerminal', { path: generatedPath(path) })
        return
      }
      let target = page
      if (!target) {
        target = pages[0] ?? null
        if (!target) {
          notify(t('visual.noPage'), 'error')
          return
        }
        await linkToPage(path, target)
        setPage(target)
        notify(t('visual.linked', { page: target }), 'success')
      }
      await executeCommand('run.preview', { entry: target })
    } catch (error) {
      notifyError(error)
    }
  }

  const eject = async () => {
    const target = generatedPath(path).replace(/\.generato\.js$/, '.js')
    try {
      const body = cleanCode
        .split('\n')
        .filter((line, index) => !(index < 3 && line.startsWith('//')))
        .join('\n')
        .replace(/^\n+/, '')
      await ide.invoke('workspace:createFile', target, `// Convertito dal programma visuale ${path}: ora puoi modificarlo liberamente.\n\n${body}`)
      await executeCommand('editor.open', { path: target })
      notify(t('visual.ejected', { path: target }), 'success')
    } catch (error) {
      notifyError(error)
    }
  }

  return (
    <div className="panel-toolbar">
      {allowConsole && (
        <div className="segmented">
          {(['pagina', 'console'] as VisualTarget[]).map((target) => (
            <button key={target} className={program.target === target ? 'active' : undefined} onClick={() => onChange({ ...program, target })} data-testid={`visual-target-${target}`}>
              {target === 'pagina' ? t('visual.targetPage') : t('visual.targetConsole')}
            </button>
          ))}
        </div>
      )}
      {program.target === 'pagina' && (
        <>
          <Link2 size={13} color="var(--text-muted)" />
          <select
            value={page ?? ''}
            onChange={async (e) => {
              const chosen = e.target.value
              if (!chosen) return
              await linkToPage(path, chosen)
              setPage(chosen)
              notify(t('visual.linked', { page: chosen }), 'success')
            }}
            title={t('visual.pageHint')}
          >
            <option value="">{t('visual.notLinked')}</option>
            {pages.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 4 }} title={t('visual.highlightHint')}>
            <input type="checkbox" checked={program.highlight} onChange={(e) => onChange({ ...program, highlight: e.target.checked })} />
            {t('visual.highlight')}
          </label>
        </>
      )}
      <span style={{ flex: 1 }} />
      <button className={`btn ghost${split ? ' active' : ''}`} onClick={() => void toggleSplitCode(`visual:${path}`)} title={t('split.buttonHint')} aria-pressed={split} data-testid="split-code">
        <Columns2 size={14} /> {t('split.button')}
      </button>
      <button className="btn ghost" onClick={eject} title={t('visual.ejectHint')}>
        <FileCode2 size={14} /> {t('visual.eject')}
      </button>
      <button className="btn run" onClick={run} data-testid="visual-run">
        <Play size={12} fill="currentColor" /> {t('toolbar.run')}
      </button>
    </div>
  )
}
