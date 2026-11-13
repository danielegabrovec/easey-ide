// File del progetto visti dalla programmazione visuale: id degli elementi delle pagine (per "su quale
// elemento"), funzioni esportate dai file JS/TS (per "chiama funzione"), lettura e scrittura dei programmi.
import * as monaco from 'monaco-editor'
import { insertHtml } from '@shared/designer/html-edit'
import { parseHtml } from '@shared/designer/html-model'
import { dirnameOf, extensionOf, filePaths, relativeTo } from '@shared/paths'
import { findExportedFunctions, generatedPath, parseProgram, serializeProgram, type ExportedFunction, type VisualKind, type VisualProgram } from '@shared/visual/program'
import { ide } from '../../ipc'
import { executeCommand } from '../../workbench/commands'
import { workbench } from '../../workbench/store'

async function textOf(path: string): Promise<string> {
  const model = (await executeCommand('editor.ensureModel', { path }).catch(() => null)) as monaco.editor.ITextModel | null
  return model?.getValue() ?? ''
}

export function projectFiles(): string[] {
  return filePaths(workbench().tree)
}

export function htmlPages(): string[] {
  return projectFiles().filter((p) => ['html', 'htm'].includes(extensionOf(p)))
}

export interface ProjectSymbols {
  ids: string[]
  functions: ExportedFunction[]
}

export async function loadSymbols(): Promise<ProjectSymbols> {
  const ids = new Set<string>()
  const functions: ExportedFunction[] = []
  for (const path of projectFiles()) {
    const ext = extensionOf(path)
    if (['html', 'htm'].includes(ext)) {
      for (const element of parseHtml(await textOf(path)).elements) if (element.attrs['id']) ids.add(element.attrs['id'])
    } else if (['ts', 'js', 'mjs', 'mts'].includes(ext) && !path.endsWith('.generato.js')) {
      functions.push(...findExportedFunctions(path, await textOf(path)))
    }
  }
  return { ids: [...ids].sort((a, b) => a.localeCompare(b, 'it')), functions }
}

export async function readProgram(path: string, kind: VisualKind): Promise<VisualProgram> {
  return parseProgram(await ide.invoke('workspace:readFile', path).catch(() => ''), kind)
}

export async function writeProgram(path: string, program: VisualProgram, code: string): Promise<void> {
  await ide.invoke('workspace:writeFile', path, serializeProgram(program))
  await ide.invoke('workspace:writeFile', generatedPath(path), code)
}

/** Pagina che include già lo script generato, se c'è. */
export async function linkedPage(programPath: string): Promise<string | null> {
  const generated = generatedPath(programPath)
  for (const page of htmlPages()) {
    const html = parseHtml(await textOf(page))
    if (html.elements.some((e) => e.tag === 'script' && e.attrs['src'] && relativeTo(dirnameOf(page), generated) === e.attrs['src'].replace(/^\.\//, ''))) return page
  }
  return null
}

/** Aggiunge `<script type="module" src="…generato.js">` in fondo al <body> della pagina. */
export async function linkToPage(programPath: string, page: string): Promise<void> {
  const model = (await executeCommand('editor.ensureModel', { path: page })) as monaco.editor.ITextModel
  const source = model.getValue()
  const html = parseHtml(source)
  const src = relativeTo(dirnameOf(page), generatedPath(programPath))
  if (html.elements.some((e) => e.tag === 'script' && e.attrs['src']?.replace(/^\.\//, '') === src)) return
  const edits = insertHtml(html, html.body, 'inside-end', `<script type="module" src="${src}"></script>`)
  model.pushEditOperations(
    [],
    edits.map((e) => ({ range: monaco.Range.fromPositions(model.getPositionAt(e.start), model.getPositionAt(e.end)), text: e.text })),
    () => null
  )
  await ide.invoke('workspace:writeFile', page, model.getValue())
}
