import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { afterAll, describe, expect, it } from 'vitest'
import { GitService, parsePorcelain } from '../../src/main/services/git/git-service'
import { buildZip, crc32 } from '../../src/main/services/export/zip'
import { exportSingleHtml, exportSite, exportZip } from '../../src/main/services/export/export-service'

const temp = mkdtempSync(join(tmpdir(), 'lab-growth-'))
afterAll(() => rmSync(temp, { recursive: true, force: true }))

/** Rilegge uno ZIP dalla directory centrale (per verificare lo scrittore). */
function readZip(zip: Buffer): Record<string, string> {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const count = zip.readUInt16LE(end + 10)
  let offset = zip.readUInt32LE(end + 16)
  const files: Record<string, string> = {}
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(offset + 10)
    const size = zip.readUInt32LE(offset + 20)
    const nameLength = zip.readUInt16LE(offset + 28)
    const extra = zip.readUInt16LE(offset + 30)
    const comment = zip.readUInt16LE(offset + 32)
    const local = zip.readUInt32LE(offset + 42)
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    const localName = zip.readUInt16LE(local + 26)
    const localExtra = zip.readUInt16LE(local + 28)
    const data = zip.subarray(local + 30 + localName + localExtra, local + 30 + localName + localExtra + size)
    files[name] = (method === 8 ? inflateRawSync(data) : data).toString('utf8')
    expect(crc32(Buffer.from(files[name]!, 'utf8'))).toBe(zip.readUInt32LE(offset + 16))
    offset += 46 + nameLength + extra + comment
  }
  return files
}

describe('ZIP', () => {
  it('CRC32 noto e archivio rileggibile (compresso e non)', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926)
    const zip = buildZip([
      { path: 'a/ciao.txt', data: Buffer.from('ciao '.repeat(200)) },
      { path: 'b.bin', data: Buffer.from([1, 2, 3]) },
      { path: 'àccènti.md', data: Buffer.from('# sì') }
    ])
    expect(readZip(zip)).toEqual({ 'a/ciao.txt': 'ciao '.repeat(200), 'b.bin': '\u0001\u0002\u0003', 'àccènti.md': '# sì' })
  })
  it('progetto: cartella radice col nome, senza node_modules e .git', async () => {
    const root = join(temp, 'zip-progetto')
    mkdirSync(join(root, 'node_modules', 'x'), { recursive: true })
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'index.html'), '<h1>Ciao</h1>')
    writeFileSync(join(root, 'src', 'main.js'), 'console.log(1)')
    writeFileSync(join(root, 'node_modules', 'x', 'y.js'), '')
    expect(Object.keys(readZip(await exportZip(root, 'Sito'))).sort()).toEqual(['Sito/index.html', 'Sito/src/main.js'])
  })
})

describe('sito pronto da pubblicare', () => {
  it('ogni pagina autonoma, TypeScript compilato, sorgenti e configurazioni esclusi, immagini copiate', async () => {
    const root = join(temp, 'sito-progetto')
    mkdirSync(join(root, 'img'), { recursive: true })
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'index.html'), '<link rel="stylesheet" href="style.css"><a href="chi-sono.html">Chi sono</a><script type="module" src="src/main.ts"></script>')
    writeFileSync(join(root, 'chi-sono.html'), '<link rel="stylesheet" href="style.css"><h1>Chi sono</h1><img src="img/foto.png" alt="">')
    writeFileSync(join(root, 'style.css'), 'body { background: url(img/sfondo.png) }')
    writeFileSync(join(root, 'src', 'main.ts'), 'const n: number = 1\nconsole.log(n)\n')
    writeFileSync(join(root, 'img', 'foto.png'), Buffer.from('PNG finto'))
    writeFileSync(join(root, 'img', 'sfondo.png'), Buffer.from('PNG finto'))
    writeFileSync(join(root, 'easey.json'), '{}')
    writeFileSync(join(root, 'tsconfig.json'), '{}')
    const files = readZip(await exportSite(root, 'Sito'))
    expect(Object.keys(files).sort()).toEqual(['Sito/chi-sono.html', 'Sito/img/foto.png', 'Sito/img/sfondo.png', 'Sito/index.html', 'Sito/style.css'])
    expect(files['Sito/index.html']).toContain('<style>')
    // Lo sfondo citato dal CSS viaggia con la pagina.
    expect(files['Sito/index.html']).toContain(`url(data:image/png;base64,${Buffer.from('PNG finto').toString('base64')})`)
    expect(files['Sito/index.html']).toContain('href="chi-sono.html"')
    expect(files['Sito/index.html']).toContain('console.log(n)')
    expect(files['Sito/index.html']).not.toContain(': number')
    expect(files['Sito/chi-sono.html']).toContain('src="data:image/png;base64,')
  })
})

