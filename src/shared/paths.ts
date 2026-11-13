// Utilità pure sui percorsi relativi del progetto (separatore "/").
import type { FileEntry } from './contracts/workspace'

/** Normalizza un percorso relativo: "\" → "/", niente "./", niente "/" iniziale o finale. Rifiuta "..". */
export function normalizeRelative(input: string): string {
  const parts: string[] = []
  for (const part of input.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') throw new Error(`Percorso fuori dal progetto: ${input}`)
    parts.push(part)
  }
  return parts.join('/')
}

export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function basenameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

export function dirnameOf(path: string): string {
  const index = path.lastIndexOf('/')
  return index < 0 ? '' : path.slice(0, index)
}

export function joinRelative(dir: string, name: string): string {
  return normalizeRelative(dir ? `${dir}/${name}` : name)
}

/** Tutti i file (non le cartelle) di un albero del progetto, come percorsi relativi. */
export function filePaths(entries: FileEntry[]): string[] {
  return entries.flatMap((e) => (e.kind === 'dir' ? filePaths(e.children ?? []) : [e.path]))
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  md: 'markdown',
  sql: 'sql',
  txt: 'plaintext',
  svg: 'xml',
  xml: 'xml',
  yml: 'yaml',
  yaml: 'yaml'
}

export function languageOf(path: string): string {
  return LANGUAGE_BY_EXTENSION[extensionOf(path)] ?? 'plaintext'
}

export const TEXT_EXTENSIONS = new Set(Object.keys(LANGUAGE_BY_EXTENSION).concat(['gitignore', 'env']))

export function isTextFile(path: string): boolean {
  const name = basenameOf(path)
  return TEXT_EXTENSIONS.has(extensionOf(path)) || name.startsWith('.') || !name.includes('.')
}

/** File che "Esegui nel terminale" sa eseguire. */
export function isScriptFile(path: string): boolean {
  return ['js', 'mjs', 'cjs', 'ts', 'mts', 'cts'].includes(extensionOf(path))
}

/** Cartelle mai mostrate né lette. */
export const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'out', '.laboratorio'])

/** Percorso relativo da una cartella del progetto a un file del progetto (per src e href). */
export function relativeTo(fromDir: string, target: string): string {
  const from = fromDir ? normalizeRelative(fromDir).split('/') : []
  const to = normalizeRelative(target).split('/')
  let common = 0
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++
  return [...from.slice(common).map(() => '..'), ...to.slice(common)].join('/')
}
