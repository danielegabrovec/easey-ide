// Linguaggi nativi della Scrittura rapida: C, C++ (gcc/g++), C# (.NET SDK 10, file .cs eseguito da solo),
// Java (JDK, lanciatore dei file sorgente) e Rust (rustc). Si usano i compilatori installati sul PC:
// includerli nell'app costerebbe centinaia di MB. Ogni linguaggio ha una cartella di lavoro temporanea;
// compilazione con tempo largo, esecuzione con il tempo massimo dell'utente, input da tastiera dal
// riquadro «Input», processo (e figli) terminato su Ferma o allo scadere del tempo.
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { TOOLCHAIN_INSTALL, type NativeLanguage, type QuickRunEvent, type QuickRunRequest, type QuickToolchain } from '@shared/contracts/quick'
import {
  NATIVE_SOURCE,
  describeExitCode,
  javaCompilationFailed,
  majorOf,
  nativeSource,
  parseDiagnostics,
  runtimeError,
  rustEdition,
  versionIn
} from '@shared/quick/native'

const COMPILE_TIMEOUT_MS = 180_000
/** Java compila in memoria prima di partire: qualche secondo in più del tempo massimo. */
const JAVA_EXTRA_MS = 4000
const MAX_STDERR = 20_000

export interface NativeContext {
  push: (event: QuickRunEvent) => void
  finish: (status: 'ok' | 'error' | 'timeout' | 'stopped', exitCode?: number) => void
  finished: () => boolean
  /** Processo da chiudere (con i figli) se l'esecuzione viene fermata. */
  track: (child: ChildProcess) => void
  /** Da ora conta il tempo massimo dell'utente. */
  started: (extraMs?: number) => void
  /** Conteggio delle righe per il limite di output (true = superato, l'esecuzione va fermata). */
  countLine: () => boolean
}

interface Resolved extends QuickToolchain {
  /** Percorso completo del programma principale (gcc, g++, dotnet, java, rustc). */
  exe?: string
  env: NodeJS.ProcessEnv
  edition?: string
}

function run(file: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(file, args, { env, windowsHide: true, timeout: 15000, encoding: 'utf8' }, (error, stdout, stderr) => {
      const code = error ? (typeof (error as { code?: unknown }).code === 'number' ? ((error as { code: number }).code) : -1) : 0
      resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), code })
    })
  })
}

/** PATH aggiornato: quello del processo + quelli salvati nel registro (programmi installati dopo l'avvio dell'IDE). */
async function freshPath(): Promise<string[]> {
  const dirs = (process.env['Path'] ?? process.env['PATH'] ?? '').split(delimiter)
  if (process.platform === 'win32') {
    for (const key of ['HKCU\\Environment', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment']) {
      const { stdout } = await run('reg', ['query', key, '/v', 'Path'], process.env)
      const value = /Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/i.exec(stdout)?.[1] ?? ''
      dirs.push(...value.split(';').map((d) => d.replace(/%([^%]+)%/g, (_, name: string) => process.env[name] ?? '')))
    }
  }
  return [...new Set(dirs.map((d) => d.trim()).filter(Boolean))]
}

function subdirs(parent: string, pattern: RegExp, tail: string): string[] {
  try {
    return readdirSync(parent, { withFileTypes: true })
      .filter((e) => e.isDirectory() && pattern.test(e.name))
      .map((e) => join(parent, e.name, tail))
      .sort()
      .reverse()
  } catch {
    return []
  }
}

/** Cartelle dove i compilatori stanno di solito anche se non sono nel PATH. */
function extraDirs(language: NativeLanguage): string[] {
  const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files'
  const local = process.env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local')
  switch (language) {
    case 'c':
    case 'cpp':
      return [
        'C:\\msys64\\ucrt64\\bin',
        'C:\\msys64\\mingw64\\bin',
        'C:\\mingw64\\bin',
        'C:\\MinGW\\bin',
        join(local, 'Microsoft', 'WinGet', 'Links'),
        ...subdirs(join(local, 'Microsoft', 'WinGet', 'Packages'), /^BrechtSanders\.WinLibs/i, join('mingw64', 'bin'))
      ]
    case 'java':
      return [
        ...(process.env['JAVA_HOME'] ? [join(process.env['JAVA_HOME'], 'bin')] : []),
        ...['Eclipse Adoptium', 'Java', 'Microsoft', 'Zulu', 'Amazon Corretto', 'BellSoft'].flatMap((vendor) => subdirs(join(programFiles, vendor), /^(jdk|zulu|java)/i, 'bin'))
      ]
    case 'csharp':
      return [join(programFiles, 'dotnet'), join(homedir(), '.dotnet')]
    case 'rust':
      return [join(process.env['CARGO_HOME'] ?? join(homedir(), '.cargo'), 'bin')]
  }
}

function find(command: string, dirs: string[]): string | null {
  for (const dir of dirs) {
    const candidate = join(dir, process.platform === 'win32' ? `${command}.exe` : command)
    if (existsSync(candidate)) return candidate
  }
  return null
}

function killTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.pid === undefined) return
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }).on('error', () => child.kill())
  else child.kill('SIGKILL')
}

