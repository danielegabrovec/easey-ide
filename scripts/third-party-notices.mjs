// Genera THIRD_PARTY_NOTICES.md con nome, versione, licenza e testo della licenza di ogni componente
// di terze parti incluso nell'app (dipendenze di esecuzione + librerie impacchettate nell'interfaccia,
// con le loro dipendenze). Ne mette una copia in resources/legal/ (viene inclusa nell'installer).
// Uso: node scripts/third-party-notices.mjs
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

// Librerie che finiscono davvero nell'app (le altre devDependencies servono solo a costruire e collaudare).
const BUNDLED = ['@babel/parser', '@xterm/addon-fit', '@xterm/xterm', '@xyflow/react', 'blockly', 'dockview', 'electron', 'html-to-image', 'lucide-react', 'monaco-editor', 'node-sql-parser', 'parse5', 'postcss', 'react', 'react-dom', 'zustand']
// Note aggiuntive per i componenti che ne contengono altri (il pacchetto npm non lo dice).
const SUPPLEMENTS = {
  pyodide:
    'Pyodide (Mozilla Public License 2.0, testo completo: https://www.mozilla.org/MPL/2.0/; codice sorgente: ' +
    'https://github.com/pyodide/pyodide) contiene **CPython** e la sua libreria standard, distribuiti con la ' +
    '**Python Software Foundation License Version 2** (https://docs.python.org/3/license.html). ' +
    'Copyright © 2001 Python Software Foundation; All Rights Reserved. Easey IDE usa Pyodide senza modificarlo ' +
    'per eseguire i programmi Python della Scrittura rapida.'
}
// Dipendenze dichiarate ma non incluse nella versione per il browser.
const EXCLUDED = new Set(['jsdom'])

function findPackage(name, fromDir) {
  let dir = fromDir
  for (;;) {
    const candidate = join(dir, 'node_modules', name, 'package.json')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

const seen = new Map()
function visit(name, fromDir) {
  // I file di soli tipi TypeScript non finiscono nell'app.
  if (EXCLUDED.has(name) || name.startsWith('@types/')) return
  const file = findPackage(name, fromDir)
  if (!file) return
  const data = JSON.parse(readFileSync(file, 'utf8'))
  const key = `${data.name}@${data.version}`
  if (seen.has(key)) return
  const dir = dirname(file)
  seen.set(key, { data, dir })
  // Le dipendenze del pacchetto npm "electron" servono solo a scaricarlo, non viaggiano con l'app.
  if (data.name === 'electron') return
  const children = { ...(data.dependencies ?? {}), ...(data.optionalDependencies ?? {}) }
  for (const child of Object.keys(children)) visit(child, dir)
}

for (const name of [...Object.keys(pkg.dependencies), ...BUNDLED]) visit(name, root)

/** Testo di licenza e, se c'è, file NOTICE (obbligatorio da riportare per Apache 2.0). */
function licenseText(dir) {
  const files = readdirSync(dir).filter((f) => /^(licen[cs]e|copying|notice)(\.|$|-)/i.test(f)).sort()
  return files.length ? files.map((f) => readFileSync(join(dir, f), 'utf8').trim()).join('\n\n-----\n\n') : null
}

const licenseOf = (data) => (typeof data.license === 'string' ? data.license : data.license?.type ?? (data.licenses ?? []).map((l) => l.type ?? l).join(' OR ')) || 'vedi il pacchetto'

const entries = [...seen.values()].sort((a, b) => a.data.name.localeCompare(b.data.name))
const lines = [
  '# Componenti di terze parti',
  '',
  `Easey IDE ${pkg.version} include i seguenti componenti open source. Ognuno resta proprietà dei rispettivi`,
  'autori ed è distribuito secondo la propria licenza, riportata qui sotto. Elenco generato da',
  '`scripts/third-party-notices.mjs` a partire dai pacchetti effettivamente inclusi nell\'app.',
  '',
  'Electron include a sua volta Chromium, Node.js e altri componenti: le loro licenze sono nel file',
  '`LICENSES.chromium.html` nella cartella di installazione.',
  '',
  '| Componente | Versione | Licenza |',
  '|---|---|---|',
  ...entries.map(({ data }) => `| ${data.name} | ${data.version} | ${licenseOf(data)} |`),
  '',
  '---',
  ''
]
for (const { data, dir } of entries) {
  lines.push(`## ${data.name} ${data.version}`, '', `Licenza: ${licenseOf(data)}${data.homepage ? ` · ${data.homepage}` : ''}`, '')
  const text = licenseText(dir)
  lines.push(text ? '```text\n' + text + '\n```' : '_Testo della licenza non incluso nel pacchetto: vale la licenza indicata sopra._', '')
  if (SUPPLEMENTS[data.name]) lines.push(SUPPLEMENTS[data.name], '')
}
writeFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), lines.join('\n'))
mkdirSync(join(root, 'resources', 'legal'), { recursive: true })
copyFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), join(root, 'resources', 'legal', 'THIRD_PARTY_NOTICES.md'))
copyFileSync(join(root, 'LICENSE'), join(root, 'resources', 'legal', 'LICENSE'))
copyFileSync(join(root, 'NOTE-LEGALI.md'), join(root, 'resources', 'legal', 'NOTE-LEGALI.md'))
const byLicense = {}
for (const { data } of entries) byLicense[licenseOf(data)] = (byLicense[licenseOf(data)] ?? 0) + 1
console.log(`${entries.length} componenti:`, byLicense)
