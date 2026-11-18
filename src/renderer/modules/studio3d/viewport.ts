// Viewport dello Studio 3D (1.7). UN SOLO WebGLRenderer per tutta l'app: disegna fuori schermo e ogni
// viewport copia il risultato nel proprio <canvas> 2D (così più scene aperte non aprono più contesti WebGL).
// Si disegna solo quando serve (modifica, camera mossa, maniglia trascinata); il ciclo continuo c'è solo
// mentre le animazioni sono in riproduzione. Senza WebGL (o in collaudo con il ripiego forzato) la scena
// si disegna in 2D con il kit (`renderFallback2D`) e si sceglie con un clic sulle sagome.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { applyCamera, applySceneSettings, SceneSync } from '@shared/scene3d/three-sync'
import { pickFallback, renderFallback2D, type HitRegion } from '@shared/scene3d/fallback2d'
import { sceneIsAnimated } from '@shared/scene3d/codegen'
import type { Scene3DDocument, Vec3 } from '@shared/scene3d/model'

/** Collaudi senza GPU: `localStorage['easey.studio3d.noWebGL'] = '1'` forza il ripiego 2D. */
const NO_WEBGL_KEY = 'easey.studio3d.noWebGL'

let shared: THREE.WebGLRenderer | null | false = null

function forcedFallback(): boolean {
  try {
    return localStorage.getItem(NO_WEBGL_KEY) === '1'
  } catch {
    return false
  }
}

/** Il renderer unico (creato al primo uso), o null se WebGL non c'è. */
export function sharedRenderer(): THREE.WebGLRenderer | null {
  if (shared === false) return null
  if (shared) return shared
  if (forcedFallback()) {
    shared = false
    return null
  }
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    shared = renderer
    return renderer
  } catch {
    shared = false
    return null
  }
}

/**
 * PNG (URL dati) della scena vista dalla camera del documento, senza griglia né maniglie: per «Salva immagine»
 * e per l'immagine mostrata nel designer. Funziona anche senza uno Studio aperto (oggetti costruiti e liberati qui).
 */
export function renderSceneSnapshot(doc: Scene3DDocument, width = 800, height = 450): string {
  const renderer = sharedRenderer()
  if (!renderer) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    renderFallback2D(canvas.getContext('2d')!, doc, width, height)
    return canvas.toDataURL('image/png')
  }
  const scene = new THREE.Scene()
  const sync = new SceneSync(scene)
  try {
    sync.sync(doc)
    applySceneSettings(scene, doc)
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 500)
    applyCamera(camera, doc)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.shadowMap.enabled = doc.environment.shadows
    renderer.toneMapping = doc.environment.toneMapping === 'aces' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping
    renderer.toneMappingExposure = doc.environment.exposure
    renderer.setSize(width, height, false)
    renderer.render(scene, camera)
    return renderer.domElement.toDataURL('image/png')
  } finally {
    sync.dispose()
  }
}

export type GizmoMode = 'translate' | 'rotate' | 'scale'

export interface ViewportEvents {
  /** Clic su un oggetto (o sul vuoto: null). */
  onPick: (id: string | null, additive: boolean) => void
  /** Fine di un trascinamento della maniglia: posa nuova dell'oggetto (rotazione in gradi). */
  onTransform: (id: string, pose: { position: Vec3; rotation: Vec3; scale: Vec3 }) => void
}

const deg = (r: number) => Math.round(((r * 180) / Math.PI) * 100) / 100
const round = (n: number) => Math.round(n * 1000) / 1000