export class NativeToolchains {
  private cache: Map<NativeLanguage, Promise<Resolved>> = new Map()

  async list(refresh = false): Promise<QuickToolchain[]> {
    if (refresh) this.cache.clear()
    const all = await Promise.all((['c', 'cpp', 'csharp', 'java', 'rust'] as NativeLanguage[]).map((l) => this.resolve(l)))
    return all.map(({ language, available, command, version, problem, install }) => ({ language, available, command, version, problem, install }))
  }

  resolve(language: NativeLanguage): Promise<Resolved> {
    let pending = this.cache.get(language)
    if (!pending) {
      pending = this.detect(language)
      this.cache.set(language, pending)
    }
    return pending
  }

  private async detect(language: NativeLanguage): Promise<Resolved> {
    const install = TOOLCHAIN_INSTALL[language]
    // Collaudi: LAB_IDE_NO_TOOLCHAINS=rust,java simula i compilatori mancanti.
    if ((process.env['LAB_IDE_NO_TOOLCHAINS'] ?? '').split(',').includes(language)) {
      return { language, available: false, install, env: process.env, problem: 'disattivato per il collaudo (LAB_IDE_NO_TOOLCHAINS)' }
    }
    const path = [...(await freshPath()), ...extraDirs(language)]
    const program = { c: 'gcc', cpp: 'g++', csharp: 'dotnet', java: 'java', rust: 'rustc' }[language]
    const exe = find(program, path)
    const base: Resolved = { language, available: false, install, env: process.env }
    if (!exe) return { ...base, problem: `${program} non trovato` }
    // Il programma (e le sue DLL, es. quelle di MSYS2) va per primo nel PATH dei processi figli.
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: [dirname(exe), ...path].join(delimiter),
      Path: undefined,
      DOTNET_CLI_TELEMETRY_OPTOUT: '1',
      DOTNET_NOLOGO: '1',
      DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
      DOTNET_CLI_UI_LANGUAGE: 'en',
      RUST_BACKTRACE: '0'
    }
    delete env['Path']
    const found: Resolved = { ...base, exe, command: exe, env }
    if (language === 'java') {
      const { stderr, stdout } = await run(exe, ['-version'], env)
      const version = versionIn((stderr || stdout).split('\n')[0] ?? '')
      if (!existsSync(join(dirname(exe), process.platform === 'win32' ? 'javac.exe' : 'javac'))) return { ...found, version, problem: 'serve il JDK (con javac), non solo il JRE' }
      if (majorOf(version) < 11) return { ...found, version, problem: `serve Java 11 o successivo (trovato ${version ?? '?'})` }
      return { ...found, version, available: true }
    }
    if (language === 'csharp') {
      const { stdout } = await run(exe, ['--list-sdks'], env)
      const versions = stdout.split('\n').map((l) => versionIn(l.split('[')[0] ?? '')).filter((v): v is string => !!v)
      const best = versions.sort((a, b) => majorOf(b) - majorOf(a))[0]
      if (!best) return { ...found, problem: 'c’è il runtime .NET ma non l’SDK' }
      if (majorOf(best) < 10) return { ...found, version: best, problem: `serve .NET SDK 10 o successivo per eseguire un file .cs da solo (trovato ${best})` }
      return { ...found, version: best, available: true }
    }
    const { stdout, stderr, code } = await run(exe, ['--version'], env)
    if (code !== 0 && !stdout) return { ...found, problem: stderr.trim().split('\n')[0] || `${program} non risponde` }
    const version = versionIn(stdout.split('\n')[0] ?? '')
    return { ...found, version, available: true, edition: language === 'rust' ? rustEdition(version) : undefined }
  }
}

