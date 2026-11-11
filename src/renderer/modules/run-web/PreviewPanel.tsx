// Anteprima della pagina web in un iframe isolato, con simulazione di dispositivi.
import { useEffect, useRef, useState } from 'react'
import { RotateCw, Play } from 'lucide-react'
import { executeCommand } from '../../workbench/commands'
import { useWorkbench } from '../../workbench/store'
import { t } from '../../i18n'
import { registerFrame, usePreview, VIEWPORTS } from './preview-state'

export function PreviewPanel() {
  const url = usePreview((s) => s.url)
  const entry = usePreview((s) => s.entry)
  const viewportId = usePreview((s) => s.viewport)
  const setViewport = usePreview((s) => s.setViewport)
  const project = useWorkbench((s) => s.project)
  const autoRun = useWorkbench((s) => s.settings.autoRun)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState({ width: 0, height: 0 })

  useEffect(() => {
    registerFrame(frameRef.current)
    return () => registerFrame(null)
  }, [url])

  useEffect(() => {
    const element = stageRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setStage({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const viewport = VIEWPORTS.find((v) => v.id === viewportId) ?? VIEWPORTS[0]!
  const scale = viewport.width && viewport.height && stage.width > 0 ? Math.min(1, (stage.width - 24) / viewport.width, (stage.height - 24) / viewport.height) : 1

  return (
    <div className="panel preview-panel">
      <div className="panel-toolbar">
        <button className="icon-btn" title={t('preview.reload')} disabled={!url} onClick={() => executeCommand('run.preview', { entry: entry ?? undefined })} data-testid="preview-reload">
          <RotateCw size={14} />
        </button>
        <div className="address" title={entry ?? ''}>
          {entry ? `/${entry}` : t('preview.none')}
        </div>
        <select value={viewportId} onChange={(e) => setViewport(e.target.value)} aria-label={t('preview.device')}>
          {VIEWPORTS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
              {v.width ? ` ${v.width}×${v.height}` : ''}
            </option>
          ))}
        </select>
        <span className="hint" title={t('preview.autoRunHint')}>
          {autoRun ? t('preview.live') : ''}
        </span>
      </div>
      <div className={`preview-stage${viewport.width ? ' device' : ''}`} ref={stageRef}>
        {url ? (
          <div
            className="preview-frame-wrap"
            style={
              viewport.width && viewport.height
                ? { width: viewport.width, height: viewport.height, transform: `scale(${scale})`, transformOrigin: 'top center' }
                : { width: '100%', height: '100%' }
            }
          >
            <iframe
              ref={frameRef}
              key={url}
              src={url}
              title={t('preview.title')}
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"
              data-testid="preview-frame"
            />
          </div>
        ) : (
          <div className="empty-state">
            <div>
              <p>{!project ? t('preview.noProject') : project.config.run.mode === 'terminal' ? t('preview.consoleProject') : t('preview.hint')}</p>
              {project && (
                <button className="btn run" onClick={() => executeCommand('run.project')}>
                  <Play size={13} fill="currentColor" /> {t('toolbar.run')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
