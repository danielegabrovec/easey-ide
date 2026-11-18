// Codice Three.js generato dalla scena: un modulo ES leggibile (un blocco per oggetto, con commento)
// che esporta `montaScena(canvas)` → `{ scena, camera, renderer, ferma() }`, e una pagina HTML autonoma.
// Three si importa da un percorso scelto da chi genera (file locale nel progetto, o 'three' da npm):
// mai da una CDN. Disegna solo quando serve; il ciclo continuo c'è solo se ci sono animazioni.
import { ANIMATE_SOURCE, hasAnimations } from './animate'
import { GEOMETRY_LABELS, type Scene3DDocument, type Scene3DObject } from './model'
import { STARS_SOURCE } from './stars'

export interface CodegenOptions {
  /** Da dove importare Three: «three» (npm) o un percorso relativo («../vendor/three.module.min.js»). */
  threeImport?: string
  /** File d'origine, citato nel commento iniziale. */
  sourcePath?: string
  /** Nome del prodotto nel commento iniziale («Easey IDE», «IDE Next»). */
  generator?: string
}

export interface GeneratedScene {
  code: string
  /** Righe (da 1) del blocco di ciascun oggetto: per evidenziare il codice dell'oggetto scelto. */
  map: Record<string, { start: number; end: number }>
  /** Nome della variabile di ciascun oggetto nel codice. */
  names: Record<string, string>
}

const RESERVED = new Set(
  'break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static enum await implements package protected interface private public arguments eval undefined NaN Infinity THREE scena camera renderer canvas anima stelle disegna ridimensiona osservatore animati ciclo inizio passo montaScena Math'.split(' ')
)

/** Nome di variabile JavaScript da un nome qualunque («Luce del sole» → luceDelSole), unico in `used`. */
export function identifierFor(name: string, used: Set<string>): string {
  const words = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
  let id = words.map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1))).join('') || 'oggetto'
  if (/^[0-9]/.test(id)) id = `o${id}`
  let candidate = id
  for (let i = 2; RESERVED.has(candidate) || used.has(candidate); i++) candidate = `${id}${i}`
  used.add(candidate)
  return candidate
}

const n = (v: number): string => String(Math.round(v * 100000) / 100000)
const q = (s: string): string => JSON.stringify(s)
const rad = (deg: number): number => (deg * Math.PI) / 180

/** Oggetti con i genitori prima dei figli (l'ordine fra fratelli resta quello del documento). */
export function topologicalOrder(doc: Scene3DDocument): Scene3DObject[] {
  const ids = new Set(doc.objects.map((o) => o.id))
  const out: Scene3DObject[] = []
  const visit = (parent: string | null) => {
    for (const o of doc.objects) {
      const p = o.parent !== null && ids.has(o.parent) ? o.parent : null
      if (p === parent) {
        out.push(o)
        visit(o.id)
      }
    }
  }
  visit(null)
  return out
}

function geometryCode(o: Scene3DObject): string {
  const p = o.geometry!.params
  switch (o.geometry!.kind) {
    case 'box':
      return `new THREE.BoxGeometry(${n(p.width)}, ${n(p.height)}, ${n(p.depth)})`
    case 'sphere':
      return `new THREE.SphereGeometry(${n(p.radius)}, ${n(p.widthSegments)}, ${n(p.heightSegments)})`
    case 'cylinder':
      return `new THREE.CylinderGeometry(${n(p.radiusTop)}, ${n(p.radiusBottom)}, ${n(p.height)}, ${n(p.radialSegments)})`
    case 'cone':
      return `new THREE.ConeGeometry(${n(p.radius)}, ${n(p.height)}, ${n(p.radialSegments)})`
    case 'torus':
      return `new THREE.TorusGeometry(${n(p.radius)}, ${n(p.tube)}, ${n(p.radialSegments)}, ${n(p.tubularSegments)})`
    case 'torusKnot':
      return `new THREE.TorusKnotGeometry(${n(p.radius)}, ${n(p.tube)}, ${n(p.tubularSegments)}, ${n(p.radialSegments)})`
    case 'plane':
      return `new THREE.PlaneGeometry(${n(p.width)}, ${n(p.height)})`
    case 'icosahedron':
      return `new THREE.IcosahedronGeometry(${n(p.radius)}, ${n(p.detail)})`
    case 'stars':
      return `new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(stelle(${n(p.count)}, ${n(p.radius)}), 3))`
  }
}

