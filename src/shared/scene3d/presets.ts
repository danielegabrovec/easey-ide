// Scene pronte di «Nuova scena 3D»: un punto di partenza che si vede subito bene.
import { createGroup, createLight, createMesh, emptyScene3D, type Scene3DDocument, type Scene3DObject } from './model'

export interface ScenePreset {
  id: string
  label: string
  description: string
  build: () => Scene3DDocument
}

function add(doc: Scene3DDocument, object: Scene3DObject): Scene3DObject {
  doc.objects.push(object)
  return object
}

function showcase(): Scene3DDocument {
  const doc = emptyScene3D('Prodotto in vetrina')
  doc.background = '#151821'
  add(doc, createMesh(doc, 'plane', { name: 'Pavimento' }))
  add(doc, createMesh(doc, 'cylinder', { name: 'Piedistallo', position: [0, 0.25, 0], scale: [1.6, 0.4, 1.6], material: { kind: 'standard', color: '#2c3140', metalness: 0.2, roughness: 0.6, opacity: 1, emissive: '#000000', emissiveIntensity: 0, clearcoat: 0, wireframe: false, flatShading: false } }))
  add(doc, createMesh(doc, 'torusKnot', { name: 'Prodotto', position: [0, 1.3, 0], material: { kind: 'physical', color: '#6d7cff', metalness: 0.3, roughness: 0.2, opacity: 1, emissive: '#000000', emissiveIntensity: 0, clearcoat: 1, wireframe: false, flatShading: false }, animation: { kind: 'spin', speed: 0.15 } }))
  add(doc, createLight(doc, 'spot', { name: 'Faretto', position: [3, 5, 2] }))
  return doc
}

function spinningLogo(): Scene3DDocument {
  const doc = emptyScene3D('Logo che gira')
  doc.background = '#0d0f14'
  doc.environment.grid = false
  doc.camera = { position: [0, 0, 5], target: [0, 0, 0], fov: 40 }
  const group = add(doc, createGroup(doc, { name: 'Logo', animation: { kind: 'spin', speed: 0.2 } }))
  add(doc, createMesh(doc, 'torus', { name: 'Anello', parent: group.id, position: [0, 0, 0], material: { kind: 'standard', color: '#f2b84b', metalness: 0.8, roughness: 0.25, opacity: 1, emissive: '#000000', emissiveIntensity: 0, clearcoat: 0, wireframe: false, flatShading: false } }))
  add(doc, createMesh(doc, 'icosahedron', { name: 'Cuore', parent: group.id, position: [0, 0, 0], scale: [0.6, 0.6, 0.6], material: { kind: 'standard', color: '#6d7cff', metalness: 0.1, roughness: 0.3, opacity: 1, emissive: '#2a2f7a', emissiveIntensity: 0.6, clearcoat: 0, wireframe: false, flatShading: true }, animation: { kind: 'pulse', speed: 0.5 } }))
  return doc
}

function starfield(): Scene3DDocument {
  const doc = emptyScene3D('Cielo stellato')
  doc.background = '#05060a'
  doc.environment.grid = false
  doc.environment.shadows = false
  doc.camera = { position: [0, 2, 9], target: [0, 0, 0], fov: 55 }
  add(doc, createMesh(doc, 'stars', { name: 'Stelle', position: [0, 0, 0], material: { kind: 'basic', color: '#ffffff', metalness: 0, roughness: 1, opacity: 0.9, emissive: '#000000', emissiveIntensity: 0, clearcoat: 0, wireframe: false, flatShading: false }, animation: { kind: 'spin', speed: 0.01 } }))
  add(doc, createMesh(doc, 'sphere', { name: 'Pianeta', position: [0, 0, 0], scale: [2, 2, 2], material: { kind: 'standard', color: '#3a7bd5', metalness: 0, roughness: 0.8, opacity: 1, emissive: '#0b1f3a', emissiveIntensity: 0.4, clearcoat: 0, wireframe: false, flatShading: false }, animation: { kind: 'spin', speed: 0.05 } }))
  add(doc, createMesh(doc, 'sphere', { name: 'Luna', position: [3.2, 0.4, 0], scale: [0.4, 0.4, 0.4], material: { kind: 'standard', color: '#d8d8d8', metalness: 0, roughness: 0.9, opacity: 1, emissive: '#000000', emissiveIntensity: 0, clearcoat: 0, wireframe: false, flatShading: false }, animation: { kind: 'orbit', speed: 0.1 } }))
  return doc
}

function litRoom(): Scene3DDocument {
  const doc = emptyScene3D('Stanza illuminata')
  doc.background = '#1b1d24'
  doc.fog = { color: '#1b1d24', near: 8, far: 22 }
  add(doc, createMesh(doc, 'plane', { name: 'Pavimento', scale: [1.2, 1.2, 1] }))
  add(doc, createMesh(doc, 'box', { name: 'Parete', position: [0, 2, -3], scale: [8, 4, 0.2], material: { kind: 'standard', color: '#3a3f4f', metalness: 0, roughness: 0.95, opacity: 1, emissive: '#000000', emissiveIntensity: 0, clearcoat: 0, wireframe: false, flatShading: false }, receiveShadow: true }))
  add(doc, createMesh(doc, 'box', { name: 'Cubo', position: [-1.2, 0.5, 0], material: { kind: 'toon', color: '#ff7a59', metalness: 0, roughness: 1, opacity: 1, emissive: '#000000', emissiveIntensity: 0, clearcoat: 0, wireframe: false, flatShading: false } }))
  add(doc, createMesh(doc, 'sphere', { name: 'Sfera', position: [1.2, 0.6, 0.4], material: { kind: 'physical', color: '#e8e8f0', metalness: 1, roughness: 0.15, opacity: 1, emissive: '#000000', emissiveIntensity: 0, clearcoat: 1, wireframe: false, flatShading: false }, animation: { kind: 'float', speed: 0.3 } }))
  add(doc, createLight(doc, 'point', { name: 'Lampada calda', position: [0, 3, 1.5], light: { kind: 'point', color: '#ffd29a', intensity: 25, groundColor: '#000000', castShadow: true, distance: 0, angle: 35 } }))
  return doc
}

export const SCENE_PRESETS: readonly ScenePreset[] = [
  { id: 'vuota', label: 'Scena vuota', description: 'Solo luci e pavimento a griglia', build: () => emptyScene3D() },
  { id: 'vetrina', label: 'Prodotto in vetrina', description: 'Un oggetto lucido che gira su un piedistallo', build: showcase },
  { id: 'logo', label: 'Logo che gira', description: 'Anello dorato e cuore che pulsa', build: spinningLogo },
  { id: 'stelle', label: 'Cielo stellato', description: 'Pianeta, luna in orbita e stelle', build: starfield },
  { id: 'stanza', label: 'Stanza illuminata', description: 'Materiali diversi, nebbia e una lampada calda', build: litRoom }
]

export const presetById = (id: string): ScenePreset | undefined => SCENE_PRESETS.find((p) => p.id === id)
