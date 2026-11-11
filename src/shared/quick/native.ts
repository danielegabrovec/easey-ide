// Linguaggi nativi della Scrittura rapida (C, C++, C#, Java, Rust): file sorgente, lettura degli errori
// dei compilatori, riga dei crash a runtime, significato dei codici di uscita. Puro (testabile senza Electron).
import type { NativeLanguage } from '../contracts/quick'

export interface Diagnostic {
  severity: 'error' | 'warning'
  line: number
  column?: number
  message: string
}

/** Nome del file sorgente scritto nella cartella di lavoro del linguaggio. */
export const NATIVE_SOURCE: Record<NativeLanguage, string> = { c: 'main.c', cpp: 'main.cpp', csharp: 'app.cs', java: 'Main.java', rust: 'main.rs' }

/**
 * C#: in coda al file un inizializzatore di modulo imposta la console in UTF-8 (altrimenti accenti ed €
 * escono con la codepage della console). Sta DOPO il codice dell'utente: le sue righe non cambiano.
 */
export const CSHARP_EPILOGUE = [
  '',
  '#pragma warning disable CA2255',
  'internal static class __EaseyConsole { [global::System.Runtime.CompilerServices.ModuleInitializer] internal static void Init() { try { global::System.Console.OutputEncoding = new global::System.Text.UTF8Encoding(false); global::System.Console.InputEncoding = new global::System.Text.UTF8Encoding(false); } catch { } } }',
  ''
].join('\n')

export function nativeSource(language: NativeLanguage, code: string): string {
  return language === 'csharp' ? `${code.replace(/\s+$/, '')}\n${CSHARP_EPILOGUE}` : code
}

const PATTERNS: Record<NativeLanguage, RegExp> = {
  // main.c:4:10: error: expected ';' before 'return'
  c: /^(?:.*[\\/])?main\.c:(\d+):(\d+):\s+(fatal error|error|warning):\s+(.*)$/,
  cpp: /^(?:.*[\\/])?main\.cpp:(\d+):(\d+):\s+(fatal error|error|warning):\s+(.*)$/,
  // main.rs:4:18: error[E0308]: mismatched types: expected `i32`, found `&str`   (--error-format=short)
  rust: /^(?:.*[\\/])?main\.rs:(\d+):(\d+):\s+(error|warning)(?:\[\w+\])?:\s+(.*)$/,
  // Main.java:3: error: ';' expected
  java: /^(?:.*[\\/])?Main\.java:(\d+):()\s+(error|warning):\s+(.*)$/,
  // C:\...\app.cs(3,5): error CS1002: ; expected [C:\...\app.cs.csproj]
  csharp: /^(?:.*[\\/])?app\.cs\((\d+),(\d+)\):\s+(error|warning)\s+(\w+:\s+.*?)(?:\s+\[[^\]]*\])?$/
}

/**
 * Errori e avvisi del compilatore con la riga del codice scritto. `maxLine` = righe del codice
 * dell'utente: ciò che cade oltre (il codice aggiunto in coda per C#) si riporta all'ultima riga
 * (errori) o si scarta (avvisi). Avvisi dei pacchetti NuGet (NUxxxx) ignorati.
 */
export function parseDiagnostics(language: NativeLanguage, output: string, maxLine = Number.POSITIVE_INFINITY): Diagnostic[] {
  const found: Diagnostic[] = []
  const seen = new Set<string>()
  for (const raw of output.split(/\r?\n/)) {
    const match = PATTERNS[language].exec(raw.trim())
    if (!match) continue
    const severity = match[3]!.includes('error') ? 'error' : 'warning'
    let message = match[4]!.trim()
    if (language === 'csharp' && /^NU\d+/.test(message)) continue
    let line = Number(match[1])
    if (line > maxLine) {
      if (severity === 'warning') continue
      line = maxLine
    }
    if (language === 'csharp') message = message.replace(/^(\w+):\s+/, '$1 · ')
    const key = `${severity}|${line}|${message}`
    if (seen.has(key)) continue
    seen.add(key)
    found.push({ severity, line, column: match[2] ? Number(match[2]) : undefined, message })
  }
  return found
}

/** Java (lanciatore dei file sorgente): la compilazione è fallita? Gli errori sono nello stesso stderr. */
export function javaCompilationFailed(stderr: string): boolean {
  return /^error: compilation failed/m.test(stderr)
}

const WINDOWS_CODES: Record<number, string> = {
  0xc0000005: 'Accesso a memoria non valida (segmentation fault): un puntatore nullo o un indice fuori dai limiti dell’array?',
  0xc0000094: 'Divisione intera per zero.',
  0xc00000fd: 'Stack overflow: forse una ricorsione che non finisce mai?',
  0xc0000409: 'Il programma si è interrotto da solo (abort, controllo fallito o buffer oltre i limiti).',
  0xc000008e: 'Divisione per zero in virgola mobile.',
  0xc0000135: 'Manca una DLL necessaria al programma.',
  0xc0000374: 'Memoria dinamica corrotta (heap): forse una free() doppia o una scrittura oltre i limiti?'
}

/** Spiegazione di un codice di uscita diverso da zero (codici NTSTATUS di Windows compresi). */
export function describeExitCode(code: number | null, language: NativeLanguage): string {
  if (code === null) return 'Il programma è stato interrotto.'
  const unsigned = code < 0 ? code >>> 0 : code
  if (WINDOWS_CODES[unsigned]) return WINDOWS_CODES[unsigned]!
  if (language === 'rust' && code === 101) return 'Il programma è andato in panico (panic!).'
  if ((language === 'c' || language === 'cpp') && code === 3) return 'Il programma si è interrotto con abort() (es. un assert fallito).'
  return `Il programma è terminato con il codice ${code}.`
}

/** Riga e messaggio di un errore a runtime letti dallo stderr (eccezioni Java/C#, panic di Rust). */
export function runtimeError(language: NativeLanguage, stderr: string): { line?: number; message?: string } {
  const text = stderr.replace(/\r/g, '')
  if (language === 'rust') {
    const match = /panicked at (?:.*[\\/])?main\.rs:(\d+):\d+:\n(.+)/.exec(text)
    if (match) return { line: Number(match[1]), message: `panic: ${match[2]!.trim()}` }
  }
  if (language === 'java') {
    const header = /^Exception in thread "[^"]*" (.+)$/m.exec(text)
    const at = /\((?:.*[\\/])?Main\.java:(\d+)\)/.exec(text)
    return { line: at ? Number(at[1]) : undefined, message: header?.[1]?.trim() }
  }
  if (language === 'csharp') {
    const header = /^Unhandled exception\.\s*(.+)$/m.exec(text)
    const at = /app\.cs:line (\d+)/.exec(text)
    return { line: at ? Number(at[1]) : undefined, message: header?.[1]?.trim() }
  }
  return {}
}

/** Versione "x.y.z" in un testo (es. «gcc.exe (Rev4, Built by MSYS2 project) 16.2.0»): l'ultima trovata. */
export function versionIn(text: string): string | undefined {
  const all = text.match(/\d+\.\d+(?:\.\d+)*/g)
  return all?.[all.length - 1]
}

export function majorOf(version: string | undefined): number {
  return Number(version?.split('.')[0] ?? 0) || 0
}

/** Edizione di Rust da usare con questo rustc (2024 da Rust 1.85). */
export function rustEdition(version: string | undefined): '2021' | '2024' {
  const [major, minor] = (version ?? '0.0').split('.').map(Number)
  return (major ?? 0) > 1 || ((major ?? 0) === 1 && (minor ?? 0) >= 85) ? '2024' : '2021'
}