function materialCode(o: Scene3DObject): string {
  const m = o.material!
  const parts: string[] = [`color: ${q(m.color)}`]
  if (m.opacity < 1) parts.push('transparent: true', `opacity: ${n(m.opacity)}`)
  if (o.geometry!.kind === 'stars') return `new THREE.PointsMaterial({ ${[...parts, `size: ${n(o.geometry!.params.size)}`].join(', ')} })`
  if (m.wireframe) parts.push('wireframe: true')
  if (m.kind === 'standard' || m.kind === 'physical') parts.push(`metalness: ${n(m.metalness)}`, `roughness: ${n(m.roughness)}`)
  if (m.kind === 'physical' && m.clearcoat > 0) parts.push(`clearcoat: ${n(m.clearcoat)}`)
  if (m.kind !== 'basic' && m.emissiveIntensity > 0) parts.push(`emissive: ${q(m.emissive)}`, `emissiveIntensity: ${n(m.emissiveIntensity)}`)
  if ((m.kind === 'standard' || m.kind === 'physical') && m.flatShading) parts.push('flatShading: true')
  const ctor = { standard: 'MeshStandardMaterial', physical: 'MeshPhysicalMaterial', toon: 'MeshToonMaterial', basic: 'MeshBasicMaterial' }[m.kind]
  return `new THREE.${ctor}({ ${parts.join(', ')} })`
}

function lightCode(o: Scene3DObject, v: string): string[] {
  const l = o.light!
  const lines: string[] = []
  switch (l.kind) {
    case 'ambient':
      lines.push(`const ${v} = new THREE.AmbientLight(${q(l.color)}, ${n(l.intensity)})`)
      break
    case 'hemisphere':
      lines.push(`const ${v} = new THREE.HemisphereLight(${q(l.color)}, ${q(l.groundColor)}, ${n(l.intensity)})`)
      break
    case 'directional':
      lines.push(`const ${v} = new THREE.DirectionalLight(${q(l.color)}, ${n(l.intensity)})`)
      if (l.castShadow) lines.push(`Object.assign(${v}.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 40 })`)
      break
    case 'point':
      lines.push(`const ${v} = new THREE.PointLight(${q(l.color)}, ${n(l.intensity)}, ${n(l.distance)})`)
      break
    case 'spot':
      lines.push(`const ${v} = new THREE.SpotLight(${q(l.color)}, ${n(l.intensity)}, ${n(l.distance)}, ${n(rad(l.angle))}, 0.3)`)
      break
  }
  if (l.castShadow && (l.kind === 'directional' || l.kind === 'spot' || l.kind === 'point')) lines.push(`${v}.castShadow = true`, `${v}.shadow.mapSize.set(1024, 1024)`)
  return lines
}

