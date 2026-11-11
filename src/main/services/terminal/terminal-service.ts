// Terminali integrati: shell vera (node-pty), esecuzione di script JS/TS e REPL Node.
// Gli script girano col Node incluso in Electron (ELECTRON_RUN_AS_NODE): l'utente non deve installare nulla.
// Se node-pty non è caricabile si ripiega su processi con pipe (niente TTY, ma funziona).
import { spawn as spawnChild, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { formatMessages } from 'esbuild'
import { loadEsbuild } from '../esbuild-loader'
import type {
  CreateTerminalRequest,
  ShellOption,
  TerminalCapabilities,
  TerminalData,
  TerminalExit,
  TerminalSessionInfo
} from '@shared/contracts/runner'
import { isScriptFile, normalizeRelative } from '@shared/paths'
import type { WorkspaceService } from '../workspace/workspace-service'

type PtyModule = typeof import('@lydell/node-pty')
type Pty = ReturnType<PtyModule['spawn']>

interface Session {
  info: TerminalSessionInfo
  pty?: Pty
  child?: ChildProcess
  cleanup?: () => Promise<void>
  started?: number
  /** Riga in composizione quando il processo non ha un TTY (eco e Backspace gestiti qui). */
  line: string
}

interface NodeRuntime {
  file: string
  env: Record<string, string>
  /** Il Node interno di Electron è un'app "grafica": nella pseudo-console non riceve lo stdin → si usano le pipe. */
  usePty: boolean
  source: 'system' | 'bundled'
  version: string
}

/** Node di sistema (se installato, versione ≥ 18): TTY completo, colori, tasti freccia. */
function detectSystemNode(): { file: string; version: string } | null {
  try {
    const lookup = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['node'], { encoding: 'utf8', windowsHide: true, timeout: 5000 })
    const file = lookup.stdout?.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0)
    if (!file || !existsSync(file)) return null
    const version = spawnSync(file, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 5000 }).stdout?.trim() ?? ''
    const major = Number(/^v(\d+)/.exec(version)?.[1] ?? 0)
    return major >= 18 ? { file, version: version.replace(/^v/, '') } : null
  } catch {
    return null
  }
}