interface Plan {
  compile?: { file: string; args: string[] }
  run: { file: string; args: string[] }
}

function plan(language: NativeLanguage, tool: Resolved, dir: string): Plan {
  const exe = tool.exe!
  const program = join(dir, 'programma.exe')
  switch (language) {
    case 'c':
      return { compile: { file: exe, args: ['-std=c17', '-g', '-O0', '-Wall', '-fdiagnostics-color=never', 'main.c', '-o', program, '-static', '-lm'] }, run: { file: program, args: [] } }
    case 'cpp':
      return { compile: { file: exe, args: ['-std=c++20', '-g', '-O0', '-Wall', '-fdiagnostics-color=never', 'main.cpp', '-o', program, '-static'] }, run: { file: program, args: [] } }
    case 'rust':
      return {
        compile: { file: exe, args: ['--edition', tool.edition ?? '2021', '-g', '-C', 'opt-level=0', '--error-format=short', '--color=never', 'main.rs', '-o', program] },
        run: { file: program, args: [] }
      }
    case 'csharp':
      return {
        compile: { file: exe, args: ['build', 'app.cs', '-o', join(dir, 'out'), '-nologo', '-v', 'q', '-clp:NoSummary', '-p:PublishAot=false', '-p:TreatWarningsAsErrors=false'] },
        run: { file: join(dir, 'out', process.platform === 'win32' ? 'app.exe' : 'app'), args: [] }
      }
    case 'java':
      return { run: { file: exe, args: ['-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8', '-Dfile.encoding=UTF-8', '-XX:TieredStopAtLevel=1', '-XX:+UseSerialGC', 'Main.java'] } }
  }
}

