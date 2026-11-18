// File che servono a una scena 3D dentro le pagine: Three nel progetto (`vendor/three/`, copiato una
// volta), il modulo generato accanto alla scena (`x.scene3d.js`) e la sua immagine per il designer
// (`x.scene3d.svg`). Lo Studio li rifà a ogni salvataggio della scena (solo se la scena è usata in una pagina,
// cioè se il modulo esiste); il blocco «Scena 3D» del designer li chiede con il comando `studio3d.prepareEmbed`.
import { generateScene3DModule } from '@shared/scene3d/codegen'
import { parseScene3D, type Scene3DDocument } from '@shared/scene3d/model'
import { isAlreadyExistsError, sceneImagePath, sceneImageSvg, sceneModulePath, THREE_FILES, THREE_VENDOR_DIR, threeImportFor } from '@shared/designer/scene-embed'
import { filePaths } from '@shared/paths'
import { ide } from '../../ipc'
import { workbench } from '../../workbench/store'
import { renderSceneSnapshot } from './viewport'

/** Il sorgente dei file di Three, letto dal pacchetto installato (fuori dagli `exports`: percorso relativo). */
async function threeSource(file: (typeof THREE_FILES)[number]): Promise<string> {
  if (file === 'three.module.js') return (await import('../../../../node_modules/three/build/three.module.js?raw')).default
  return (await import('../../../../node_modules/three/build/three.core.js?raw')).default
}

/** Copia Three nel progetto se manca (le pagine lo importano da lì, mai da una CDN). */
export async function ensureThreeVendor(): Promise<void> {
  const existing = new Set(filePaths(workbench().tree))
  for (const file of THREE_FILES) {
    const path = `${THREE_VENDOR_DIR}/${file}`
    if (existing.has(path)) continue
    try {
      await ide.invoke('workspace:createFile', path, await threeSource(file))
    } catch (error) {
      // C'è già (albero non ancora aggiornato): va bene. Ogni altro errore ferma l'inserimento della scena.
      if (!isAlreadyExistsError(error)) throw error
    }
  }
}

/** Il modulo generato esiste? (= la scena è usata in una pagina e va tenuta aggiornata) */
export const hasSceneModule = (scenePath: string): boolean => filePaths(workbench().tree).includes(sceneModulePath(scenePath))

/** Riscrive il modulo e l'immagine della scena. */
export async function writeSceneOutputs(scenePath: string, doc: Scene3DDocument): Promise<void> {
  const generated = generateScene3DModule(doc, { threeImport: threeImportFor(scenePath), sourcePath: scenePath, generator: 'Easey IDE' })
  await ide.invoke('workspace:writeFile', sceneModulePath(scenePath), generated.code)
  await ide.invoke('workspace:writeFile', sceneImagePath(scenePath), sceneImageSvg(renderSceneSnapshot(doc, 800, 450), 800, 450))
}

/** Tutto ciò che serve perché la scena giri in una pagina (per il blocco «Scena 3D» del designer). */
export async function prepareSceneEmbed(scenePath: string): Promise<void> {
  const parsed = parseScene3D(await ide.invoke('workspace:readFile', scenePath))
  if (!parsed.ok) throw new Error(parsed.error)
  await ensureThreeVendor()
  await writeSceneOutputs(scenePath, parsed.doc)
}
