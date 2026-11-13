// Genera src/shared/design-kit/icon-data.ts: i disegni (elementi SVG) delle icone scelte in
// design-kit/icons.ts, presi dai file di lucide-react (licenza ISC). Così il kit resta codice puro,
// senza React, e le icone finiscono nella pagina come SVG in linea.
// Uso: node scripts/build-kit-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'src/shared/design-kit/icons.ts'), 'utf8')
const names = [...source.matchAll(/name: '([a-z0-9-]+)'/g)].map((m) => m[1])
const version = JSON.parse(readFileSync(join(root, 'node_modules/lucide-react/package.json'), 'utf8')).version

const nodes = {}
for (const name of names) {
  const module = await import(pathToFileURL(join(root, 'node_modules/lucide-react/dist/esm/icons', `${name}.js`)).href)
  nodes[name] = module.__iconNode.map(([tag, attrs]) => {
    const { key: _key, ...rest } = attrs
    return [tag, rest]
  })
}

const body = Object.entries(nodes)
  .map(([name, list]) => `  '${name}': ${JSON.stringify(list)}`)
  .join(',\n')
const out = `// File generato da scripts/build-kit-icons.mjs: non modificarlo a mano.
// Disegni delle icone lucide v${version} (licenza ISC, https://lucide.dev, © Lucide Contributors).

export type IconNode = [string, Record<string, string | number>][]

export const ICON_NODES: Record<string, IconNode> = {
${body}
}
`
writeFileSync(join(root, 'src/shared/design-kit/icon-data.ts'), out)
console.log(`${names.length} icone scritte in src/shared/design-kit/icon-data.ts`)
