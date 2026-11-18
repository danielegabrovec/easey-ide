// Scena 3D: il documento di un file `*.scene3d.json`, una sola fonte per Easey IDE e IDE Next.
// Oggetti ad albero (campo `parent`), trasformazioni in unità del mondo e gradi, geometrie con parametri,
// luci, materiali PBR, camera, sfondo e animazioni semplici. Puro: niente Three, niente DOM.

export type Vec3 = [number, number, number]

export const GEOMETRY_KINDS = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'torusKnot', 'plane', 'icosahedron', 'stars'] as const
export type GeometryKind = (typeof GEOMETRY_KINDS)[number]

export const LIGHT_KINDS = ['ambient', 'hemisphere', 'directional', 'point', 'spot'] as const
export type LightKind = (typeof LIGHT_KINDS)[number]

export const MATERIAL_KINDS = ['standard', 'physical', 'toon', 'basic'] as const
export type MaterialKind = (typeof MATERIAL_KINDS)[number]

export const ANIMATION_KINDS = ['none', 'spin', 'float', 'pulse', 'orbit'] as const
export type AnimationKind = (typeof ANIMATION_KINDS)[number]

export const GEOMETRY_LABELS: Record<GeometryKind, string> = {
  box: 'Cubo',
  sphere: 'Sfera',
  cylinder: 'Cilindro',
  cone: 'Cono',
  torus: 'Ciambella',
  torusKnot: 'Nodo',
  plane: 'Piano',
  icosahedron: 'Icosaedro',
  stars: 'Stelle'
}

export const LIGHT_LABELS: Record<LightKind, string> = {
  ambient: 'Luce ambiente',
  hemisphere: 'Luce cielo/terra',
  directional: 'Luce del sole',
  point: 'Lampadina',
  spot: 'Faretto'
}

export const MATERIAL_LABELS: Record<MaterialKind, string> = {
  standard: 'Standard (PBR)',
  physical: 'Fisico (vernice lucida)',
  toon: 'Cartone animato',
  basic: 'Senza luce'
}

export const ANIMATION_LABELS: Record<AnimationKind, string> = {
  none: 'Ferma',
  spin: 'Gira',
  float: 'Fluttua',
  pulse: 'Pulsa',
  orbit: 'Orbita'
}

/** Parametri di ogni geometria, con i valori iniziali (gli stessi argomenti dei costruttori di Three). */
export const GEOMETRY_PARAMS: Record<GeometryKind, Record<string, number>> = {
  box: { width: 1, height: 1, depth: 1 },
  sphere: { radius: 0.6, widthSegments: 48, heightSegments: 32 },
  cylinder: { radiusTop: 0.5, radiusBottom: 0.5, height: 1.2, radialSegments: 48 },
  cone: { radius: 0.6, height: 1.2, radialSegments: 48 },
  torus: { radius: 0.6, tube: 0.22, radialSegments: 32, tubularSegments: 96 },
  torusKnot: { radius: 0.5, tube: 0.16, tubularSegments: 160, radialSegments: 24 },
  plane: { width: 10, height: 10 },
  icosahedron: { radius: 0.7, detail: 0 },
  stars: { count: 1500, radius: 40, size: 0.08 }
}

export interface MaterialSpec {
  kind: MaterialKind
  color: string
  metalness: number
  roughness: number
  opacity: number
  emissive: string
  emissiveIntensity: number
  /** Solo «physical»: strato di vernice lucida (0–1). */
  clearcoat: number
  wireframe: boolean
  flatShading: boolean
}

export interface LightSpec {
  kind: LightKind
  color: string
  intensity: number
  /** Solo «hemisphere»: colore del terreno. */
  groundColor: string
  castShadow: boolean
  /** Solo «point» e «spot»: distanza massima (0 = infinita). */
  distance: number
  /** Solo «spot»: apertura in gradi. */
  angle: number
}