describe('pagina HTML unica', () => {
  it('incorpora CSS, script TypeScript con import e immagini', async () => {
    const root = join(temp, 'html-progetto')
    mkdirSync(join(root, 'img'), { recursive: true })
    writeFileSync(join(root, 'index.html'), '<!doctype html><link rel="stylesheet" href="style.css"><link rel="icon" href="x.ico"><img src="img/p.svg" alt=""><script type="module" src="main.ts"></script><script src="https://cdn.example/lib.js"></script>')
    writeFileSync(join(root, 'style.css'), 'h1 { color: red }')
    writeFileSync(join(root, 'main.ts'), 'import { saluta } from "./util"\nconst n: number = 2\nsaluta(n)\n')
    writeFileSync(join(root, 'util.ts'), 'export function saluta(n: number) { console.log("</script>" + n) }\n')
    writeFileSync(join(root, 'img', 'p.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    const html = await exportSingleHtml(root, 'index.html')
    expect(html).toContain('<style>\nh1 { color: red }\n</style>')
    expect(html).toContain('<script type="module">')
    expect(html).toContain('function saluta(')
    expect(html).toContain('// util.ts')
    expect(html).not.toContain('AppData')
    expect(html).not.toContain(': number')
    expect(html).toContain('<\\/script>')
    expect(html).toContain('src="data:image/svg+xml;base64,')
    expect(html).toContain('src="https://cdn.example/lib.js"')
    expect(html).toContain('href="x.ico"')
  })
})

let gitAvailable = true
try {
  execFileSync('git', ['--version'])
} catch {
  gitAvailable = false
}

describe('Git', () => {
  it('stato da porcelain: modificati, nuovi, rinominati, conflitti', () => {
    const out = ' M src/a.ts\0A  b.ts\0R  nuovo.ts\0vecchio.ts\0?? note con spazi.md\0UU c.ts\0 D d.ts\0'
    expect(parsePorcelain(out).map((c) => `${c.letter} ${c.path}`)).toEqual(['A b.ts', 'U c.ts', 'D d.ts', '? note con spazi.md', 'R nuovo.ts', 'M src/a.ts'])
  })
  it.skipIf(!gitAvailable)('init, commit, cronologia, originale e annulla', async () => {
    const root = join(temp, 'repo')
    mkdirSync(root)
    const git = new GitService()
    expect((await git.status(root)).repo).toBe(false)
    await git.init(root)
    writeFileSync(join(root, 'main.js'), 'let a = 1\n')
    let status = await git.status(root)
    expect(status).toMatchObject({ available: true, repo: true, branch: 'main' })
    expect(status.changes).toEqual([{ path: 'main.js', status: 'non tracciato', letter: '?' }])
    expect(await git.original(root, 'main.js')).toBeNull()
    await expect(git.commit(root, '   ')).rejects.toThrow('messaggio')
    const hash = await git.commit(root, 'Primo commit')
    expect(hash).toMatch(/^[0-9a-f]{7,}$/)
    writeFileSync(join(root, 'main.js'), 'let a = 2\n')
    status = await git.status(root)
    expect(status.changes).toEqual([{ path: 'main.js', status: 'modificato', letter: 'M' }])
    expect(await git.original(root, 'main.js')).toBe('let a = 1\n')
    const log = await git.log(root)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ message: 'Primo commit', short: hash })
    await git.discard(root, 'main.js')
    expect((await git.status(root)).changes).toEqual([])
  })
})
