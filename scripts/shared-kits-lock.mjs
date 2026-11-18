// Impronta dei kit puri condivisi con IDE Next: src/shared/canvas-kit e src/shared/scene3d.
// Come per il design kit (scripts/design-kit-lock.mjs): i file si cambiano SOLO in Easey IDE, poi
// `node scripts/shared-kits-lock.mjs` rigenera src/shared/<kit>.lock e si copiano gli stessi file
// (lock compresa) in IDE Next, dove un test identico li confronta.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

export const SHARED_KITS = ['canvas-kit', 'scene3d']

export function sharedKitHashes(kit) {
  const dir = join(root, 'src', 'shared', kit)
  const out = {}
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.ts')).sort()) {
    // Fine riga normalizzata: la lock non dipende da come git scrive i file su Windows.
    const text = readFileSync(join(dir, name), 'utf8').replace(/\r\n/g, '\n')
    out[name] = createHash('sha256').update(text).digest('hex')
  }
  return out
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const kit of SHARED_KITS) {
    writeFileSync(join(root, 'src', 'shared', `${kit}.lock`), `${JSON.stringify(sharedKitHashes(kit), null, 2)}\n`)
    console.log(`src/shared/${kit}.lock aggiornata`)
  }
}
