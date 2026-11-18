// Modulo Studio 3D: editor delle scene Three.js (`*.scene3d.json`) con il kit condiviso `scene3d`.
// Si apre da Esplora come gli altri editor speciali (registerFileOpener), «Nuova scena 3D» dal menu, dalla
// palette e dal tasto destro dell'albero; il designer chiede i file per la scena in pagina con
// `studio3d.prepareEmbed` (i moduli non si importano a vicenda).
import { useState } from 'react'
import { isScene3DPath, SCENE3D_EXTENSION, serializeScene3D } from '@shared/scene3d/model'
import { SCENE_PRESETS } from '@shared/scene3d/presets'
import { SCENE_FOLDER } from '@shared/designer/scene-embed'
import { basenameOf, filePaths, joinRelative } from '@shared/paths'
import { ide } from '../../ipc'
import { registerCommand } from '../../workbench/commands'
import { registerPanel, showPanel } from '../../workbench/layout'
import { registerFileOpener } from '../../workbench/openers'
import { notify, notifyError } from '../../workbench/notifications'
import { workbench } from '../../workbench/store'
import { Modal, openDialog } from '../../ui/dialogs'
import { t } from '../../i18n'
import { Studio3DPanel } from './Studio3DPanel'
import { prepareSceneEmbed } from './embed'

export function openStudio3D(path: string): void {
  showPanel({ id: `studio3d:${path}`, component: 'studio3d', title: `${t('panel.studio3d')} · ${basenameOf(path).replace(SCENE3D_EXTENSION, '')}`, area: 'center', params: { path }, renderer: 'always' })
}

/** Nome di file libero per una scena nuova nella cartella (`scene/stanza.scene3d.json`, poi `stanza-2`…). */
export function freeScenePath(dir: string, name: string): string {
  const clean = name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scena'
  const existing = new Set(filePaths(workbench().tree))
  for (let i = 1; ; i++) {
    const path = joinRelative(dir, `${clean}${i === 1 ? '' : `-${i}`}${SCENE3D_EXTENSION}`)
    if (!existing.has(path)) return path
  }
}

/** Crea il file della scena da una scena pronta e restituisce il percorso. */
export async function createScene(dir: string, name: string, presetId: string): Promise<string> {
  const preset = SCENE_PRESETS.find((p) => p.id === presetId) ?? SCENE_PRESETS[0]!
  const doc = preset.build()
  doc.name = name.trim() || preset.label
  const path = freeScenePath(dir, name || preset.label)
  await ide.invoke('workspace:createFile', path, serializeScene3D(doc))
  return path
}

function NewSceneDialog({ dir, close, onCreated }: { dir: string; close: () => void; onCreated?: (path: string) => void }) {
  const [preset, setPreset] = useState('vetrina')
  const [name, setName] = useState('')
  const create = async () => {
    try {
      const path = await createScene(dir, name || (SCENE_PRESETS.find((p) => p.id === preset)?.label ?? 'Scena'), preset)
      close()
      openStudio3D(path)
      notify(t('studio3d.created', { path }), 'success')
      onCreated?.(path)
    } catch (error) {
      notifyError(error)
    }
  }
  return (
    <Modal
      title={t('studio3d.newTitle')}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" onClick={() => void create()} data-testid="s3-create">
            {t('studio3d.create')}
          </button>
        </>
      }
    >
      <div className="template-grid" role="radiogroup">
        {SCENE_PRESETS.map((p) => (
          <button key={p.id} role="radio" aria-checked={preset === p.id} className={`template-card${preset === p.id ? ' selected' : ''}`} onClick={() => setPreset(p.id)} data-scene-preset={p.id}>
            <span>
              <strong>{p.label}</strong>
              <span className="hint" style={{ display: 'block', marginTop: 3 }}>
                {p.description}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="field">
        <label>{t('studio3d.name')}</label>
        <input value={name} placeholder={SCENE_PRESETS.find((p) => p.id === preset)?.label} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void create()} spellCheck={false} data-testid="s3-new-name" />
      </div>
    </Modal>
  )
}

export function activateStudio3D(): void {
  registerPanel('studio3d', Studio3DPanel)
  const category = t('category.studio3d')
  const hasProject = () => workbench().project !== null
  registerCommand<{ dir?: string }>({
    id: 'studio3d.new',
    title: t('studio3d.new'),
    category,
    when: hasProject,
    run: (args) => openDialog((close) => <NewSceneDialog dir={args?.dir ?? SCENE_FOLDER} close={close} />)
  })
  registerCommand<{ path: string }>({ id: 'studio3d.open', title: 'studio3d.open', palette: false, run: (args) => args && openStudio3D(args.path) })
  // Per il blocco «Scena 3D» del designer: Three nel progetto, modulo generato e immagine della scena.
  // Restituisce true solo se tutto è pronto: un errore (mostrato da executeCommand) ferma l'inserimento.
  registerCommand<{ path: string }>({
    id: 'studio3d.prepareEmbed',
    title: 'studio3d.prepareEmbed',
    palette: false,
    run: async (args) => {
      if (!args) return false
      await prepareSceneEmbed(args.path)
      return true
    }
  })
  // Scena nuova senza dialogo (dal designer): restituisce il percorso del file creato.
  registerCommand<{ dir: string; name: string; preset?: string }>({ id: 'studio3d.createScene', title: 'studio3d.createScene', palette: false, run: async (args) => (args ? await createScene(args.dir, args.name, args.preset ?? 'vetrina') : null) })
  registerFileOpener({ id: 'studio3d', matches: isScene3DPath, command: 'studio3d.open' })
}
