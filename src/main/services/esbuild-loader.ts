// Caricamento pigro di esbuild. Nell'app installata il suo eseguibile nativo sta fuori dall'archivio
// asar (app.asar.unpacked): esbuild legge ESBUILD_BINARY_PATH quando il modulo viene caricato,
// quindi la variabile va impostata PRIMA dell'import (che per questo è dinamico).
import { existsSync } from 'node:fs'
import { join } from 'node:path'

type Esbuild = typeof import('esbuild')

let loading: Promise<Esbuild> | null = null

function configureBinaryPath(): void {
  if (process.env['ESBUILD_BINARY_PATH']) return
  const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (!resources) return
  const binary = process.platform === 'win32' ? 'esbuild.exe' : join('bin', 'esbuild')
  const candidate = join(resources, 'app.asar.unpacked', 'node_modules', '@esbuild', `${process.platform}-${process.arch}`, binary)
  if (existsSync(candidate)) process.env['ESBUILD_BINARY_PATH'] = candidate
}

export function loadEsbuild(): Promise<Esbuild> {
  if (!loading) {
    configureBinaryPath()
    loading = import('esbuild')
  }
  return loading
}
