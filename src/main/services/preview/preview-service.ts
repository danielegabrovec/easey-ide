// Anteprima web: protocollo `ide-preview://project/<percorso>` che serve i file del progetto aperto.
// - HTML: servito così com'è + script ponte (console/errori) iniettato in testa.
// - TS/TSX/JSX: compilato al volo con esbuild (un file alla volta, come fa il browser con i moduli),
//   con source map per riportare errori e log sulla riga originale.
// - JS, CSS, immagini, ecc.: serviti così come sono.
import { net, protocol } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PREVIEW_HOST, PREVIEW_SCHEME, type SourceLocation } from '@shared/contracts/runner'
import { BRIDGE_PATH } from '@shared/stack'
import { normalizeRelative } from '@shared/paths'
import { SourceMapReader, type RawSourceMap } from '@shared/sourcemap'
import type { WorkspaceService } from '../workspace/workspace-service'
import bridgeSource from './bridge.js?raw'
import { compileErrorModule, injectBridge, rewriteBareImports } from './transform'
import { loadEsbuild } from '../esbuild-loader'

const COMPILED_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.jsx'])
const RESOLVE_ORDER = ['.ts', '.tsx', '.js', '.mjs', '.jsx', '.mts']

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
}

const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*'
}

/** Da chiamare PRIMA di app.ready. */
export function registerPreviewScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: PREVIEW_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
    }
  ])
}

export class PreviewService {
  private readonly maps = new Map<string, RawSourceMap>()

  constructor(private readonly workspace: WorkspaceService) {}

  register(): void {
    protocol.handle(PREVIEW_SCHEME, (request) => this.handle(request))
  }

  urlFor(entry: string): string {
    return `${PREVIEW_SCHEME}://${PREVIEW_HOST}/${normalizeRelative(entry)}?v=${Date.now()}`
  }

  mapLocation(url: string, line: number, column: number): SourceLocation | null {
    let relative: string
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== `${PREVIEW_SCHEME}:`) return null
      relative = normalizeRelative(decodeURIComponent(parsed.pathname))
    } catch {
      return null
    }
    const map = this.maps.get(relative)
    if (!map) return { path: relative, line, column }
    const original = new SourceMapReader(map).originalPosition(line, column)
    if (!original) return { path: relative, line, column }
    return { path: relative, line: original.line, column: original.column }
  }

  private async handle(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url)
      if (url.host !== PREVIEW_HOST) return new Response('Host non valido', { status: 404 })
      const relative = normalizeRelative(decodeURIComponent(url.pathname))
      if (relative === BRIDGE_PATH) return this.text(bridgeSource, '.js')
      const root = this.workspace.root()
      if (!root) return new Response('Nessun progetto aperto', { status: 404 })

      const resolved = this.resolve(relative)
      if (!resolved) return new Response(`File non trovato: ${relative}`, { status: 404, headers: BASE_HEADERS })
      const extension = extname(resolved.relative).toLowerCase()

      if (extension === '.html' || extension === '.htm') {
        const html = await readFile(resolved.absolute, 'utf8')
        return this.text(injectBridge(html), extension)
      }
      if (COMPILED_EXTENSIONS.has(extension)) return this.text(await this.compile(resolved.relative, resolved.absolute), '.js')

      const response = await net.fetch(pathToFileURL(resolved.absolute).toString())
      const headers = new Headers(BASE_HEADERS)
      headers.set('Content-Type', MIME[extension] ?? response.headers.get('Content-Type') ?? 'application/octet-stream')
      return new Response(response.body, { status: response.status, headers })
    } catch (error) {
      return new Response(`Errore dell'anteprima: ${(error as Error).message}`, { status: 500, headers: BASE_HEADERS })
    }
  }

  /** Risolve come farebbe un bundler: cartella → index.html, estensione mancante o .js che in realtà è .ts. */
  private resolve(relative: string): { relative: string; absolute: string } | null {
    const tryPath = (candidate: string) => {
      const absolute = this.workspace.absolute(candidate)
      return existsSync(absolute) && statSync(absolute).isFile() ? { relative: candidate, absolute } : null
    }
    const direct = tryPath(relative || 'index.html')
    if (direct) return direct
    const absolute = this.workspace.absolute(relative)
    if (relative && existsSync(absolute) && statSync(absolute).isDirectory()) {
      return tryPath(`${relative}/index.html`)
    }
    const extension = extname(relative)
    const stem = extension === '.js' || extension === '.mjs' ? relative.slice(0, -extension.length) : relative
    for (const ext of RESOLVE_ORDER) {
      const found = tryPath(stem + ext)
      if (found) return found
    }
    for (const ext of RESOLVE_ORDER) {
      const found = tryPath(`${relative}/index${ext}`)
      if (found) return found
    }
    return null
  }

  private async compile(relative: string, absolute: string): Promise<string> {
    const source = await readFile(absolute, 'utf8')
    const extension = extname(relative).toLowerCase()
    try {
      const { transform } = await loadEsbuild()
      const result = await transform(source, {
        loader: extension === '.tsx' ? 'tsx' : extension === '.jsx' ? 'jsx' : 'ts',
        sourcefile: relative.slice(relative.lastIndexOf('/') + 1),
        sourcemap: 'external',
        target: 'es2022',
        jsx: 'automatic',
        jsxImportSource: 'https://esm.sh/react@19',
        logLevel: 'silent'
      })
      const map = JSON.parse(result.map) as RawSourceMap
      this.maps.set(relative, map)
      const inline = Buffer.from(result.map).toString('base64')
      return `${rewriteBareImports(result.code)}\n//# sourceMappingURL=data:application/json;base64,${inline}\n`
    } catch (error) {
      const first = (error as { errors?: { text: string; location?: { line: number; column: number } }[] }).errors?.[0]
      return compileErrorModule(relative, first?.text ?? (error as Error).message, first?.location?.line ?? 1, (first?.location?.column ?? 0) + 1)
    }
  }

  private text(body: string, extension: string): Response {
    return new Response(body, { status: 200, headers: { ...BASE_HEADERS, 'Content-Type': MIME[extension] ?? 'text/plain; charset=utf-8' } })
  }
}
