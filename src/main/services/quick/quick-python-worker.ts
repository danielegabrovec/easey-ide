// Worker Python della Scrittura rapida: Pyodide (CPython compilato in WebAssembly, nessuna installazione).
// Il main ne tiene uno già caricato ("caldo") per partire subito; ogni worker esegue UN programma e poi
// viene buttato (stato pulito, e si può terminare anche in un ciclo infinito).
//
// La strumentazione la fa Python stesso con il modulo `ast`:
//  - espressione di primo livello  → __easey_v(riga, valore)  (valore accanto alla riga)
//  - assegnazione di primo livello → __easey_vd(riga, nome, valore)
//  - print()                       → con la riga di chi stampa (sys._getframe)
// Importa solo moduli di Node e pyodide (che nell'app installata sta in app.asar.unpacked).
import { parentPort } from 'node:worker_threads'
import { loadPyodide } from 'pyodide'
import type { QuickWorkerEvent, QuickWorkerMessage } from './quick-worker'

export interface QuickPythonJob {
  code: string
  maxEvents: number
}

const port = parentPort!

const HARNESS = String.raw`
import ast, builtins, sys, traceback

_FILENAME = "<scrittura-rapida>"

def _short(text, limit=2000):
    return text if len(text) <= limit else text[: limit - 1] + "…"

def _names(target, out):
    if isinstance(target, ast.Name):
        out.append(target.id)
    elif isinstance(target, (ast.Tuple, ast.List)):
        for item in target.elts:
            _names(item, out)
    elif isinstance(target, ast.Starred):
        _names(target.value, out)
    return out

def _is_print(node):
    return isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "print"

def _call(name, *args):
    return ast.Expr(ast.Call(func=ast.Name(name, ast.Load()), args=list(args), keywords=[]))

def __easey_run(source, emit_log, emit_value, emit_error):
    try:
        tree = ast.parse(source, _FILENAME)
    except SyntaxError as error:
        emit_error(f"{type(error).__name__}: {error.msg}", error.lineno or 0, "syntax")
        return False
    body = []
    for node in tree.body:
        if isinstance(node, ast.Expr) and not _is_print(node.value):
            replaced = _call("__easey_v", ast.Constant(node.end_lineno), node.value)
            body.append(ast.copy_location(replaced, node))
            continue
        body.append(node)
        targets = []
        if isinstance(node, ast.Assign):
            for target in node.targets:
                _names(target, targets)
        elif isinstance(node, (ast.AnnAssign, ast.AugAssign)) and node.value is not None:
            _names(node.target, targets)
        for name in targets:
            extra = _call("__easey_vd", ast.Constant(node.end_lineno), ast.Constant(name), ast.Name(name, ast.Load()))
            body.append(ast.copy_location(extra, node))
    tree.body = body
    ast.fix_missing_locations(tree)
    code = compile(tree, _FILENAME, "exec")

    def value(line, result):
        if result is not None:
            emit_value(line, _short(repr(result)), None)

    def declared(line, name, result):
        emit_value(line, _short(repr(result)), name)

    def easey_print(*args, sep=" ", end="\n", file=None, flush=False):
        if file is not None and file not in (sys.stdout, sys.stderr):
            return builtins.print(*args, sep=sep, end=end, file=file, flush=flush)
        frame = sys._getframe(1)
        while frame is not None and frame.f_code.co_filename != _FILENAME:
            frame = frame.f_back
        text = (sep if sep is not None else " ").join(str(a) for a in args)
        if end not in (None, "\n"):
            text += end
        emit_log(text, frame.f_lineno if frame is not None else 0, "error" if file is sys.stderr else "log")

    def easey_input(prompt=""):
        raise RuntimeError("input() non è disponibile nella scrittura rapida: assegna il valore a una variabile (o crea un progetto console).")

    scope = {"__name__": "__main__", "__builtins__": builtins, "__easey_v": value, "__easey_vd": declared, "print": easey_print, "input": easey_input}
    try:
        exec(code, scope)
        return True
    except BaseException as error:
        frames = [f for f in traceback.extract_tb(error.__traceback__) if f.filename == _FILENAME]
        line = frames[-1].lineno if frames else 0
        emit_error(f"{type(error).__name__}: {error}", line or 0, "runtime")
        return False
`

let sent = 0
let truncated = false
let maxEvents = 2000

function post(event: QuickWorkerEvent): void {
  if (sent >= maxEvents) {
    if (!truncated) port.postMessage({ type: 'truncated' } satisfies QuickWorkerMessage)
    truncated = true
    return
  }
  sent++
  port.postMessage({ type: 'event', event } satisfies QuickWorkerMessage)
}

const ready = (async () => {
  const pyodide = await loadPyodide()
  // Scritture dirette su sys.stdout / sys.stderr (non da print): senza riga.
  pyodide.setStdout({ batched: (text: string) => post({ kind: 'log', level: 'log', text }) })
  pyodide.setStderr({ batched: (text: string) => post({ kind: 'log', level: 'error', text }) })
  pyodide.runPython(HARNESS)
  return pyodide
})()

ready.then(
  () => port.postMessage({ type: 'loaded' } satisfies QuickWorkerMessage),
  (error: Error) => port.postMessage({ type: 'event', event: { kind: 'error', message: `Python non si avvia: ${error.message}` } } satisfies QuickWorkerMessage)
)

port.once('message', async (job: QuickPythonJob) => {
  maxEvents = job.maxEvents
  let ok = false
  try {
    const pyodide = await ready
    const run = pyodide.globals.get('__easey_run') as (source: string, ...callbacks: unknown[]) => boolean
    port.postMessage({ type: 'started' } satisfies QuickWorkerMessage)
    ok = run(
      job.code,
      (text: string, line: number, level: 'log' | 'error') => post({ kind: 'log', level, text, line: line || undefined }),
      (line: number, text: string, name: string | undefined) => post({ kind: 'value', line, text, name: name ?? undefined }),
      (message: string, line: number, phase: string) => post({ kind: 'error', message, at: line ? { line, column: 1 } : undefined, phase: phase === 'syntax' ? 'syntax' : 'runtime' })
    )
  } catch (error) {
    post({ kind: 'error', message: (error as Error).message })
  }
  port.postMessage({ type: 'done', status: ok ? 'ok' : 'error' } satisfies QuickWorkerMessage)
})