/** Compila ed esegue un programma nativo; gli eventi vanno a `ctx` (stesso formato di JS e Python). */
export async function runNative(ctx: NativeContext, request: QuickRunRequest & { language: NativeLanguage }, toolchains: NativeToolchains, workRoot: string): Promise<void> {
  const { language, runId } = request
  const tool = await toolchains.resolve(language)
  if (ctx.finished()) return
  if (!tool.available) {
    ctx.push({ runId, kind: 'error', phase: 'compile', message: `Manca ${tool.install.name}: si installa con «${tool.install.winget}».` })
    ctx.finish('error')
    return
  }
  const dir = join(workRoot, language)
  await mkdir(dir, { recursive: true })
  const userLines = request.code.split('\n').length
  await writeFile(join(dir, NATIVE_SOURCE[language]), nativeSource(language, request.code), 'utf8')
  const steps = plan(language, tool, dir)

  if (steps.compile) {
    const output = await new Promise<{ text: string; code: number | null } | null>((resolve) => {
      const child = spawn(steps.compile!.file, steps.compile!.args, { cwd: dir, env: tool.env, windowsHide: true })
      ctx.track(child)
      let text = ''
      const timer = setTimeout(() => killTree(child), COMPILE_TIMEOUT_MS)
      child.stdout.on('data', (chunk: Buffer) => (text += chunk.toString('utf8')))
      child.stderr.on('data', (chunk: Buffer) => (text += chunk.toString('utf8')))
      child.on('error', (error) => {
        clearTimeout(timer)
        text += `\n${error.message}`
        resolve({ text, code: -1 })
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        resolve(ctx.finished() ? null : { text, code })
      })
    })
    if (!output) return
    const diagnostics = parseDiagnostics(language, output.text, userLines)
    for (const d of diagnostics) {
      if (d.severity === 'warning') ctx.push({ runId, kind: 'log', level: 'warn', text: `avviso: ${d.message}`, line: d.line })
      else ctx.push({ runId, kind: 'error', phase: 'compile', message: d.message, line: d.line })
    }
    if (output.code !== 0) {
      if (!diagnostics.some((d) => d.severity === 'error')) {
        const tail = output.text.trim().split(/\r?\n/).slice(-15).join('\n')
        ctx.push({ runId, kind: 'error', phase: 'compile', message: tail || 'Compilazione non riuscita.' })
      }
      ctx.finish('error')
      return
    }
  }

  // Esecuzione con l'input del riquadro e il tempo massimo dell'utente.
  const child = spawn(steps.run.file, steps.run.args, { cwd: dir, env: tool.env, windowsHide: true })
  ctx.track(child)
  ctx.started(language === 'java' ? JAVA_EXTRA_MS : 0)
  child.stdin.on('error', () => undefined) // il programma può finire senza leggere tutto l'input
  child.stdin.end(request.stdin ?? '')
  let stderrAll = ''
  const streamLines = (level: 'log' | 'error') => {
    const decoder = new StringDecoder('utf8')
    let pending = ''
    const emit = (text: string) => {
      if (ctx.finished()) return
      if (ctx.countLine()) {
        killTree(child)
        return
      }
      ctx.push({ runId, kind: 'log', level, text })
    }
    return {
      write(chunk: Buffer) {
        pending += decoder.write(chunk)
        let newline = pending.indexOf('\n')
        while (newline >= 0) {
          emit(pending.slice(0, newline).replace(/\r$/, ''))
          pending = pending.slice(newline + 1)
          newline = pending.indexOf('\n')
        }
      },
      end() {
        pending += decoder.end()
        if (pending) emit(pending.replace(/\r$/, ''))
        pending = ''
      }
    }
  }
  const out = streamLines('log')
  // Java: lo stderr si legge alla fine (può contenere gli errori di compilazione del lanciatore).
  const err = language === 'java' ? null : streamLines('error')
  child.stdout.on('data', (chunk: Buffer) => out.write(chunk))
  child.stderr.on('data', (chunk: Buffer) => {
    if (stderrAll.length < MAX_STDERR) stderrAll += chunk.toString('utf8')
    err?.write(chunk)
  })
  child.on('error', (error) => {
    if (ctx.finished()) return
    ctx.push({ runId, kind: 'error', phase: 'runtime', message: `Il programma non parte: ${error.message}` })
    ctx.finish('error')
  })
  child.on('close', (code) => {
    if (ctx.finished()) return
    out.end()
    err?.end()
    if (language === 'java' && javaCompilationFailed(stderrAll)) {
      const diagnostics = parseDiagnostics('java', stderrAll, userLines)
      for (const d of diagnostics) {
        if (d.severity === 'warning') ctx.push({ runId, kind: 'log', level: 'warn', text: `avviso: ${d.message}`, line: d.line })
        else ctx.push({ runId, kind: 'error', phase: 'compile', message: d.message, line: d.line })
      }
      if (!diagnostics.some((d) => d.severity === 'error')) ctx.push({ runId, kind: 'error', phase: 'compile', message: stderrAll.trim().slice(-2000) })
      ctx.finish('error', code ?? undefined)
      return
    }
    if (language === 'java' && stderrAll.trim()) {
      for (const text of stderrAll.replace(/\r/g, '').replace(/\n$/, '').split('\n')) ctx.push({ runId, kind: 'log', level: 'error', text })
    }
    if (code !== 0) {
      const found = runtimeError(language, stderrAll)
      const explanation = describeExitCode(code, language)
      ctx.push({ runId, kind: 'error', phase: 'runtime', message: found.message ? `${found.message}\n${explanation}` : explanation, line: found.line })
    }
    ctx.finish(code === 0 ? 'ok' : 'error', code ?? undefined)
  })
}

export { killTree }
