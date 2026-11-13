// Il design kit è «una sola fonte» per Easey e IDE Next: i file devono restare quelli della lock.
// Se il kit cambia: `node scripts/design-kit-lock.mjs` e stessa copia nell'altro repo.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error script .mjs senza tipi
import { kitHashes } from '../../scripts/design-kit-lock.mjs'

describe('design kit condiviso', () => {
  it('i file corrispondono a src/shared/design-kit.lock', () => {
    const lock = JSON.parse(readFileSync(join(__dirname, '..', '..', 'src', 'shared', 'design-kit.lock'), 'utf8'))
    expect(kitHashes()).toEqual(lock)
  })

  it('il kit è codice puro: niente DOM, React, Electron o Node', () => {
    for (const name of Object.keys(kitHashes())) {
      const text = readFileSync(join(__dirname, '..', '..', 'src', 'shared', 'design-kit', name), 'utf8')
      expect(text, name).not.toMatch(/from '(react|electron|node:[a-z]+|lucide-react)'/)
      expect(text, name).not.toMatch(/\b(document|window)\./)
      expect(text, name).not.toMatch(/from '\.\.\//)
    }
  })
})