const NL = '\r\n'
const ANSI = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`
}

const nodeRequire = createRequire(import.meta.url)

function loadPty(): PtyModule | null {
  try {
    return nodeRequire('@lydell/node-pty') as PtyModule
  } catch {
    return null
  }
}

interface ShellDefinition extends ShellOption {
  file: string
  args: string[]
}

function detectShells(): ShellDefinition[] {
  if (process.platform !== 'win32') {
    const shell = process.env['SHELL'] || '/bin/bash'
    return [{ id: 'default', label: shell, file: shell, args: [] }]
  }
  const shells: ShellDefinition[] = []
  const systemRoot = process.env['SystemRoot'] || 'C:\\Windows'
  const pwsh = ['C:\\Program Files\\PowerShell\\7\\pwsh.exe'].find((p) => existsSync(p))
  if (pwsh) shells.push({ id: 'pwsh', label: 'PowerShell 7', file: pwsh, args: ['-NoLogo'] })
  shells.push({ id: 'powershell', label: 'Windows PowerShell', file: join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), args: ['-NoLogo'] })
  shells.push({ id: 'cmd', label: 'Prompt dei comandi', file: join(systemRoot, 'System32', 'cmd.exe'), args: [] })
  const gitBash = ['C:\\Program Files\\Git\\bin\\bash.exe'].find((p) => existsSync(p))
  if (gitBash) shells.push({ id: 'gitbash', label: 'Git Bash', file: gitBash, args: ['--login', '-i'] })
  return shells
}

export class TerminalService {
  private readonly pty = loadPty()
  private readonly shells = detectShells()
  private nodeRuntime: NodeRuntime | null = null
  private readonly sessions = new Map<string, Session>()
  private counter = 0
  private readonly buffers = new Map<string, string>()
  private flushTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly workspace: WorkspaceService,
    private readonly tempDir: string,
    private readonly emitData: (payload: TerminalData) => void,
    private readonly emitExit: (payload: TerminalExit) => void,
    private readonly defaultShell: () => Promise<string>
  ) {}

  capabilities(): TerminalCapabilities {
    const node = this.runtime()
    return { pty: this.pty !== null, shells: this.shells.map(({ id, label }) => ({ id, label })), node: { source: node.source, version: node.version } }
  }

  private runtime(): NodeRuntime {
    if (this.nodeRuntime) return this.nodeRuntime
    // LAB_IDE_FORCE_BUNDLED_NODE=1 forza il Node interno (collaudo del ripiego senza Node installato).
    const system = this.pty && !process.env['LAB_IDE_FORCE_BUNDLED_NODE'] ? detectSystemNode() : null
    this.nodeRuntime = system
      ? { file: system.file, env: { FORCE_COLOR: '1' }, usePty: true, source: 'system', version: system.version }
      : { file: process.execPath, env: { ELECTRON_RUN_AS_NODE: '1', FORCE_COLOR: '1' }, usePty: false, source: 'bundled', version: process.versions.node }
    return this.nodeRuntime
  }

  async create(request: CreateTerminalRequest): Promise<TerminalSessionInfo> {
    const id = `t${++this.counter}`
    const cwd = this.workspace.root() ?? process.env['USERPROFILE'] ?? process.cwd()
    if (request.kind === 'shell') {
      const wanted = request.shellId ?? (await this.defaultShell())
      const shell = this.shells.find((s) => s.id === wanted) ?? this.shells[0]!
      const info: TerminalSessionInfo = { id, kind: 'shell', title: shell.label }
      this.start(info, shell.file, shell.args, cwd, {}, true)
      return info
    }
    if (request.kind === 'repl') {
      const info: TerminalSessionInfo = { id, kind: 'repl', title: 'REPL JavaScript' }
      const node = this.runtime()
      this.start(info, node.file, ['-i'], cwd, node.env, node.usePty)
      return info
    }
    return this.run(id, request.entry)
  }

  /** Compila lo script (TS o JS, con i suoi import) in un unico modulo ESM e lo esegue col Node interno. */
  private async run(id: string, entry: string): Promise<TerminalSessionInfo> {
    const relative = normalizeRelative(entry)
    if (!isScriptFile(relative)) throw new Error(`Non è uno script eseguibile: ${relative}`)
    const root = this.workspace.root()
    if (!root) throw new Error('Nessun progetto aperto')
    const info: TerminalSessionInfo = { id, kind: 'run', title: `▶ ${relative}` }
    const absolute = this.workspace.absolute(relative)
    const outDir = join(this.tempDir, 'run')
    await mkdir(outDir, { recursive: true })
    const outfile = join(outDir, `${id}-${Date.now()}.mjs`)
    const started = Date.now()
    const esbuild = await loadEsbuild()
    try {
      await esbuild.build({
        entryPoints: [absolute],
        absWorkingDir: root,
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node22',
        packages: 'external',
        sourcemap: 'inline',
        sourcesContent: false,
        outfile,
        logLevel: 'silent',
        banner: {
          // Permette `require` anche nei moduli ESM generati.
          js: "import { createRequire as __ideCreateRequire } from 'node:module'; const require = __ideCreateRequire(import.meta.url);"
        }
      })
    } catch (error) {
      const errors = (error as { errors?: Parameters<typeof formatMessages>[0] }).errors ?? []
      const formatted = errors.length ? await esbuild.formatMessages(errors, { kind: 'error', color: true }) : [String((error as Error).message)]
      this.sessions.set(id, { info, line: '' })
      setTimeout(() => {
        this.push(id, ANSI.red(`✖ Errore di compilazione in ${relative}`) + NL + NL + formatted.join('\n').split('\n').join(NL))
        this.finish(id, 1)
      }, 50)
      return info
    }
    const node = this.runtime()
    const origin = node.source === 'system' ? 'Node.js' : 'Node.js interno'
    this.push(id, ANSI.cyan(`▶ Esecuzione di ${relative}`) + ANSI.dim(`  (${origin} ${node.version})`) + NL + NL)
    this.start(info, node.file, ['--enable-source-maps', outfile], root, node.env, node.usePty, () => rm(outfile, { force: true }))
    const session = this.sessions.get(id)
    if (session) session.started = started
    return info
  }

  private start(info: TerminalSessionInfo, file: string, args: string[], cwd: string, extraEnv: Record<string, string>, usePty: boolean, cleanup?: () => Promise<void>): void {
    const env = { ...process.env, ...extraEnv } as Record<string, string>
    const session: Session = { info, cleanup, line: '' }
    this.sessions.set(info.id, session)
    if (this.pty && usePty) {
      const pty = this.pty.spawn(file, args, { name: 'xterm-256color', cols: 100, rows: 30, cwd, env })
      session.pty = pty
      pty.onData((data) => this.push(info.id, data))
      pty.onExit(({ exitCode }) => this.finish(info.id, exitCode))
      return
    }
    const child = spawnChild(file, args, { cwd, env, stdio: 'pipe', windowsHide: true })
    session.child = child
    const forward = (chunk: Buffer) => this.push(info.id, chunk.toString('utf8').split(/\r?\n/).join(NL))
    child.stdout?.on('data', forward)
    child.stderr?.on('data', forward)
    child.on('exit', (code) => this.finish(info.id, code ?? 0))
    child.on('error', (error) => {
      this.push(info.id, ANSI.red(`Impossibile avviare: ${error.message}`) + NL)
      this.finish(info.id, 1)
    })
  }

  write(id: string, data: string): void {
    const session = this.sessions.get(id)
    if (!session) return
    if (session.pty) {
      session.pty.write(data)
      return
    }
    const child = session.child
    if (!child?.stdin || child.stdin.destroyed) return
    // Senza TTY la "disciplina di riga" la fa l'IDE: eco, Backspace, Invio, Ctrl+C, Ctrl+D.
    for (let i = 0; i < data.length; i++) {
      const char = data[i]!
      if (char === '\x1b') {
        // Sequenze di escape (frecce, tasti funzione): ignorate.
        const match = /^\x1b(\[[0-9;?]*[ -/]*[@-~]|O.|.)/.exec(data.slice(i))
        i += (match?.[0].length ?? 1) - 1
      } else if (char === '\r' || char === '\n') {
        if (char === '\n' && data[i - 1] === '\r') continue
        this.push(id, NL)
        child.stdin.write(session.line + '\n')
        session.line = ''
      } else if (char === '\x7f' || char === '\b') {
        if (session.line.length > 0) {
          session.line = [...session.line].slice(0, -1).join('')
          this.push(id, '\b \b')
        }
      } else if (char === '\x03') {
        this.push(id, '^C' + NL)
        session.line = ''
        child.kill()
      } else if (char === '\x04') {
        child.stdin.end()
      } else if (char >= ' ') {
        session.line += char
        this.push(id, char)
      }
    }
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id)
    if (session?.pty && cols > 0 && rows > 0) {
      try {
        session.pty.resize(Math.floor(cols), Math.floor(rows))
      } catch {
        /* processo già chiuso */
      }
    }
  }

  kill(id: string): void {
    const session = this.sessions.get(id)
    if (!session) return
    try {
      session.pty?.kill()
      session.child?.kill()
    } catch {
      /* già terminato */
    }
    if (!session.pty && !session.child) this.sessions.delete(id)
  }

  killAll(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id)
  }

  private push(id: string, data: string): void {
    this.buffers.set(id, (this.buffers.get(id) ?? '') + data)
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flushBuffers(), 8)
  }

  private flushBuffers(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = null
    for (const [id, data] of this.buffers) this.emitData({ id, data })
    this.buffers.clear()
  }

  private finish(id: string, code: number): void {
    const session = this.sessions.get(id)
    if (session?.info.kind === 'run') {
      const elapsed = session.started ? ` in ${Date.now() - session.started} ms` : ''
      const line = code === 0 ? ANSI.green(`■ Programma terminato (codice 0)${elapsed}`) : ANSI.red(`■ Programma terminato con codice ${code}${elapsed}`)
      this.push(id, NL + line + NL)
    }
    this.flushBuffers()
    this.emitExit({ id, code })
    void session?.cleanup?.()
    this.sessions.delete(id)
  }
}
