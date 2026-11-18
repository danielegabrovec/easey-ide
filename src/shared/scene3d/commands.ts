// Comandi della scena 3D: ognuno restituisce un documento nuovo (mai modifica sul posto), o lo stesso
// riferimento se non cambia niente. L'annulla tiene istantanee intere: esatto, anche quando un comando
// aggiunge campi che prima non c'erano (il difetto dell'undo «per differenze» di Frontend Next).
import { subtreeIds, type Scene3DDocument, type Scene3DObject } from './model'

type Patch = Partial<Omit<Scene3DObject, 'id' | 'material' | 'light' | 'geometry' | 'animation'>> & {
  material?: Partial<NonNullable<Scene3DObject['material']>>
  light?: Partial<NonNullable<Scene3DObject['light']>>
  geometry?: { params?: Record<string, number> }
  animation?: Partial<Scene3DObject['animation']>
}

export function addObject(doc: Scene3DDocument, object: Scene3DObject, parent: string | null = object.parent): Scene3DDocument {
  if (doc.objects.some((o) => o.id === object.id)) return doc
  const valid = parent === null || doc.objects.some((o) => o.id === parent)
  return { ...doc, objects: [...doc.objects, { ...object, parent: valid ? parent : null }] }
}

/** Aggiorna un oggetto: i sotto-oggetti (materiale, luce, parametri, animazione) si uniscono campo per campo. */
export function updateObject(doc: Scene3DDocument, id: string, patch: Patch): Scene3DDocument {
  const current = doc.objects.find((o) => o.id === id)
  if (!current) return doc
  const next: Scene3DObject = {
    ...current,
    ...(patch as Partial<Scene3DObject>),
    id,
    parent: current.parent,
    material: current.material && patch.material ? { ...current.material, ...patch.material } : current.material,
    light: current.light && patch.light ? { ...current.light, ...patch.light } : current.light,
    geometry: current.geometry && patch.geometry?.params ? { ...current.geometry, params: { ...current.geometry.params, ...patch.geometry.params } } : current.geometry,
    animation: patch.animation ? { ...current.animation, ...patch.animation } : current.animation
  }
  if (JSON.stringify(next) === JSON.stringify(current)) return doc
  return { ...doc, objects: doc.objects.map((o) => (o.id === id ? next : o)) }
}

/** Toglie gli oggetti e tutto ciò che contengono. */
export function removeObjects(doc: Scene3DDocument, ids: readonly string[]): Scene3DDocument {
  const gone = new Set(ids.flatMap((id) => (doc.objects.some((o) => o.id === id) ? subtreeIds(doc, id) : [])))
  if (!gone.size) return doc
  return { ...doc, objects: doc.objects.filter((o) => !gone.has(o.id)) }
}

/**
 * Sposta un oggetto sotto un altro genitore (o alla radice con `null`), in posizione `index` fra i fratelli.
 * Rifiutato (stesso documento) se il nuovo genitore è l'oggetto stesso o un suo discendente.
 */
export function reparent(doc: Scene3DDocument, id: string, parent: string | null, index?: number): Scene3DDocument {
  const object = doc.objects.find((o) => o.id === id)
  if (!object) return doc
  if (parent !== null && (!doc.objects.some((o) => o.id === parent) || subtreeIds(doc, id).includes(parent))) return doc
  const moved = { ...object, parent }
  const rest = doc.objects.filter((o) => o.id !== id)
  const siblings = rest.filter((o) => o.parent === parent)
  let at = rest.length
  if (index !== undefined && index < siblings.length) at = rest.indexOf(siblings[Math.max(0, index)])
  else if (siblings.length) at = rest.indexOf(siblings[siblings.length - 1]) + 1
  const objects = [...rest.slice(0, at), moved, ...rest.slice(at)]
  if (JSON.stringify(objects) === JSON.stringify(doc.objects)) return doc
  return { ...doc, objects }
}

/** Duplica gli oggetti (con i discendenti), spostati di `offset` sull'asse X; restituisce anche i nuovi id radice. */
export function duplicateObjects(doc: Scene3DDocument, ids: readonly string[], offset = 0.5): { doc: Scene3DDocument; ids: string[] } {
  let next = doc
  const roots: string[] = []
  const usedIds = new Set(doc.objects.map((o) => o.id))
  const usedNames = new Set(doc.objects.map((o) => o.name))
  const fresh = (base: string, used: Set<string>, sep: string) => {
    for (let i = 2; ; i++) {
      const candidate = `${base.replace(new RegExp(`${sep}\\d+$`), '')}${sep}${i}`
      if (!used.has(candidate)) {
        used.add(candidate)
        return candidate
      }
    }
  }
  for (const id of ids) {
    if (!doc.objects.some((o) => o.id === id)) continue
    const subtree = subtreeIds(doc, id)
    const map = new Map<string, string>()
    for (const oldId of subtree) map.set(oldId, fresh(oldId, usedIds, '-'))
    const copies = subtree.map((oldId) => {
      const o = doc.objects.find((x) => x.id === oldId)!
      const copy: Scene3DObject = structuredClone(o)
      copy.id = map.get(oldId)!
      copy.name = fresh(o.name, usedNames, ' ')
      copy.parent = oldId === id ? o.parent : map.get(o.parent!)!
      if (oldId === id) copy.position = [o.position[0] + offset, o.position[1], o.position[2]]
      return copy
    })
    next = { ...next, objects: [...next.objects, ...copies] }
    roots.push(map.get(id)!)
  }
  return { doc: next, ids: roots }
}

export function setCamera(doc: Scene3DDocument, camera: Partial<Scene3DDocument['camera']>): Scene3DDocument {
  const next = { ...doc.camera, ...camera }
  return JSON.stringify(next) === JSON.stringify(doc.camera) ? doc : { ...doc, camera: next }
}

export function setEnvironment(doc: Scene3DDocument, patch: Partial<Pick<Scene3DDocument, 'name' | 'background' | 'fog'>> & { environment?: Partial<Scene3DDocument['environment']> }): Scene3DDocument {
  const next: Scene3DDocument = {
    ...doc,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.background !== undefined ? { background: patch.background } : {}),
    ...(patch.fog !== undefined ? { fog: patch.fog } : {}),
    environment: patch.environment ? { ...doc.environment, ...patch.environment } : doc.environment
  }
  return JSON.stringify(next) === JSON.stringify(doc) ? doc : next
}

// ------------------------------------------------------------------ cronologia (annulla / ripeti)

export const HISTORY_LIMIT = 100

export interface History {
  past: Scene3DDocument[]
  present: Scene3DDocument
  future: Scene3DDocument[]
}

export const createHistory = (doc: Scene3DDocument): History => ({ past: [], present: doc, future: [] })

/**
 * Registra un nuovo stato. Se `doc` è lo stesso riferimento del presente non cambia niente.
 * `coalesce` (es. trascinare un cursore) sostituisce il presente senza aggiungere un passo.
 */
export function commit(history: History, doc: Scene3DDocument, coalesce = false): History {
  if (doc === history.present) return history
  if (coalesce) return { ...history, present: doc, future: [] }
  return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: doc, future: [] }
}

export function undo(history: History): History {
  if (!history.past.length) return history
  return { past: history.past.slice(0, -1), present: history.past[history.past.length - 1], future: [history.present, ...history.future] }
}

export function redo(history: History): History {
  if (!history.future.length) return history
  return { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1) }
}
