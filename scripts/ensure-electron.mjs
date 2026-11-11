import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'win32') process.exit(0)

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const electronRoot = join(projectRoot, 'node_modules', 'electron')
const packageJson = JSON.parse(await readFile(join(electronRoot, 'package.json'), 'utf8'))
const version = packageJson.version
const archiveName = `electron-v${version}-win32-${process.arch}.zip`
const executable = join(electronRoot, 'dist', 'electron.exe')
const versionFile = join(electronRoot, 'dist', 'version')
const pathFile = join(electronRoot, 'path.txt')

if (existsSync(executable) && existsSync(versionFile)) {
  const installed = (await readFile(versionFile, 'utf8')).trim().replace(/^v/, '')
  if (installed === version) {
    await writeFile(pathFile, 'electron.exe', 'utf8')
    process.exit(0)
  }
}

const checksums = JSON.parse(await readFile(join(electronRoot, 'checksums.json'), 'utf8'))
const expected = checksums[archiveName]
if (!expected) throw new Error(`Checksum Electron non disponibile per ${archiveName}.`)

const cacheRoot = join(process.env.LOCALAPPDATA ?? tmpdir(), 'electron', 'Cache')
await mkdir(cacheRoot, { recursive: true })

async function findArchive(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = join(directory, entry.name)
    if (entry.isFile() && entry.name === archiveName) return candidate
    if (entry.isDirectory()) {
      const nested = await findArchive(candidate)
      if (nested) return nested
    }
  }
  return null
}

let archive = await findArchive(cacheRoot)
if (!archive) {
  const targetDir = join(cacheRoot, `manual-${version}-${process.arch}`)
  await mkdir(targetDir, { recursive: true })
  archive = join(targetDir, archiveName)
  const response = await fetch(`https://github.com/electron/electron/releases/download/v${version}/${archiveName}`)
  if (!response.ok) throw new Error(`Download Electron fallito: HTTP ${response.status}.`)
  await writeFile(archive, Buffer.from(await response.arrayBuffer()))
}

const actual = createHash('sha256').update(await readFile(archive)).digest('hex')
if (actual !== expected) throw new Error(`Checksum Electron non valido per ${archiveName}.`)

const destination = join(electronRoot, 'dist')
await mkdir(destination, { recursive: true })
const expanded = spawnSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    'Expand-Archive -LiteralPath $env:IDE_ELECTRON_ARCHIVE -DestinationPath $env:IDE_ELECTRON_DESTINATION -Force'
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      IDE_ELECTRON_ARCHIVE: archive,
      IDE_ELECTRON_DESTINATION: destination
    }
  }
)
if (expanded.status !== 0 || !existsSync(executable)) throw new Error('Estrazione Electron non riuscita.')
await writeFile(pathFile, 'electron.exe', 'utf8')
