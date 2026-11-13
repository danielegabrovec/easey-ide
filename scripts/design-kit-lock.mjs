// Impronta del design kit condiviso (src/shared/design-kit): IDE Next ne avrà una copia identica.
// Il test tests/unit/design-kit-lock.test.ts confronta i file con src/shared/design-kit.lock: se cambi
// il kit, rigenera la lock con `node scripts/design-kit-lock.mjs` e porta gli stessi file nell'altro repo.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const kit = join(root, 'src', 'shared', 'design-kit')

export function kitHashes() {
  const out = {}
  for (const name of readdirSync(kit).filter((f) => f.endsWith('.ts')).sort()) {
    // Fine riga normalizzata: la lock non dipende da come git scrive i file su Windows.
    const text = readFileSync(join(kit, name), 'utf8').replace(/\r\n/g, '\n')
    out[name] = createHash('sha256').update(text).digest('hex')
  }
  return out
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(join(root, 'src', 'shared', 'design-kit.lock'), `${JSON.stringify(kitHashes(), null, 2)}\n`)
  console.log('src/shared/design-kit.lock aggiornata')
}