export interface AnimationSpec {
  kind: AnimationKind
  /** Giri (o cicli) al secondo, circa. */
  speed: number
}

export interface Scene3DObject {
  id: string
  name: string
  parent: string | null
  kind: 'mesh' | 'light' | 'group'
  position: Vec3
  /** Rotazione in gradi (X, Y, Z). */
  rotation: Vec3
  scale: Vec3
  visible: boolean
  castShadow: boolean
  receiveShadow: boolean
  geometry?: { kind: GeometryKind; params: Record<string, number> }
  material?: MaterialSpec
  light?: LightSpec
  animation: AnimationSpec
}

export interface Scene3DDocument {
  version: 1
  name: string
  background: string
  fog: { color: string; near: number; far: number } | null
  camera: { position: Vec3; target: Vec3; fov: number }
  environment: { grid: boolean; axes: boolean; shadows: boolean; toneMapping: 'aces' | 'none'; exposure: number }
  objects: Scene3DObject[]
}

export const SCENE3D_EXTENSION = '.scene3d.json'
export const isScene3DPath = (path: string): boolean => path.toLowerCase().endsWith(SCENE3D_EXTENSION)

export function defaultMaterial(color = '#6d7cff'): MaterialSpec {
  return { kind: 'standard', color, metalness: 0.1, roughness: 0.45, opacity: 1, emissive: '#000000', emissiveIntensity: 0, clearcoat: 0, wireframe: false, flatShading: false }
}

export function defaultLight(kind: LightKind): LightSpec {
  const intensity = { ambient: 0.4, hemisphere: 0.6, directional: 2.2, point: 18, spot: 30 }[kind]
  return { kind, color: '#ffffff', intensity, groundColor: '#3b3355', castShadow: kind === 'directional' || kind === 'spot', distance: 0, angle: 35 }
}

/** Nuovo id breve e leggibile, unico nel documento («cubo-3»). */
export function newObjectId(doc: Scene3DDocument, base: string): string {
  const stem = base.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'oggetto'
  const used = new Set(doc.objects.map((o) => o.id))
  for (let i = 1; ; i++) {
    const id = `${stem}-${i}`
    if (!used.has(id)) return id
  }
}

/** Nome unico per un nuovo oggetto («Cubo», «Cubo 2»…). */
export function uniqueName(doc: Scene3DDocument, base: string): string {
  const used = new Set(doc.objects.map((o) => o.name))
  if (!used.has(base)) return base
  for (let i = 2; ; i++) if (!used.has(`${base} ${i}`)) return `${base} ${i}`
}

