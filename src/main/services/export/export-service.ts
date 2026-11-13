// Esportazione del progetto: archivio ZIP (per consegnarlo o archiviarlo) e pagina HTML unica
// (HTML + CSS + JS/TS impacchettati in un solo file che si apre con doppio clic, anche offline).
import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, posix } from 'node:path'
import { IGNORED_DIRS } from '@shared/paths'
import { LEGACY_PROJECT_CONFIG_FILE, PROJECT_CONFIG_FILE } from '@shared/contracts/workspace'
import { loadEsbuild } from '../esbuild-loader'
import { buildZip, type ZipEntry } from './zip'

const MAX_INLINE_IMAGE = 2 * 1024 * 1024
const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon'
}

async function collect(root: string, dir = '', out: ZipEntry[] = []): Promise<ZipEntry[]> {
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue
    const rel = dir ? `${dir}/${entry.name}` : entry.name
    if (entry.isDirectory()) await collect(root, rel, out)
    else if (entry.isFile()) {
      const absolute = join(root, rel)
      out.push({ path: rel, data: await readFile(absolute), modified: (await stat(absolute)).mtime })
    }
  }
  return out
}

/** ZIP con una cartella radice col nome del progetto. */
export async function exportZip(root: string, name: string): Promise<Buffer> {
  const entries = await collect(root)
  return buildZip(entries.map((e) => ({ ...e, path: `${name}/${e.path}` })))
}

const isExternal = (url: string) => /^([a-z]+:|\/\/|#|data:)/i.test(url)

/** Immagini piccole citate dal CSS (`url(img/sfondo.png)`, relative al foglio di stile) → data URI. */
async function inlineCssImages(css: string, cssDir: string): Promise<string> {
  let out = css
  for (const [whole, quote, url] of [...css.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)]) {
    if (isExternal(url!)) continue
    const file = url!.split(/[?#]/)[0]!
    const mime = MIME[extname(file).toLowerCase()]
    if (!mime) continue
    const data = await readFile(join(cssDir, file)).catch(() => null)
    if (!data || data.length > MAX_INLINE_IMAGE) continue
    out = out.replace(whole, () => `url(${quote}data:${mime};base64,${data.toString('base64')}${quote})`)
  }
  return out
}

/** Un'unica pagina: CSS collegati e script locali (anche TypeScript, con import) incorporati. */
export async function exportSingleHtml(root: string, entry: string): Promise<string> {
  const htmlPath = join(root, entry)
  const baseDir = dirname(entry) === '.' ? '' : dirname(entry).replace(/\\/g, '/')
  const resolveLocal = (url: string) => join(root, posix.normalize(baseDir ? `${baseDir}/${url}` : url).split('?')[0]!.split('#')[0]!)
  let html = await readFile(htmlPath, 'utf8')
  const esbuild = await loadEsbuild()

  // Fogli di stile collegati → <style>.
  const links = [...html.matchAll(/<link\b[^>]*>/gi)]
  for (const [tag] of links) {
    if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) continue
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]
    if (!href || isExternal(href)) continue
    const cssPath = resolveLocal(href)
    const css = await readFile(cssPath, 'utf8').catch(() => null)
    if (css !== null) {
      const inlined = await inlineCssImages(css, dirname(cssPath))
      html = html.replace(tag, () => `<style>\n${inlined}\n</style>`)
    }
  }

  // Script locali → impacchettati con esbuild (TypeScript e import compresi).
  const scripts = [...html.matchAll(/<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script\s*>/gi)]
  for (const [tag, before, src, after] of scripts) {
    if (isExternal(src!)) continue
    const isModule = /type\s*=\s*["']?module/i.test(`${before} ${after}`)
    const built = await esbuild.build({
      entryPoints: [resolveLocal(src!)],
      // Percorsi nei commenti relativi al progetto (mai le cartelle del disco di chi esporta).
      absWorkingDir: root,
      bundle: true,
      write: false,
      format: isModule ? 'esm' : 'iife',
      target: 'es2020',
      platform: 'browser',
      minify: false,
      logLevel: 'silent',
      loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.jpeg': 'dataurl', '.gif': 'dataurl', '.svg': 'dataurl', '.webp': 'dataurl' }
    })
    const code = built.outputFiles[0]!.text.replace(/<\/script/gi, '<\\/script')
    html = html.replace(tag, () => `<script${isModule ? ' type="module"' : ''}>\n${code}</script>`)
  }

  // Immagini locali piccole → data URI.
  const images = [...html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)]
  for (const [tag, src] of images) {
    if (isExternal(src!)) continue
    const mime = MIME[extname(src!).toLowerCase()]
    if (!mime) continue
    const data = await readFile(resolveLocal(src!)).catch(() => null)
    if (!data || data.length > MAX_INLINE_IMAGE) continue
    html = html.replace(tag, () => tag.replace(src!, `data:${mime};base64,${data.toString('base64')}`))
  }
  return html
}

/** File che servono solo a scrivere il sito (sorgenti TypeScript, configurazioni): non si pubblicano. */
const SOURCE_ONLY = /\.(ts|tsx|mts|cts)$/i
const CONFIG_ONLY = new Set([PROJECT_CONFIG_FILE, LEGACY_PROJECT_CONFIG_FILE, 'tsconfig.json', 'jsconfig.json'])

/**
 * Sito pronto da pubblicare (Netlify Drop, GitHub Pages, un hosting qualsiasi): ZIP con ogni pagina HTML
 * del progetto resa autonoma come nella «pagina unica» (CSS e script incorporati, TypeScript compilato),
 * più immagini, caratteri e gli altri file; i link fra le pagine restano validi perché i percorsi non cambiano.
 */
export async function exportSite(root: string, name: string): Promise<Buffer> {
  const entries: ZipEntry[] = []
  for (const entry of await collect(root)) {
    const file = posix.basename(entry.path)
    if (SOURCE_ONLY.test(file) || (CONFIG_ONLY.has(file) && !entry.path.includes('/'))) continue
    const data = /\.html?$/i.test(file) ? Buffer.from(await exportSingleHtml(root, entry.path), 'utf8') : entry.data
    entries.push({ ...entry, path: `${name}/${entry.path}`, data })
  }
  return buildZip(entries)
}