/** Il modulo ES della scena. */
export function generateScene3DModule(doc: Scene3DDocument, options: CodegenOptions = {}): GeneratedScene {
  const threeImport = options.threeImport ?? 'three'
  const used = new Set<string>()
  const names: Record<string, string> = {}
  const ordered = topologicalOrder(doc)
  for (const o of ordered) names[o.id] = identifierFor(o.name, used)
  const animated = ordered.filter((o) => o.visible && o.animation.kind !== 'none' && o.animation.speed !== 0)
  const usesStars = ordered.some((o) => o.geometry?.kind === 'stars')

  const lines: string[] = []
  const map: GeneratedScene['map'] = {}
  const push = (...l: string[]) => lines.push(...l)
  push(`// Scena 3D «${doc.name.replace(/[\r\n]/g, ' ')}»${options.sourcePath ? ` — generata da ${options.generator ?? 'Easey IDE'} dal file ${options.sourcePath}` : ''}.`)
  push('// Si rigenera quando salvi la scena: le modifiche fatte qui a mano andrebbero perse.')
  push(`import * as THREE from ${q(threeImport)}`)
  if (usesStars) push('', ...STARS_SOURCE.split('\n'))
  if (animated.length) push('', ...ANIMATE_SOURCE.split('\n'))
  push('', '/** Disegna la scena nel <canvas> dato; restituisce { scena, camera, renderer, ferma }. */')
  push('export function montaScena(canvas) {')
  push('  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })')
  push('  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2))')
  if (doc.environment.toneMapping === 'aces') push('  renderer.toneMapping = THREE.ACESFilmicToneMapping')
  if (doc.environment.exposure !== 1) push(`  renderer.toneMappingExposure = ${n(doc.environment.exposure)}`)
  if (doc.environment.shadows) push('  renderer.shadowMap.enabled = true')
  push('', '  const scena = new THREE.Scene()', `  scena.background = new THREE.Color(${q(doc.background)})`)
  if (doc.fog) push(`  scena.fog = new THREE.Fog(${q(doc.fog.color)}, ${n(doc.fog.near)}, ${n(doc.fog.far)})`)
  const c = doc.camera
  push(`  const camera = new THREE.PerspectiveCamera(${n(c.fov)}, 1, 0.1, 500)`, `  camera.position.set(${c.position.map(n).join(', ')})`, `  camera.lookAt(${c.target.map(n).join(', ')})`)

  for (const o of ordered) {
    const v = names[o.id]
    const start = lines.length + 2
    push('', `  // ${o.name.replace(/[\r\n]/g, ' ')}${o.kind === 'mesh' && o.geometry ? ` (${GEOMETRY_LABELS[o.geometry.kind].toLowerCase()})` : ''}`)
    if (o.kind === 'mesh' && o.geometry && o.material) {
      const ctor = o.geometry.kind === 'stars' ? 'Points' : 'Mesh'
      push(`  const ${v} = new THREE.${ctor}(`, `    ${geometryCode(o)},`, `    ${materialCode(o)}`, '  )')
    } else if (o.kind === 'light' && o.light) {
      push(...lightCode(o, v).map((l) => `  ${l}`))
    } else push(`  const ${v} = new THREE.Group()`)
    if (o.position.some((x) => x !== 0)) push(`  ${v}.position.set(${o.position.map(n).join(', ')})`)
    if (o.rotation.some((x) => x !== 0)) push(`  ${v}.rotation.set(${o.rotation.map((d) => n(rad(d))).join(', ')})`)
    if (o.scale.some((x) => x !== 1)) push(`  ${v}.scale.set(${o.scale.map(n).join(', ')})`)
    if (o.kind === 'mesh' && o.castShadow) push(`  ${v}.castShadow = true`)
    if (o.kind === 'mesh' && o.receiveShadow) push(`  ${v}.receiveShadow = true`)
    if (!o.visible) push(`  ${v}.visible = false`)
    if (animated.includes(o)) {
      const rot = o.rotation.map((d) => n(rad(d))).join(', ')
      push(`  ${v}.userData.riposo = { p: [${o.position.map(n).join(', ')}], r: [${rot}], s: [${o.scale.map(n).join(', ')}] }`)
    }
    push(`  ${o.parent && names[o.parent] ? names[o.parent] : 'scena'}.add(${v})`)
    map[o.id] = { start, end: lines.length }
  }

  push('', '  function disegna() {', '    renderer.render(scena, camera)', '  }')
  push('  function ridimensiona() {', '    const w = canvas.clientWidth || 300', '    const h = canvas.clientHeight || 150', '    renderer.setSize(w, h, false)', '    camera.aspect = w / h', '    camera.updateProjectionMatrix()', '    disegna()', '  }')
  push('  const osservatore = new ResizeObserver(ridimensiona)', '  osservatore.observe(canvas)', '  ridimensiona()')
  push('  let ciclo = 0')
  if (animated.length) {
    push(`  const animati = [${animated.map((o) => `[${names[o.id]}, ${q(o.animation.kind)}, ${n(o.animation.speed)}]`).join(', ')}]`)
    push('  const inizio = performance.now()', '  function passo(ora) {', '    const t = (ora - inizio) / 1000', '    for (const [o, kind, speed] of animati) anima(o, kind, speed, t)', '    disegna()', '    ciclo = requestAnimationFrame(passo)', '  }', '  ciclo = requestAnimationFrame(passo)')
  }
  // ferma() libera tutto: con molti montaggi e smontaggi (componenti React, Svelte, Angular) non restano
  // geometrie, materiali, ombre delle luci né contesti WebGL aperti.
  push(
    '',
    '  return {',
    '    scena,',
    '    camera,',
    '    renderer,',
    '    ferma() {',
    '      cancelAnimationFrame(ciclo)',
    '      osservatore.disconnect()',
    '      scena.traverse((o) => {',
    '        if (o.geometry) o.geometry.dispose()',
    '        for (const m of [].concat(o.material || [])) m.dispose()',
    '        if (o.isLight && o.dispose) o.dispose()',
    '      })',
    '      renderer.dispose()',
    '      renderer.forceContextLoss()',
    '    }',
    '  }',
    '}',
    ''
  )
  return { code: lines.join('\n'), map, names }
}

const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!)

/** Pagina HTML autonoma (canvas a tutta finestra) che usa Three dal percorso `threePath` tramite import map. */
export function generateScene3DHtml(doc: Scene3DDocument, threePath: string, options: Omit<CodegenOptions, 'threeImport'> = {}): string {
  const module = generateScene3DModule(doc, { ...options, threeImport: 'three' }).code
  const imports = JSON.stringify({ imports: { three: threePath } })
  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(doc.name)}</title>
  <style>html, body { margin: 0; height: 100%; background: ${doc.background}; } canvas { display: block; width: 100%; height: 100%; }</style>
  <script type="importmap">${imports.replace(/</g, '\\u003c')}</script>
</head>
<body>
  <canvas id="scena"></canvas>
  <script type="module">
${module.replace(/<\/script/gi, '<\\/script').replace('export function montaScena', 'function montaScena')}
montaScena(globalThis.document.getElementById('scena'))
  </script>
</body>
</html>
`
}

/** C'è almeno un'animazione (per lo Studio: serve il ciclo continuo)? */
export const sceneIsAnimated = (doc: Scene3DDocument): boolean => hasAnimations(doc.objects)