/** Una vista della scena: la sua camera, i suoi controlli e il suo canvas 2D. */
export class SceneViewport {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500)
  readonly fallback: boolean
  private readonly renderer: THREE.WebGLRenderer | null
  private readonly sync: SceneSync
  private readonly ctx: CanvasRenderingContext2D
  private orbit: OrbitControls | null = null
  private transform: TransformControls | null = null
  private grid: THREE.GridHelper | null = null
  private axes: THREE.AxesHelper | null = null
  private doc: Scene3DDocument | null = null
  private selected: string[] = []
  private regions: HitRegion[] = []
  private frame = 0
  private loop = 0
  private playing = false
  private startTime = 0
  private disposed = false
  private down: { x: number; y: number } | null = null
  private readonly observer: ResizeObserver
  /** Quante volte si è disegnato (per i collaudi: il disegno è a richiesta). */
  renders = 0

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly events: ViewportEvents
  ) {
    this.ctx = canvas.getContext('2d')!
    this.renderer = sharedRenderer()
    this.fallback = !this.renderer
    this.sync = new SceneSync(this.scene)
    if (this.renderer) {
      this.orbit = new OrbitControls(this.camera, canvas)
      this.orbit.addEventListener('change', () => this.requestRender())
      this.transform = new TransformControls(this.camera, canvas)
      this.transform.addEventListener('change', () => this.requestRender())
      this.transform.addEventListener('dragging-changed', (event) => {
        if (this.orbit) this.orbit.enabled = !event.value
        if (!event.value) this.commitTransform()
      })
      this.scene.add(this.transform.getHelper())
    }
    canvas.addEventListener('pointerdown', this.onDown)
    canvas.addEventListener('pointerup', this.onUp)
    this.observer = new ResizeObserver(() => this.requestRender())
    this.observer.observe(canvas)
  }

  /** Nuovo stato del documento: aggiorna gli oggetti di Three sul posto (firma strutturale) e ridisegna. */
  setDocument(doc: Scene3DDocument, resetCamera = false): void {
    // La camera del documento è cambiata (scena pronta, annulla, «Usa questa vista»): la vista la segue.
    const first = !this.doc || JSON.stringify(this.doc.camera) !== JSON.stringify(doc.camera)
    this.doc = doc
    if (this.renderer) {
      this.sync.sync(doc)
      applySceneSettings(this.scene, doc)
      this.setHelpers(doc)
      if (first || resetCamera) {
        applyCamera(this.camera, doc)
        this.orbit?.target.set(...doc.camera.target)
        this.orbit?.update()
      }
      this.attachGizmo()
    }
    if (this.playing && !sceneIsAnimated(doc)) this.setPlaying(false)
    this.requestRender()
  }

  private setHelpers(doc: Scene3DDocument): void {
    if (doc.environment.grid && !this.grid) {
      this.grid = new THREE.GridHelper(20, 20, 0x4b5563, 0x2a2f3a)
      this.scene.add(this.grid)
    } else if (!doc.environment.grid && this.grid) {
      this.grid.removeFromParent()
      this.grid.dispose()
      this.grid = null
    }
    if (doc.environment.axes && !this.axes) {
      this.axes = new THREE.AxesHelper(2)
      this.scene.add(this.axes)
    } else if (!doc.environment.axes && this.axes) {
      this.axes.removeFromParent()
      this.axes.dispose()
      this.axes = null
    }
  }

  setSelection(ids: string[]): void {
    this.selected = ids
    this.attachGizmo()
    this.requestRender()
  }

  setMode(mode: GizmoMode): void {
    this.transform?.setMode(mode)
    this.requestRender()
  }

  private attachGizmo(): void {
    if (!this.transform) return
    const id = this.selected.length === 1 ? this.selected[0]! : null
    const object = id ? this.sync.get(id) : undefined
    // Le luci ambiente e cielo/terra non hanno una posizione che conti: niente maniglia.
    const light = this.doc?.objects.find((o) => o.id === id)?.light?.kind
    if (object && light !== 'ambient' && light !== 'hemisphere') {
      if (this.transform.object !== object) this.transform.attach(object)
    } else if (this.transform.object) this.transform.detach()
  }

  private commitTransform(): void {
    const object = this.transform?.object
    const id = object ? this.sync.idOf(object) : null
    if (!object || !id) return
    this.events.onTransform(id, {
      position: [round(object.position.x), round(object.position.y), round(object.position.z)],
      rotation: [deg(object.rotation.x), deg(object.rotation.y), deg(object.rotation.z)],
      scale: [round(object.scale.x), round(object.scale.y), round(object.scale.z)]
    })
  }

  // -------------------------------------------------------------- scelta con il clic

  private onDown = (event: PointerEvent) => {
    this.down = { x: event.clientX, y: event.clientY }
  }

  private onUp = (event: PointerEvent) => {
    const start = this.down
    this.down = null
    // Un trascinamento (camera o maniglia) non è un clic.
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4 || this.transform?.dragging) return
    if (this.transform?.axis) return
    const rect = this.canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const additive = event.shiftKey || event.ctrlKey || event.metaKey
    if (this.fallback) {
      this.events.onPick(pickFallback(this.regions, x, y), additive)
      return
    }
    const pointer = new THREE.Vector2((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1)
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(pointer, this.camera)
    this.events.onPick(this.sync.pick(raycaster), additive)
  }

  // -------------------------------------------------------------- disegno

  /** Chiede un disegno al prossimo fotogramma (più richieste nello stesso fotogramma = un disegno). */
  requestRender(): void {
    if (this.disposed || this.frame || this.playing) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.draw()
    })
  }

  private size(): { width: number; height: number } {
    return { width: Math.max(1, Math.round(this.canvas.clientWidth)), height: Math.max(1, Math.round(this.canvas.clientHeight)) }
  }

  private draw(): void {
    if (this.disposed || !this.doc) return
    const { width, height } = this.size()
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    if (this.canvas.width !== Math.round(width * ratio) || this.canvas.height !== Math.round(height * ratio)) {
      this.canvas.width = Math.round(width * ratio)
      this.canvas.height = Math.round(height * ratio)
    }
    this.renders++
    if (!this.renderer) {
      this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      this.regions = renderFallback2D(this.ctx, this.doc, width, height, new Set(this.selected))
      return
    }
    // Il renderer è di tutti: le impostazioni di questa scena si rimettono a ogni disegno.
    this.renderer.shadowMap.enabled = this.doc.environment.shadows
    this.renderer.toneMapping = this.doc.environment.toneMapping === 'aces' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping
    this.renderer.toneMappingExposure = this.doc.environment.exposure
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.render(this.scene, this.camera)
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.ctx.drawImage(this.renderer.domElement, 0, 0, this.canvas.width, this.canvas.height)
  }

  /** Animazioni in riproduzione: l'unico caso con il ciclo continuo. Fermandole gli oggetti tornano a riposo. */
  setPlaying(on: boolean): void {
    if (on === this.playing) return
    this.playing = on
    cancelAnimationFrame(this.loop)
    if (on && this.renderer) {
      this.startTime = performance.now()
      this.transform?.detach()
      const step = (now: number) => {
        if (!this.playing || this.disposed) return
        this.sync.setTime((now - this.startTime) / 1000)
        this.draw()
        this.loop = requestAnimationFrame(step)
      }
      this.loop = requestAnimationFrame(step)
    } else {
      this.sync.setTime(0)
      this.attachGizmo()
      this.requestRender()
    }
  }

  get isPlaying(): boolean {
    return this.playing
  }

  /** Posizione della camera dell'editor e punto guardato (per «Usa questa vista»). */
  view(): { position: Vec3; target: Vec3 } {
    const p = this.camera.position
    const t = this.orbit?.target ?? new THREE.Vector3(...(this.doc?.camera.target ?? [0, 0, 0]))
    return { position: [round(p.x), round(p.y), round(p.z)], target: [round(t.x), round(t.y), round(t.z)] }
  }

  /**
   * Immagine PNG della scena come la vede chi la usa (camera del documento, senza griglia né maniglie),
   * della misura chiesta: per «Salva immagine» e per l'anteprima nel designer.
   */
  snapshot(width = 800, height = 450): string {
    if (!this.doc) return ''
    const url = renderSceneSnapshot(this.doc, width, height)
    // Il renderer è condiviso: la vista va ridisegnata alla sua misura.
    this.requestRender()
    return url
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    cancelAnimationFrame(this.loop)
    this.observer.disconnect()
    this.canvas.removeEventListener('pointerdown', this.onDown)
    this.canvas.removeEventListener('pointerup', this.onUp)
    this.transform?.detach()
    this.transform?.getHelper().removeFromParent()
    this.transform?.dispose()
    this.orbit?.dispose()
    this.sync.dispose()
    this.grid?.dispose()
    this.axes?.dispose()
  }
}
