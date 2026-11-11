// Modelli Monaco = contenuto dei file aperti nell'IDE. Qui vivono salvataggio, autosalvataggio,
// stato "modificato" e sincronizzazione con i cambi fatti su disco da fuori.
import type * as Monaco from 'monaco-editor'
import { isTextFile, languageOf, basenameOf } from '@shared/paths'
import { ide } from '../../ipc'
import { emit } from '../../workbench/events'
import { findPanels } from '../../workbench/layout'
import { notifyError } from '../../workbench/notifications'
import { workbench } from '../../workbench/store'
import { monaco } from './monaco-setup'

const savedVersion = new Map<string, number>()
const autosaveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const subscriptions = new Map<string, Monaco.IDisposable>()
const AUTOSAVE_DELAY = 700

// Ogni apertura di progetto usa un prefisso diverso negli URI dei modelli: così i risultati
// tardivi del servizio TypeScript (o i marcatori) di un progetto precedente non finiscono
// su un file omonimo del progetto nuovo (es. due "src/main.ts").
let generation = 0
let prefix = `/p${generation}/`

export function uriFor(path: string): Monaco.Uri {
  return monaco.Uri.from({ scheme: 'file', path: `${prefix}${path}` })
}

export function pathFor(uri: Monaco.Uri): string | null {
  return uri.scheme === 'file' && uri.path.startsWith(prefix) ? uri.path.slice(prefix.length) : null
}

export function getModel(path: string): Monaco.editor.ITextModel | null {
  return monaco.editor.getModel(uriFor(path))
}

export function isDirty(path: string): boolean {
  const model = getModel(path)
  return !!model && savedVersion.get(path) !== model.getAlternativeVersionId()
}

function updateDirty(path: string): void {
  const dirty = isDirty(path)
  workbench().setDirty(path, dirty)
  const name = basenameOf(path)
  for (const panel of findPanels(`editor:${path}`)) {
    if (panel.id === `editor:${path}`) panel.api.setTitle(dirty ? `● ${name}` : name)
  }
}

function createModel(path: string, content: string): Monaco.editor.ITextModel {
  const model = monaco.editor.createModel(content, languageOf(path), uriFor(path))
  savedVersion.set(path, model.getAlternativeVersionId())
  subscriptions.set(
    path,
    model.onDidChangeContent(() => {
      updateDirty(path)
      scheduleAutosave(path)
    })
  )
  return model
}

export function disposeModel(path: string): void {
  subscriptions.get(path)?.dispose()
  subscriptions.delete(path)
  const timer = autosaveTimers.get(path)
  if (timer) clearTimeout(timer)
  autosaveTimers.delete(path)
  const model = getModel(path)
  if (model) {
    // I marcatori non spariscono da soli col modello: si azzerano per ogni proprietario.
    const owners = new Set(monaco.editor.getModelMarkers({ resource: model.uri }).map((m) => m.owner))
    for (const owner of owners) monaco.editor.setModelMarkers(model, owner, [])
    model.dispose()
  }
  savedVersion.delete(path)
  workbench().setDirty(path, false)
}

export function disposeAll(): void {
  for (const model of monaco.editor.getModels()) {
    const path = pathFor(model.uri)
    if (path !== null) disposeModel(path)
  }
  workbench().clearDirty()
}

/** Carica tutti i file di testo del progetto: servono a IntelliSense per seguire gli import. */
export async function loadProjectModels(): Promise<void> {
  disposeAll()
  generation++
  prefix = `/p${generation}/`
  const files = await ide.invoke('workspace:textFiles')
  // Un file aperto nel frattempo (editor.open subito dopo l'apertura del progetto) ha già il suo modello.
  for (const file of files) if (!getModel(file.path)) createModel(file.path, file.content)
}

export async function ensureModel(path: string): Promise<Monaco.editor.ITextModel> {
  const existing = getModel(path)
  if (existing) return existing
  const content = await ide.invoke('workspace:readFile', path)
  // Durante l'attesa il modello può essere nato altrove (caricamento del progetto): niente doppioni.
  return getModel(path) ?? createModel(path, content)
}

function scheduleAutosave(path: string): void {
  if (!workbench().settings.autoSave) return
  const timer = autosaveTimers.get(path)
  if (timer) clearTimeout(timer)
  autosaveTimers.set(
    path,
    setTimeout(() => {
      autosaveTimers.delete(path)
      void save(path)
    }, AUTOSAVE_DELAY)
  )
}

export async function save(path: string): Promise<boolean> {
  const model = getModel(path)
  if (!model) return false
  const timer = autosaveTimers.get(path)
  if (timer) clearTimeout(timer)
  autosaveTimers.delete(path)
  if (!isDirty(path)) return true
  const version = model.getAlternativeVersionId()
  try {
    await ide.invoke('workspace:writeFile', path, model.getValue())
    savedVersion.set(path, version)
    updateDirty(path)
    emit('file:saved', { path })
    return true
  } catch (error) {
    notifyError(error)
    return false
  }
}

export async function saveAll(): Promise<void> {
  for (const path of [...workbench().dirty]) await save(path)
}

/** Sostituisce il contenuto mantenendo l'annullamento (Ctrl+Z) disponibile. */
export function replaceContent(model: Monaco.editor.ITextModel, content: string): void {
  if (model.getValue() === content) return
  model.pushEditOperations([], [{ range: model.getFullModelRange(), text: content }], () => null)
}

/** File cambiati su disco: aggiorna i modelli non modificati, crea quelli nuovi, chiude i cancellati. */
export async function syncFromDisk(paths: string[], closeEditor: (path: string) => void): Promise<void> {
  for (const path of paths) {
    const model = getModel(path)
    if (model && isDirty(path)) continue
    try {
      if (!model && !isTextFile(path)) continue
      const content = await ide.invoke('workspace:readFile', path)
      if (model) {
        if (model.getValue() !== content) {
          replaceContent(model, content)
          savedVersion.set(path, model.getAlternativeVersionId())
          updateDirty(path)
        }
      } else {
        createModel(path, content)
      }
    } catch {
      // Non leggibile: file cancellato, o è una cartella.
      if (model) {
        closeEditor(path)
        disposeModel(path)
      }
    }
  }
}

export function modelPaths(): string[] {
  return monaco.editor
    .getModels()
    .map((model) => pathFor(model.uri))
    .filter((path): path is string => path !== null)
}
