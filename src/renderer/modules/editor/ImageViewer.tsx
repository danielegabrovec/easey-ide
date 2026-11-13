// Visualizzatore delle immagini del progetto (png, jpg, gif, webp, svg, avif, ico): al posto dell'avviso
// «non è un file di testo», l'immagine con le sue dimensioni, adattata al pannello o a grandezza reale.
// Il file arriva dal protocollo dell'anteprima (stessa origine già ammessa per le immagini nella CSP).
import { useEffect, useState } from 'react'
import type { IDockviewPanelProps } from 'dockview'
import { Maximize, Scan } from 'lucide-react'
import { basenameOf, extensionOf } from '@shared/paths'
import { ide } from '../../ipc'
import { on } from '../../workbench/events'
import { t } from '../../i18n'

export const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'ico', 'bmp'])
export const isImageFile = (path: string): boolean => IMAGE_EXTENSIONS.has(extensionOf(path))

export function ImageViewer({ params }: IDockviewPanelProps<{ path: string }>) {
  const path = params.path
  const [url, setUrl] = useState<string | null>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [failed, setFailed] = useState(false)
  const [actual, setActual] = useState(false)

  useEffect(() => {
    let disposed = false
    const load = () =>
      void ide.invoke('preview:url', path).then(
        (next) => {
          if (disposed) return
          setFailed(false)
          setUrl(next)
        },
        () => !disposed && setFailed(true)
      )
    load()
    // Il file cambia su disco (sostituito o modificato fuori dall'IDE): si ricarica.
    const off = on('files:changed', ({ paths }) => paths.includes(path) && load())
    return () => {
      disposed = true
      off()
    }
  }, [path])

  return (
    <div className="panel image-viewer" data-testid="image-viewer" data-image-path={path}>
      <div className="panel-toolbar">
        <span className="title">{basenameOf(path)}</span>
        {size && (
          <span className="hint" data-testid="image-size">
            {t('image.size', { width: size.width, height: size.height })}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn ghost" onClick={() => setActual((v) => !v)} aria-pressed={actual} data-testid="image-zoom">
          {actual ? <Scan size={14} /> : <Maximize size={14} />} {actual ? t('image.fit') : t('image.actual')}
        </button>
      </div>
      <div className={`image-stage${actual ? ' actual' : ''}`}>
        {failed ? (
          <div className="empty-state">{t('image.error', { path })}</div>
        ) : (
          url && (
            <img
              src={url}
              alt={basenameOf(path)}
              onLoad={(e) => setSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
              onError={() => setFailed(true)}
            />
          )
        )}
      </div>
    </div>
  )
}
