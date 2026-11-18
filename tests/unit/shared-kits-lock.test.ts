// canvas-kit e scene3d sono «una sola fonte» per Easey e IDE Next: i file devono restare quelli della lock.
// Se un kit cambia: `node scripts/shared-kits-lock.mjs` e stessa copia (lock compresa) nell'altro repo.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error script .mjs senza tipi
import { SHARED_KITS, sharedKitHashes } from '../../scripts/shared-kits-lock.mjs'

const shared = join(__dirname, '..', '..', 'src', 'shared')

describe.each(SHARED_KITS as string[])('kit condiviso %s', (kit) => {
  it('i file corrispondono alla lock', () => {
    const lock = JSON.parse(readFileSync(join(shared, `${kit}.lock`), 'utf8'))
    expect(sharedKitHashes(kit)).toEqual(lock)
    expect(Object.keys(lock).length).toBeGreaterThan(0)
  })

  it('è codice puro: niente DOM, React, Electron, Node né import fuori dal kit', () => {
    for (const name of Object.keys(sharedKitHashes(kit))) {
      const text = readFileSync(join(shared, kit, name), 'utf8')
      expect(text, name).not.toMatch(/from '(react|react-dom|electron|node:[a-z]+|lucide-react)'/)
      // Niente globali del browser usate direttamente (nel codice GENERATO si scrive globalThis.document).
      expect(text, name).not.toMatch(/(?<![.\w])(document|window|localStorage)\./)
      expect(text, name).not.toMatch(/from '\.\.\//)
      expect(text, name).not.toMatch(/from '@(shared|renderer|main)\//)
    }
  })
})