export function createMesh(doc: Scene3DDocument, kind: GeometryKind, extra: Partial<Scene3DObject> = {}): Scene3DObject {
  const name = uniqueName(doc, GEOMETRY_LABELS[kind])
  return {
    id: newObjectId(doc, GEOMETRY_LABELS[kind]),
    name,
    parent: null,
    kind: 'mesh',
    position: kind === 'plane' ? [0, 0, 0] : [0, 0.6, 0],
    rotation: kind === 'plane' ? [-90, 0, 0] : [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    castShadow: kind !== 'plane' && kind !== 'stars',
    receiveShadow: kind === 'plane',
    geometry: { kind, params: { ...GEOMETRY_PARAMS[kind] } },
    material: kind === 'plane' ? { ...defaultMaterial('#2a2f3a'), roughness: 0.9 } : defaultMaterial(),
    animation: { kind: 'none', speed: 0.25 },
    ...extra
  }
}

export function createLight(doc: Scene3DDocument, kind: LightKind, extra: Partial<Scene3DObject> = {}): Scene3DObject {
  const position: Vec3 = kind === 'ambient' || kind === 'hemisphere' ? [0, 5, 0] : kind === 'directional' ? [4, 6, 3] : [2, 3, 2]
  return {
    id: newObjectId(doc, LIGHT_LABELS[kind]),
    name: uniqueName(doc, LIGHT_LABELS[kind]),
    parent: null,
    kind: 'light',
    position,
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    castShadow: false,
    receiveShadow: false,
    light: defaultLight(kind),
    animation: { kind: 'none', speed: 0.25 },
    ...extra
  }
}

export function createGroup(doc: Scene3DDocument, extra: Partial<Scene3DObject> = {}): Scene3DObject {
  return {
    id: newObjectId(doc, 'Gruppo'),
    name: uniqueName(doc, 'Gruppo'),
    parent: null,
    kind: 'group',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    castShadow: false,
    receiveShadow: false,
    animation: { kind: 'none', speed: 0.25 },
    ...extra
  }
}

/** Scena vuota con camera, luce ambiente e sole: il punto di partenza di «Nuova scena 3D». */
export function emptyScene3D(name = 'Scena'): Scene3DDocument {
  const doc: Scene3DDocument = {
    version: 1,
    name,
    background: '#10131a',
    fog: null,
    camera: { position: [4, 3, 6], target: [0, 0.5, 0], fov: 45 },
    environment: { grid: true, axes: false, shadows: true, toneMapping: 'aces', exposure: 1 },
    objects: []
  }
  doc.objects.push(createLight(doc, 'ambient'))
  doc.objects.push(createLight(doc, 'directional'))
  return doc
}

// ------------------------------------------------------------------ lettura e scrittura del file

export type ParseResult = { ok: true; doc: Scene3DDocument } | { ok: false; error: string }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback)
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
const vec = (v: unknown, fallback: Vec3): Vec3 => (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n)) ? [v[0], v[1], v[2]] : [...fallback])
const color = (v: unknown, fallback: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback)
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback)

function readObject(raw: Record<string, unknown>, index: number): Scene3DObject | string {
  const id = str(raw.id, '')
  if (!id) return `l'oggetto n. ${index + 1} non ha un "id"`
  const kind = oneOf(raw.kind, ['mesh', 'light', 'group'] as const, 'group')
  const base: Scene3DObject = {
    id,
    name: str(raw.name, id),
    parent: typeof raw.parent === 'string' ? raw.parent : null,
    kind,
    position: vec(raw.position, [0, 0, 0]),
    rotation: vec(raw.rotation, [0, 0, 0]),
    scale: vec(raw.scale, [1, 1, 1]),
    visible: bool(raw.visible, true),
    castShadow: bool(raw.castShadow, false),
    receiveShadow: bool(raw.receiveShadow, false),
    animation: isObj(raw.animation) ? { kind: oneOf(raw.animation.kind, ANIMATION_KINDS, 'none'), speed: num(raw.animation.speed, 0.25) } : { kind: 'none', speed: 0.25 }
  }
  if (kind === 'mesh') {
    const g = isObj(raw.geometry) ? raw.geometry : {}
    const gk = oneOf(g.kind, GEOMETRY_KINDS, 'box')
    const params: Record<string, number> = {}
    const given = isObj(g.params) ? g.params : {}
    for (const [key, value] of Object.entries(GEOMETRY_PARAMS[gk])) params[key] = num(given[key], value)
    const m = isObj(raw.material) ? raw.material : {}
    const d = defaultMaterial()
    base.geometry = { kind: gk, params }
    base.material = {
      kind: oneOf(m.kind, MATERIAL_KINDS, 'standard'),
      color: color(m.color, d.color),
      metalness: num(m.metalness, d.metalness),
      roughness: num(m.roughness, d.roughness),
      opacity: num(m.opacity, 1),
      emissive: color(m.emissive, d.emissive),
      emissiveIntensity: num(m.emissiveIntensity, 0),
      clearcoat: num(m.clearcoat, 0),
      wireframe: bool(m.wireframe, false),
      flatShading: bool(m.flatShading, false)
    }
  }
  if (kind === 'light') {
    const l = isObj(raw.light) ? raw.light : {}
    const lk = oneOf(l.kind, LIGHT_KINDS, 'point')
    const d = defaultLight(lk)
    base.light = {
      kind: lk,
      color: color(l.color, d.color),
      intensity: num(l.intensity, d.intensity),
      groundColor: color(l.groundColor, d.groundColor),
      castShadow: bool(l.castShadow, d.castShadow),
      distance: num(l.distance, d.distance),
      angle: num(l.angle, d.angle)
    }
  }
  return base
}

