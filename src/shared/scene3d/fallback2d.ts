// Ripiego senza WebGL (idea di Frontend Next): quando il computer o il test e2e non hanno la GPU, lo
// Studio disegna la scena in 2D — griglia, assi e sagome in prospettiva, dal fondo verso la camera — e
// restituisce le zone cliccabili, così selezione e albero degli oggetti funzionano lo stesso.
// Puro: riceve un contesto 2D minimo (quello del <canvas> lo soddisfa).
import { GEOMETRY_PARAMS, type Scene3DDocument, type Scene3DObject, type Vec3 } from './model'

export interface Ctx2D {
  fillStyle: string | unknown
  strokeStyle: string | unknown
  lineWidth: number
  globalAlpha: number
  fillRect(x: number, y: number, w: number, h: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arc(x: number, y: number, r: number, a0: number, a1: number): void
  closePath(): void
  fill(): void
  stroke(): void
}

export interface HitRegion {
  id: string
  x: number
  y: number
  r: number
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

/** Proiezione prospettica dalla camera del documento: punto del mondo → px del canvas (null se dietro). */
export function projector(doc: Scene3DDocument, width: number, height: number): (p: Vec3) => { x: number; y: number; depth: number } | null {
  const eye = doc.camera.position
  const forward = norm(sub(doc.camera.target, eye))
  const rightV = norm(cross(forward, [0, 1, 0]))
  const up = cross(rightV, forward)
  const f = height / 2 / Math.tan((doc.camera.fov * Math.PI) / 360)
  return (p) => {
    const d = sub(p, eye)
    const z = dot(d, forward)
    if (z <= 0.05) return null
    return { x: width / 2 + (dot(d, rightV) * f) / z, y: height / 2 - (dot(d, up) * f) / z, depth: z }
  }
}

/** Posizione nel mondo (genitori compresi, solo traslazioni e scale: basta per un'anteprima). */
function worldPosition(doc: Scene3DDocument, o: Scene3DObject): { p: Vec3; s: number } {
  let p: Vec3 = [...o.position]
  let s = Math.max(...o.scale.map(Math.abs))
  let parent = doc.objects.find((x) => x.id === o.parent)
  for (let guard = 0; parent && guard < 64; guard++) {
    const k = Math.max(...parent.scale.map(Math.abs))
    p = [parent.position[0] + p[0] * k, parent.position[1] + p[1] * k, parent.position[2] + p[2] * k]
    s *= k
    parent = doc.objects.find((x) => x.id === parent!.parent)
  }
  return { p, s }
}

function radiusOf(o: Scene3DObject): number {
  const p = o.geometry?.params ?? {}
  switch (o.geometry?.kind) {
    case 'box':
      return Math.max(p.width, p.height, p.depth) / 2
    case 'plane':
      return 0
    case 'stars':
      return 0
    case undefined:
      return 0.15
    default:
      return p.radius ?? GEOMETRY_PARAMS.sphere.radius
  }
}

/** Disegna l'anteprima 2D e restituisce le zone cliccabili (dalla più vicina). */
export function renderFallback2D(ctx: Ctx2D, doc: Scene3DDocument, width: number, height: number, selected: ReadonlySet<string> = new Set()): HitRegion[] {
  const project = projector(doc, width, height)
  ctx.globalAlpha = 1
  ctx.fillStyle = doc.background
  ctx.fillRect(0, 0, width, height)
  const line = (a: Vec3, b: Vec3, color: string, w = 1) => {
    const pa = project(a)
    const pb = project(b)
    if (!pa || !pb) return
    ctx.strokeStyle = color
    ctx.lineWidth = w
    ctx.beginPath()
    ctx.moveTo(pa.x, pa.y)
    ctx.lineTo(pb.x, pb.y)
    ctx.stroke()
  }
  if (doc.environment.grid) for (let i = -5; i <= 5; i++) {
    line([i, 0, -5], [i, 0, 5], '#2b3140')
    line([-5, 0, i], [5, 0, i], '#2b3140')
  }
  if (doc.environment.axes) {
    line([0, 0, 0], [2, 0, 0], '#e5484d', 2)
    line([0, 0, 0], [0, 2, 0], '#30a46c', 2)
    line([0, 0, 0], [0, 0, 2], '#3e63dd', 2)
  }
  const items = doc.objects
    .filter((o) => o.visible && o.kind === 'mesh')
    .map((o) => {
      const { p, s } = worldPosition(doc, o)
      const at = project(p)
      if (!at) return null
      const edge = project([p[0] + radiusOf(o) * s, p[1], p[2]])
      const r = Math.max(4, edge ? Math.abs(edge.x - at.x) : 6)
      return { o, at, r }
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.at.depth - a.at.depth)
  for (const { o, at, r } of items) {
    ctx.globalAlpha = o.material?.opacity ?? 1
    ctx.fillStyle = o.material?.color ?? '#888888'
    ctx.beginPath()
    if (o.geometry?.kind === 'box') {
      ctx.moveTo(at.x - r, at.y - r)
      ctx.lineTo(at.x + r, at.y - r)
      ctx.lineTo(at.x + r, at.y + r)
      ctx.lineTo(at.x - r, at.y + r)
      ctx.closePath()
    } else ctx.arc(at.x, at.y, o.geometry?.kind === 'stars' ? 2 : r, 0, Math.PI * 2)
    ctx.fill()
    if (selected.has(o.id)) {
      ctx.globalAlpha = 1
      ctx.strokeStyle = '#f2b84b'
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
  return items.reverse().filter((i) => i.o.geometry?.kind !== 'plane').map((i) => ({ id: i.o.id, x: i.at.x, y: i.at.y, r: i.r }))
}

/** L'oggetto sotto il punto (la zona più vicina alla camera che lo contiene). */
export function pickFallback(regions: readonly HitRegion[], x: number, y: number): string | null {
  return regions.find((r) => Math.hypot(r.x - x, r.y - y) <= r.r)?.id ?? null
}
