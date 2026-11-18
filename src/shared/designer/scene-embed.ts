// Scena 3D dentro una pagina (1.7): `<canvas class="scena-3d" data-scena="scene/x.scene3d.json">` e uno
// script modulo che la fa girare. Accanto a ogni scena c'è il suo modulo generato (`x.scene3d.js`, rifatto
// a ogni salvataggio nello Studio 3D) e la sua immagine (`x.scene3d.svg`: un SVG che contiene il PNG della
// scena, perché i file del progetto si scrivono come testo; mostrata nel designer, dove gli script non
// girano). Three sta nel progetto (`vendor/three/`), mai su una CDN. Puro e testato.
import { dirnameOf, normalizeRelative, relativeTo } from '../paths'
import { SCENE3D_EXTENSION } from '../scene3d/model'

export const SCENE_CANVAS_CLASS = 'scena-3d'
/** Cartella di Three nel progetto (alla radice: una copia sola per tutte le pagine). */
export const THREE_VENDOR_DIR = 'vendor/three'
export const THREE_FILES = ['three.module.js', 'three.core.js'] as const
/** Caricatore (accanto alla pagina): avvia tutte le scene della pagina. */
export const SCENE_LOADER = 'js/scene-3d.js'
/** Cartella proposta per le scene nuove (accanto alla pagina). */
export const SCENE_FOLDER = 'scene'

const stem = (scenePath: string) => scenePath.slice(0, scenePath.length - SCENE3D_EXTENSION.length)

/** Il modulo generato di una scena: `scene/x.scene3d.json` → `scene/x.scene3d.js`. */
export const sceneModulePath = (scenePath: string): string => `${stem(scenePath)}.scene3d.js`
/** L'immagine della scena per il designer: `scene/x.scene3d.json` → `scene/x.scene3d.svg`. */
export const sceneImagePath = (scenePath: string): string => `${stem(scenePath)}.scene3d.svg`

/** Il file dell'immagine: un SVG che contiene il PNG (URL dati) disegnato dallo Studio 3D. */
export function sceneImageSvg(pngDataUrl: string, width: number, height: number): string {
  const href = pngDataUrl.replace(/[^A-Za-z0-9+/=:;,.-]/g, '')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(height)}" viewBox="0 0 ${Math.round(width)} ${Math.round(height)}"><image href="${href}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"/></svg>\n`
}

/** Da dove il modulo di una scena importa Three (relativo alla sua cartella). */
export function threeImportFor(scenePath: string): string {
  const relative = relativeTo(dirnameOf(normalizeRelative(scenePath)), `${THREE_VENDOR_DIR}/three.module.js`)
  return relative.startsWith('.') ? relative : `./${relative}`
}

/** Il caricatore: per ogni canvas della pagina importa il modulo accanto alla sua scena e lo monta. */
export const SCENE_LOADER_SOURCE = `// Scene 3D della pagina (Easey IDE): ogni <canvas class="${SCENE_CANVAS_CLASS}" data-scena="…"> monta la sua scena.
// Il modulo di ciascuna scena (…scene3d.js) si rigenera quando la salvi nello Studio 3D.
for (const canvas of document.querySelectorAll('canvas.${SCENE_CANVAS_CLASS}[data-scena]')) {
  const modulo = new URL(canvas.dataset.scena.replace(/\\.scene3d\\.json$/i, '.scene3d.js'), document.baseURI)
  import(modulo.href)
    .then((scena) => scena.montaScena(canvas))
    .catch((errore) => console.error('Scena 3D non caricata:', canvas.dataset.scena, errore))
}
`

const escapeAttr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** Il canvas da inserire nella pagina (`src` = percorso della scena relativo alla pagina). */
export function sceneCanvasHtml(src: string, label: string): string {
  return `<canvas class="${SCENE_CANVAS_CLASS}" data-scena="${escapeAttr(src)}" width="800" height="450" role="img" aria-label="${escapeAttr(label)}"></canvas>`
}

export const SCENE_CANVAS_CSS = `.${SCENE_CANVAS_CLASS} {
  display: block;
  width: 100%;
  max-width: 800px;
  height: auto;
  aspect-ratio: 16 / 9;
  border-radius: 12px;
  background: #10131a;
}`

/** Lo script del caricatore da mettere in fondo alla pagina (`src` relativo alla pagina). */
export const sceneLoaderTag = (src = SCENE_LOADER): string => `<script type="module" src="${escapeAttr(src)}"></script>`

/** La pagina ha già il caricatore? */
export const hasSceneLoader = (html: string): boolean => /<script[^>]+src=["'][^"']*scene-3d\.js["']/i.test(html)

/** Segnaposto (SVG come URL dati) mostrato nel designer quando la scena non ha ancora un'immagine. */
export const SCENE_PLACEHOLDER_URL = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><rect width="160" height="90" fill="#10131a"/><g fill="none" stroke="#6d7cff" stroke-width="2" stroke-linejoin="round"><path d="M80 22 104 35v26L80 74 56 61V35z"/><path d="M56 35l24 13 24-13M80 48v26"/></g><text x="80" y="86" fill="#8a93a6" font-family="system-ui" font-size="7" text-anchor="middle">Scena 3D</text></svg>'
)}`

/**
 * Stile in linea che il designer dà ai canvas delle scene (solo nel canvas del designer, mai nel file):
 * l'immagine della scena sopra il segnaposto.
 */
export function designerSceneStyle(src: string): string {
  const image = src.toLowerCase().endsWith(SCENE3D_EXTENSION) ? sceneImagePath(src) : ''
  const layers = [image ? `url("${image.replace(/"/g, '%22')}") center / cover no-repeat` : '', `url("${SCENE_PLACEHOLDER_URL}") center / contain no-repeat`, '#10131a'].filter(Boolean)
  return `background: ${layers.join(', ')};`
}