/** Legge un file `*.scene3d.json`: valori mancanti o sbagliati prendono il default, errori gravi in italiano. */
export function parseScene3D(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    return { ok: false, error: `Il file non è JSON valido: ${(error as Error).message}` }
  }
  if (!isObj(raw)) return { ok: false, error: 'Il file deve contenere un oggetto { … } con la scena.' }
  if (raw.version !== undefined && raw.version !== 1) return { ok: false, error: `Versione della scena non supportata: ${String(raw.version)}.` }
  const empty = emptyScene3D()
  const cam = isObj(raw.camera) ? raw.camera : {}
  const env = isObj(raw.environment) ? raw.environment : {}
  const fog = isObj(raw.fog) ? { color: color(raw.fog.color, '#10131a'), near: num(raw.fog.near, 10), far: num(raw.fog.far, 40) } : null
  const objects: Scene3DObject[] = []
  const list = Array.isArray(raw.objects) ? raw.objects : []
  for (let i = 0; i < list.length; i++) {
    if (!isObj(list[i])) return { ok: false, error: `L'oggetto n. ${i + 1} non è valido.` }
    const read = readObject(list[i] as Record<string, unknown>, i)
    if (typeof read === 'string') return { ok: false, error: read.charAt(0).toUpperCase() + read.slice(1) + '.' }
    if (objects.some((o) => o.id === read.id)) return { ok: false, error: `L'id "${read.id}" compare due volte.` }
    objects.push(read)
  }
  const ids = new Set(objects.map((o) => o.id))
  for (const o of objects) {
    if (o.parent !== null && (!ids.has(o.parent) || o.parent === o.id)) o.parent = null
  }
  // Un ciclo nei genitori (a dentro b dentro a) rompe l'albero: chi chiude il ciclo torna alla radice.
  const byId = new Map(objects.map((o) => [o.id, o]))
  for (const o of objects) {
    const seen = new Set([o.id])
    let p = o.parent
    while (p !== null) {
      if (seen.has(p)) {
        o.parent = null
        break
      }
      seen.add(p)
      p = byId.get(p)?.parent ?? null
    }
  }
  return {
    ok: true,
    doc: {
      version: 1,
      name: str(raw.name, 'Scena'),
      background: color(raw.background, empty.background),
      fog,
      camera: { position: vec(cam.position, empty.camera.position), target: vec(cam.target, empty.camera.target), fov: Math.min(120, Math.max(10, num(cam.fov, 45))) },
      environment: {
        grid: bool(env.grid, true),
        axes: bool(env.axes, false),
        shadows: bool(env.shadows, true),
        toneMapping: oneOf(env.toneMapping, ['aces', 'none'] as const, 'aces'),
        exposure: num(env.exposure, 1)
      },
      objects
    }
  }
}

/** JSON leggibile (2 spazi, a capo finale): diff puliti nel repository del progetto. */
export const serializeScene3D = (doc: Scene3DDocument): string => `${JSON.stringify(doc, null, 2)}\n`

/** Figli diretti di un oggetto (o della radice con `null`), nell'ordine del documento. */
export const childrenOf = (doc: Scene3DDocument, parent: string | null): Scene3DObject[] => doc.objects.filter((o) => o.parent === parent)

/** L'oggetto e tutti i suoi discendenti (ids). */
export function subtreeIds(doc: Scene3DDocument, id: string): string[] {
  const out = [id]
  for (let i = 0; i < out.length; i++) for (const c of doc.objects) if (c.parent === out[i]) out.push(c.id)
  return out
}
