// Dal documento della scena agli oggetti di Three.js, aggiornando sul posto quando si può.
// Idea presa da Frontend Next: una «firma strutturale» per oggetto (tipo di geometria e parametri, tipo di
// materiale, tipo di luce); se non cambia si aggiornano solo trasformazione, colori e valori, altrimenti si
// ricostruisce e si liberano geometria e materiale vecchi. Un solo renderer e il disegno a richiesta li
// gestisce lo Studio: qui niente DOM, niente ciclo di animazione.
import * as THREE from 'three'
import { animatedPose, restPose } from './animate'
import type { GeometryKind, LightSpec, MaterialSpec, Scene3DDocument, Scene3DObject } from './model'
import { starPositions } from './stars'

/** Chiave in `userData` con l'id dell'oggetto del documento. */
export const ID_KEY = 'scene3dId'

export function structuralSignature(o: Scene3DObject): string {
  if (o.kind === 'mesh' && o.geometry) return `mesh:${o.geometry.kind}:${JSON.stringify(o.geometry.params)}:${o.material?.kind}:${o.material?.flatShading}`
  if (o.kind === 'light' && o.light) return `light:${o.light.kind}`
  return o.kind
}

export function buildGeometry(kind: GeometryKind, p: Record<string, number>): THREE.BufferGeometry {
  switch (kind) {
    case 'box':
      return new THREE.BoxGeometry(p.width, p.height, p.depth)
    case 'sphere':
      return new THREE.SphereGeometry(p.radius, p.widthSegments, p.heightSegments)
    case 'cylinder':
      return new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, p.radialSegments)
    case 'cone':
      return new THREE.ConeGeometry(p.radius, p.height, p.radialSegments)
    case 'torus':
      return new THREE.TorusGeometry(p.radius, p.tube, p.radialSegments, p.tubularSegments)
    case 'torusKnot':
      return new THREE.TorusKnotGeometry(p.radius, p.tube, p.tubularSegments, p.radialSegments)
    case 'plane':
      return new THREE.PlaneGeometry(p.width, p.height)
    case 'icosahedron':
      return new THREE.IcosahedronGeometry(p.radius, p.detail)
    case 'stars': {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(starPositions(p.count, p.radius), 3))
      return g
    }
  }
}

type AnyMaterial = THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial | THREE.MeshToonMaterial | THREE.MeshBasicMaterial | THREE.PointsMaterial

export function buildMaterial(spec: MaterialSpec, points: boolean, size = 0.08): AnyMaterial {
  if (points) return new THREE.PointsMaterial({ color: spec.color, size, sizeAttenuation: true, transparent: spec.opacity < 1, opacity: spec.opacity })
  const common = { color: spec.color, transparent: spec.opacity < 1, opacity: spec.opacity, wireframe: spec.wireframe }
  switch (spec.kind) {
    case 'physical':
      return new THREE.MeshPhysicalMaterial({ ...common, metalness: spec.metalness, roughness: spec.roughness, clearcoat: spec.clearcoat, emissive: spec.emissive, emissiveIntensity: spec.emissiveIntensity, flatShading: spec.flatShading })
    case 'toon':
      return new THREE.MeshToonMaterial({ ...common, emissive: spec.emissive, emissiveIntensity: spec.emissiveIntensity })
    case 'basic':
      return new THREE.MeshBasicMaterial(common)
    case 'standard':
      return new THREE.MeshStandardMaterial({ ...common, metalness: spec.metalness, roughness: spec.roughness, emissive: spec.emissive, emissiveIntensity: spec.emissiveIntensity, flatShading: spec.flatShading })
  }
}

/** Aggiorna i valori di un materiale esistente (stesso tipo) senza ricrearlo. */
export function updateMaterial(material: AnyMaterial, spec: MaterialSpec, size = 0.08): void {
  material.color.set(spec.color)
  material.opacity = spec.opacity
  material.transparent = spec.opacity < 1
  if (material instanceof THREE.PointsMaterial) {
    material.size = size
    return
  }
  material.wireframe = spec.wireframe
  if ('emissive' in material) {
    material.emissive.set(spec.emissive)
    material.emissiveIntensity = spec.emissiveIntensity
  }
  if (material instanceof THREE.MeshStandardMaterial) {
    material.metalness = spec.metalness
    material.roughness = spec.roughness
  }
  if (material instanceof THREE.MeshPhysicalMaterial) material.clearcoat = spec.clearcoat
}

export function buildLight(spec: LightSpec): THREE.Light {
  switch (spec.kind) {
    case 'ambient':
      return new THREE.AmbientLight(spec.color, spec.intensity)
    case 'hemisphere':
      return new THREE.HemisphereLight(spec.color, spec.groundColor, spec.intensity)
    case 'directional': {
      const l = new THREE.DirectionalLight(spec.color, spec.intensity)
      l.shadow.mapSize.set(1024, 1024)
      Object.assign(l.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 40 })
      return l
    }
    case 'point':
      return new THREE.PointLight(spec.color, spec.intensity, spec.distance)
    case 'spot': {
      const l = new THREE.SpotLight(spec.color, spec.intensity, spec.distance, (spec.angle * Math.PI) / 180, 0.3)
      l.shadow.mapSize.set(1024, 1024)
      return l
    }
  }
}

export function updateLight(light: THREE.Light, spec: LightSpec): void {
  light.color.set(spec.color)
  light.intensity = spec.intensity
  light.castShadow = spec.castShadow && !(light instanceof THREE.AmbientLight) && !(light instanceof THREE.HemisphereLight)
  if (light instanceof THREE.HemisphereLight) light.groundColor.set(spec.groundColor)
  if (light instanceof THREE.PointLight || light instanceof THREE.SpotLight) light.distance = spec.distance
  if (light instanceof THREE.SpotLight) light.angle = (spec.angle * Math.PI) / 180
}

