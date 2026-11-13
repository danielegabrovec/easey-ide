// Modelli di progetto: un nuovo progetto parte sempre da qui.
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { PROJECT_CONFIG_FILE, type ProjectConfig, type ProjectTemplate } from '@shared/contracts/workspace'
import { normalizeRelative } from '@shared/paths'
import { BLOCKS } from '@shared/designer/blocks'

interface TemplateDefinition extends ProjectTemplate {
  entry: string
  files: Record<string, string>
}

const TSCONFIG_WEB = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noEmit": true
  },
  "include": ["src"]
}
`

const TSCONFIG_NODE = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "noEmit": true
  },
  "include": ["src"]
}
`

/**
 * Colori del sito come variabili: gli stessi nomi dei temi del designer (scheda «Sito»), così scegliendo
 * un tema si ricolora tutto, anche i pulsanti. I nomi brevi (--accento…) restano per chi li usa già.
 */
const TOKENS_CSS = `:root {
  --colore-primario: #4f46e5;
  --colore-secondario: #9333ea;
  --colore-sfondo: #f6f7fb;
  --colore-superficie: #ffffff;
  --colore-testo: #1d2333;
  --colore-tenue: #6b7385;
  --font-titoli: system-ui, 'Segoe UI', Roboto, sans-serif;
  --font-testo: system-ui, 'Segoe UI', Roboto, sans-serif;
  /* nomi brevi, collegati ai colori del tema */
  --accento: var(--colore-primario);
  --sfondo: var(--colore-sfondo);
  --testo: var(--colore-testo);
}`

const BASE_CSS = `/* Stili della pagina. Prova a cambiare i colori e salva: l'anteprima si aggiorna. */
${TOKENS_CSS}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  font-family: var(--font-testo);
  background: var(--colore-sfondo);
  color: var(--colore-testo);
}

img {
  max-width: 100%;
  height: auto;
}

/* La scheda si centra da sola: la pagina resta libera di occupare tutta la larghezza. */
.scheda {
  max-width: 32rem;
  margin: 4rem auto;
  background: var(--colore-superficie);
  padding: 2rem 2.5rem;
  border-radius: 16px;
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.08);
  text-align: center;
}

button {
  font: inherit;
  background: var(--colore-primario);
  color: white;
  border: 0;
  border-radius: 10px;
  padding: 0.6rem 1.2rem;
  cursor: pointer;
}

button:hover { filter: brightness(1.1); }
`

/** Pagina d'esempio composta con gli stessi blocchi della palette del designer. */
function designerSite(): Record<string, string> {
  const ids = ['intestazione', 'hero', 'tavola', 'griglia', 'modulo', 'piede']
  const blocks = ids.map((id) => BLOCKS.find((b) => b.id === id)!)
  const indent = (html: string, pad: string) =>
    html
      .split('\n')
      .map((line) => pad + line)
      .join('\n')
  const body = blocks
    .map((b) => (b.id === 'griglia' || b.id === 'modulo' ? indent(`<section class="lab-sezione">\n${indent(b.html, '  ')}\n</section>`, '    ') : indent(b.html, '    ')))
    .join('\n')
  const rules = [
    TOKENS_CSS,
    '* {\n  box-sizing: border-box;\n}',
    'body {\n  margin: 0;\n  font-family: var(--font-testo);\n  background: var(--colore-sfondo);\n  color: var(--colore-testo);\n}',
    'img {\n  max-width: 100%;\n  height: auto;\n}',
    'button {\n  font: inherit;\n  cursor: pointer;\n}',
    '.lab-sezione {\n  padding: 64px 24px;\n  max-width: 1080px;\n  margin: 0 auto;\n}',
    ...blocks.map((b) => b.css).filter((c): c is string => !!c && !c.startsWith('.lab-sezione'))
  ]
  return {
    'index.html': `<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Il mio sito</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
${body}
  </body>
</html>
`,
    'style.css': `/* Stili del sito. Puoi modificarli dal designer (pulsante Designer) o qui a mano. */\n\n${rules.join('\n\n')}\n`
  }
}

