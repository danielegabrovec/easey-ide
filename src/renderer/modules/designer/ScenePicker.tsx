// «Quale scena 3D metto nella pagina?»: tutte le scene del progetto (ricerca + elenco che scorre) o una nuova.
import { useState } from 'react'
import { Box, Plus } from 'lucide-react'
import { sceneChoices } from '@shared/designer/scene-embed'
import { SCENE3D_EXTENSION } from '@shared/scene3d/model'
import { basenameOf, dirnameOf } from '@shared/paths'
import { Modal, openDialog } from '../../ui/dialogs'
import { t } from '../../i18n'

function ScenePicker({ scenes, done }: { scenes: string[]; done: (choice: string | null) => void }) {
  const [query, setQuery] = useState('')
  const shown = sceneChoices(scenes, query)
  return (
    <Modal
      title={t('designer.sceneChooseTitle')}
      onClose={() => done(null)}
      footer={
        <>
          <button className="btn" onClick={() => done(null)}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" onClick={() => done('')} data-testid="scene-new">
            <Plus size={14} /> {t('designer.sceneNew')}
          </button>
        </>
      }
    >
      <p className="hint">{t('designer.sceneChooseMessage')}</p>
      {scenes.length > 0 && (
        <>
          <input className="scene-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('designer.sceneSearch')} aria-label={t('designer.sceneSearch')} autoFocus data-testid="scene-search" />
          <div className="scene-list" role="listbox" aria-label={t('designer.sceneChooseTitle')}>
            {shown.map((scene) => (
              <button key={scene} role="option" aria-selected={false} className="scene-option" onClick={() => done(scene)} data-testid={`scene-pick-${basenameOf(scene)}`}>
                <Box size={14} />
                <span className="scene-name">{basenameOf(scene).replace(SCENE3D_EXTENSION, '')}</span>
                <span className="hint">{dirnameOf(scene) || '/'}</span>
              </button>
            ))}
            {!shown.length && <div className="hint">{t('designer.sceneNone')}</div>}
          </div>
        </>
      )}
    </Modal>
  )
}

/** La scena scelta (percorso), '' = nuova, null = annullato. */
export function pickScene(scenes: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    openDialog((close) => (
      <ScenePicker
        scenes={scenes}
        done={(choice) => {
          close()
          resolve(choice)
        }}
      />
    ))
  })
}