function buildObject(o: Scene3DObject): THREE.Object3D {
  if (o.kind === 'mesh' && o.geometry && o.material) {
    const geometry = buildGeometry(o.geometry.kind, o.geometry.params)
    if (o.geometry.kind === 'stars') return new THREE.Points(geometry, buildMaterial(o.material, true, o.geometry.params.size))
    return new THREE.Mesh(geometry, buildMaterial(o.material, false))
  }
  if (o.kind === 'light' && o.light) return buildLight(o.light)
  return new THREE.Group()
}

function disposeObject(object: THREE.Object3D): void {
  if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
    object.geometry.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const m of materials) m.dispose()
  }
  if (object instanceof THREE.Light) object.dispose()
}

interface Entry {
  signature: string
  object: THREE.Object3D
  source: Scene3DObject
}

/** Tiene allineati il documento e un sotto-albero di Three (`root`, di solito la scena). */
export class SceneSync {
  private entries = new Map<string, Entry>()

  constructor(readonly root: THREE.Object3D) {}

  sync(doc: Scene3DDocument): void {
    const alive = new Set(doc.objects.map((o) => o.id))
    for (const [id, entry] of this.entries) {
      if (!alive.has(id)) {
        entry.object.removeFromParent()
        disposeObject(entry.object)
        this.entries.delete(id)
      }
    }
    for (const o of doc.objects) {
      const signature = structuralSignature(o)
      let entry = this.entries.get(o.id)
      if (entry && entry.signature !== signature) {
        // I figli già costruiti passano al nuovo oggetto (si ri-agganciano più sotto).
        entry.object.removeFromParent()
        disposeObject(entry.object)
        entry = undefined
      }
      if (!entry) {
        const object = buildObject(o)
        object.userData[ID_KEY] = o.id
        entry = { signature, object, source: o }
        this.entries.set(o.id, entry)
      }
      entry.source = o
      this.apply(entry.object, o)
    }
    // Genitori e ordine: come nel documento.
    for (const o of doc.objects) {
      const object = this.entries.get(o.id)!.object
      const parent = o.parent ? this.entries.get(o.parent)?.object ?? this.root : this.root
      if (object.parent !== parent) parent.add(object)
    }
  }

  private apply(object: THREE.Object3D, o: Scene3DObject): void {
    const rest = restPose(o.position, o.rotation, o.scale)
    object.userData.riposo = { p: rest.position, r: rest.rotation, s: rest.scale }
    object.position.set(...rest.position)
    object.rotation.set(...rest.rotation)
    object.scale.set(...rest.scale)
    object.visible = o.visible
    object.name = o.name
    object.castShadow = o.castShadow
    object.receiveShadow = o.receiveShadow
    if ((object instanceof THREE.Mesh || object instanceof THREE.Points) && o.material) {
      updateMaterial(object.material as AnyMaterial, o.material, o.geometry?.params.size)
    }
    if (object instanceof THREE.Light && o.light) updateLight(object, o.light)
  }

  /** Muove gli oggetti animati al tempo `t` (secondi); con `t = 0` tornano a riposo. */
  setTime(t: number): void {
    for (const { object, source } of this.entries.values()) {
      if (source.animation.kind === 'none') continue
      const pose = animatedPose(restPose(source.position, source.rotation, source.scale), source.animation, t)
      object.position.set(...pose.position)
      object.rotation.set(...pose.rotation)
      object.scale.set(...pose.scale)
    }
  }

  get(id: string): THREE.Object3D | undefined {
    return this.entries.get(id)?.object
  }

  /** L'id del documento di un oggetto Three (o del primo antenato che ne ha uno). */
  idOf(object: THREE.Object3D | null): string | null {
    for (let o = object; o; o = o.parent) {
      const id = o.userData[ID_KEY]
      if (typeof id === 'string' && this.entries.has(id)) return id
    }
    return null
  }

  /** L'oggetto colpito dal raggio (solo quelli del documento, non griglia o maniglie). */
  pick(raycaster: THREE.Raycaster): string | null {
    const targets = [...this.entries.values()].filter((e) => e.object.visible && (e.object instanceof THREE.Mesh || e.object instanceof THREE.Points)).map((e) => e.object)
    const hit = raycaster.intersectObjects(targets, false)[0]
    return hit ? this.idOf(hit.object) : null
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      entry.object.removeFromParent()
      disposeObject(entry.object)
    }
    this.entries.clear()
  }
}

/** Sfondo e nebbia della scena. */
export function applySceneSettings(scene: THREE.Scene, doc: Scene3DDocument): void {
  if (scene.background instanceof THREE.Color) scene.background.set(doc.background)
  else scene.background = new THREE.Color(doc.background)
  if (doc.fog) {
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.set(doc.fog.color)
      scene.fog.near = doc.fog.near
      scene.fog.far = doc.fog.far
    } else scene.fog = new THREE.Fog(doc.fog.color, doc.fog.near, doc.fog.far)
  } else scene.fog = null
}

/** Camera prospettica dal documento (rapporto d'aspetto a parte). */
export function applyCamera(camera: THREE.PerspectiveCamera, doc: Scene3DDocument): void {
  camera.fov = doc.camera.fov
  camera.position.set(...doc.camera.position)
  camera.lookAt(...doc.camera.target)
  camera.updateProjectionMatrix()
}