const TEMPLATES: TemplateDefinition[] = [
  {
    id: 'web-designer',
    title: 'Sito con il designer visuale',
    description: 'Una pagina già impaginata a sezioni, con una tavola libera stile Canva: si modifica trascinando.',
    mode: 'web',
    entry: 'index.html',
    files: designerSite()
  },
  {
    id: 'web-js',
    title: 'Pagina web (HTML + CSS + JavaScript)',
    description: 'Una pagina con stile e un pulsante che reagisce al clic. Si esegue nell’anteprima.',
    mode: 'web',
    entry: 'index.html',
    files: {
      'index.html': `<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>La mia pagina</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <main class="scheda">
      <h1 id="titolo">Ciao!</h1>
      <p>Premi il pulsante e guarda la console in basso.</p>
      <button id="pulsante" onclick="saluta()">Salutami</button>
    </main>
    <script src="script.js"></script>
  </body>
</html>
`,
      'style.css': BASE_CSS,
      'script.js': `// Questa funzione è chiamata dall'attributo onclick del pulsante.
let clic = 0

function saluta() {
  clic++
  document.getElementById('titolo').textContent = 'Ciao, hai cliccato ' + clic + ' volte!'
  console.log('Clic numero', clic, { quando: new Date() })
}

console.log('script.js caricato')
`
    }
  },
  {
    id: 'web-ts',
    title: 'Pagina web con TypeScript',
    description: 'HTML + CSS + moduli TypeScript (import/export). Il TS viene compilato al volo.',
    mode: 'web',
    entry: 'index.html',
    files: {
      'index.html': `<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Contatore TypeScript</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <main class="scheda">
      <h1>Contatore</h1>
      <p id="valore">0</p>
      <button id="incrementa">+1</button>
      <button id="azzera">Azzera</button>
    </main>
    <!-- type="module" permette gli import fra file -->
    <script type="module" src="src/main.ts"></script>
  </body>
</html>
`,
      'style.css': BASE_CSS + `
#valore { font-size: 3rem; font-weight: 700; margin: 0.5rem 0 1rem; }
button + button { margin-left: 0.5rem; background: #64748b; }
`,
      'src/contatore.ts': `// Un modulo: esporta una classe riutilizzabile.
export class Contatore {
  private valore = 0

  incrementa(passo: number = 1): number {
    this.valore += passo
    return this.valore
  }

  azzera(): void {
    this.valore = 0
  }

  get corrente(): number {
    return this.valore
  }
}
`,
      'src/main.ts': `import { Contatore } from './contatore'

const contatore = new Contatore()
const valore = document.querySelector<HTMLParagraphElement>('#valore')!
const incrementa = document.querySelector<HTMLButtonElement>('#incrementa')!
const azzera = document.querySelector<HTMLButtonElement>('#azzera')!

function aggiorna(): void {
  valore.textContent = String(contatore.corrente)
}

incrementa.addEventListener('click', () => {
  const nuovo = contatore.incrementa()
  console.log('Nuovo valore:', nuovo)
  aggiorna()
})

azzera.addEventListener('click', () => {
  contatore.azzera()
  console.info('Contatore azzerato')
  aggiorna()
})

aggiorna()
`,
      'tsconfig.json': TSCONFIG_WEB
    }
  },
  {
    id: 'console-ts',
    title: 'Programma console TypeScript',
    description: 'Un programma che dialoga nel terminale: legge l’input e stampa risultati.',
    mode: 'terminal',
    entry: 'src/main.ts',
    files: {
      'src/main.ts': `// Esegui con "Esegui nel terminale" (Ctrl+F5): il programma ti farà una domanda.
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { media } from './statistiche'

const rl = readline.createInterface({ input, output })

const nome = await rl.question('Come ti chiami? ')
console.log(\`Ciao \${nome}! Scrivi alcuni numeri separati da spazio.\`)

const riga = await rl.question('Numeri: ')
const numeri = riga
  .split(/\\s+/)
  .filter(Boolean)
  .map(Number)
  .filter((n) => !Number.isNaN(n))

if (numeri.length === 0) {
  console.log('Nessun numero valido.')
} else {
  console.table({ quanti: numeri.length, media: media(numeri), massimo: Math.max(...numeri) })
}

rl.close()
`,
      'src/statistiche.ts': `export function media(valori: number[]): number {
  if (valori.length === 0) throw new Error('Serve almeno un valore')
  const somma = valori.reduce((totale, v) => totale + v, 0)
  return somma / valori.length
}
`,
      'tsconfig.json': TSCONFIG_NODE
    }
  },
  {
    id: 'console-js',
    title: 'Programma console JavaScript',
    description: 'JavaScript eseguito con Node.js nel terminale integrato.',
    mode: 'terminal',
    entry: 'main.js',
    files: {
      'main.js': `// Esegui con "Esegui nel terminale" (Ctrl+F5).
const persone = [
  { nome: 'Anna', anni: 31 },
  { nome: 'Luca', anni: 24 },
  { nome: 'Sara', anni: 42 }
]

const maggiori30 = persone.filter((p) => p.anni > 30).map((p) => p.nome)
console.log('Più di 30 anni:', maggiori30)

for (const p of persone) {
  console.log(\`\${p.nome.padEnd(6)} \${'█'.repeat(Math.round(p.anni / 3))} \${p.anni}\`)
}
`
    }
  },
  {
    id: 'empty',
    title: 'Progetto vuoto',
    description: 'Solo una cartella e un index.html minimo.',
    mode: 'web',
    entry: 'index.html',
    files: {
      'index.html': `<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <title>Nuovo progetto</title>
  </head>
  <body>
  </body>
</html>
`
    }
  }
]

export function listTemplates(): ProjectTemplate[] {
  return TEMPLATES.map(({ id, title, description, mode }) => ({ id, title, description, mode }))
}

export function sanitizeProjectName(name: string): string {
  const cleaned = name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').replace(/[. ]+$/, '')
  if (!cleaned) throw new Error('Nome del progetto non valido')
  return cleaned
}

/** Crea la cartella del progetto con i file del modello. Restituisce la radice. */
export async function createFromTemplate(templateId: string, name: string, location: string): Promise<string> {
  const template = TEMPLATES.find((t) => t.id === templateId)
  if (!template) throw new Error(`Modello sconosciuto: ${templateId}`)
  const projectName = sanitizeProjectName(name)
  const root = resolve(location, projectName)
  if (existsSync(root)) throw new Error(`La cartella esiste già: ${root}`)
  const config: ProjectConfig = { name: projectName, run: { mode: template.mode, entry: template.entry } }
  const files: Record<string, string> = { ...template.files, [PROJECT_CONFIG_FILE]: JSON.stringify(config, null, 2) + '\n' }
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, normalizeRelative(path))
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content, 'utf8')
  }
  return root
}
