// Configurazione unica di Monaco: worker, opzioni TypeScript, temi, tipi di Node su richiesta.
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment
  }
}

let configured = false

export function setupMonaco(): typeof monaco {
  if (configured) return monaco
  configured = true

  window.MonacoEnvironment = {
    getWorker(_id: string, label: string) {
      switch (label) {
        case 'typescript':
        case 'javascript':
          return new TsWorker()
        case 'html':
        case 'handlebars':
        case 'razor':
          return new HtmlWorker()
        case 'css':
        case 'scss':
        case 'less':
          return new CssWorker()
        case 'json':
          return new JsonWorker()
        default:
          return new EditorWorker()
      }
    }
  }

  const ts = monaco.languages.typescript
  const compilerOptions: monaco.languages.typescript.CompilerOptions = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    lib: ['es2022', 'dom', 'dom.iterable'],
    strict: true,
    allowJs: true,
    checkJs: false,
    allowNonTsExtensions: true,
    esModuleInterop: true,
    jsx: ts.JsxEmit.ReactJSX,
    noEmit: true,
    resolveJsonModule: true,
    skipLibCheck: true
  }
  ts.typescriptDefaults.setCompilerOptions(compilerOptions)
  ts.javascriptDefaults.setCompilerOptions({ ...compilerOptions, strict: false })
  // Tutti i file del progetto sono visibili al servizio TS: gli import fra file funzionano.
  ts.typescriptDefaults.setEagerModelSync(true)
  ts.javascriptDefaults.setEagerModelSync(true)
  // 1375/1378: "await" di primo livello. È valido nei moduli ES e nella Scrittura rapida (che esegue
  // il codice dentro una funzione asincrona): non va segnalato come errore.
  const topLevelAwait = [1375, 1378]
  ts.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false, diagnosticCodesToIgnore: topLevelAwait })
  // Nei file JS solo errori di sintassi: i suggerimenti semantici restano attivi.
  ts.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false, diagnosticCodesToIgnore: topLevelAwait })

  monaco.editor.defineTheme('lab-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#1c1f26',
      'editor.lineHighlightBackground': '#232731',
      'editorGutter.background': '#1c1f26',
      'editorLineNumber.foreground': '#4b5263',
      'editorLineNumber.activeForeground': '#9aa3b5'
    }
  })
  monaco.editor.defineTheme('lab-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff',
      'editor.lineHighlightBackground': '#f3f5f9'
    }
  })
  return monaco
}

let nodeTypesLoaded: Promise<void> | null = null

/** Tipi di Node.js (process, fs, readline…) per i progetti console. Caricati solo quando servono. */
export function loadNodeTypes(): Promise<void> {
  if (nodeTypesLoaded) return nodeTypesLoaded
  nodeTypesLoaded = (async () => {
    // Percorsi relativi: la radice di Vite per il renderer è src/renderer, node_modules sta 4 livelli sopra.
    const files = import.meta.glob(
      ['../../../../node_modules/@types/node/**/*.d.ts', '!../../../../node_modules/@types/node/ts5.*/**', '../../../../node_modules/undici-types/**/*.d.ts'],
      { query: '?raw', import: 'default' }
    )
    const ts = monaco.languages.typescript
    await Promise.all(
      Object.entries(files).map(async ([path, load]) => {
        const content = (await load()) as string
        const uri = `file:///${path.slice(path.indexOf('node_modules/'))}`
        ts.typescriptDefaults.addExtraLib(content, uri)
        ts.javascriptDefaults.addExtraLib(content, uri)
      })
    )
  })()
  return nodeTypesLoaded
}

export { monaco }
