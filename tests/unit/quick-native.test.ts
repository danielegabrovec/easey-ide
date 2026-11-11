import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { quickLanguageOf, type NativeLanguage, type QuickRunEvent, type QuickToolchain } from '../../src/shared/contracts/quick'
import { describeExitCode, javaCompilationFailed, nativeSource, parseDiagnostics, runtimeError, rustEdition, versionIn } from '../../src/shared/quick/native'
import { QUICK_KEYWORDS, QUICK_SNIPPETS } from '../../src/shared/quick/snippets'
import { NativeToolchains, runNative, type NativeContext } from '../../src/main/services/quick/native-runner'

describe('errori dei compilatori', () => {
  it('gcc / g++', () => {
    const out = "main.c: In function 'main':\nmain.c:4:10: error: expected ';' before 'return'\n    4 |   printf(\"x\")\n      |          ^\nmain.c:2:7: warning: unused variable 'y' [-Wunused-variable]\nC:/x/ld.exe: undefined reference"
    expect(parseDiagnostics('c', out)).toEqual([
      { severity: 'error', line: 4, column: 10, message: "expected ';' before 'return'" },
      { severity: 'warning', line: 2, column: 7, message: "unused variable 'y' [-Wunused-variable]" }
    ])
    expect(parseDiagnostics('cpp', 'C:\\tmp\\main.cpp:6:1: error: expected primary-expression before \'}\' token')[0]).toMatchObject({ line: 6, severity: 'error' })
  })

  it('rustc (formato breve)', () => {
    const out = 'main.rs:4:18: error[E0308]: mismatched types: expected `i32`, found `&str`\nmain.rs:3:9: warning: unused variable: `x`\nerror: aborting due to 1 previous error'
    const found = parseDiagnostics('rust', out)
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({ severity: 'error', line: 4, message: 'mismatched types: expected `i32`, found `&str`' })
  })

  it('javac (lanciatore dei sorgenti)', () => {
    const out = "Main.java:3: error: ';' expected\n        int x = 1\n                 ^\n1 error\nerror: compilation failed"
    expect(javaCompilationFailed(out)).toBe(true)
    expect(parseDiagnostics('java', out)).toEqual([{ severity: 'error', line: 3, column: undefined, message: "';' expected" }])
  })

  it('C#: righe oltre il codice utente, doppioni e avvisi NuGet', () => {
    const out = [
      'C:\\t\\app.cs(3,5): error CS1002: ; expected [C:\\t\\app.cs.csproj]',
      'C:\\t\\app.cs(3,5): error CS1002: ; expected [C:\\t\\app.cs.csproj]',
      'C:\\t\\app.cs.csproj : warning NU1903: Il pacchetto ha una vulnerabilità',
      'C:\\t\\app.cs(9,1): error CS1513: } expected [C:\\t\\app.cs.csproj]',
      'C:\\t\\app.cs(8,2): warning CS9999: avviso nel codice aggiunto'
    ].join('\n')
    expect(parseDiagnostics('csharp', out, 5)).toEqual([
      { severity: 'error', line: 3, column: 5, message: 'CS1002 · ; expected' },
      { severity: 'error', line: 5, column: 1, message: 'CS1513 · } expected' }
    ])
  })
})

describe('esecuzione: crash, versioni, sorgenti', () => {
  it('runtimeError legge riga e messaggio', () => {
    expect(runtimeError('rust', "\nthread 'main' (1) panicked at main.rs:5:21:\nindex out of bounds: the len is 3 but the index is 7\nnote: …")).toEqual({ line: 5, message: 'panic: index out of bounds: the len is 3 but the index is 7' })
    expect(runtimeError('java', 'Exception in thread "main" java.lang.ArrayIndexOutOfBoundsException: Index 3\n\tat Main.main(Main.java:4)')).toEqual({ line: 4, message: 'java.lang.ArrayIndexOutOfBoundsException: Index 3' })
    expect(runtimeError('csharp', 'Unhandled exception. System.IndexOutOfRangeException: fuori\n   at Program.<Main>$(String[] args) in C:\\x\\app.cs:line 3')).toEqual({ line: 3, message: 'System.IndexOutOfRangeException: fuori' })
    expect(runtimeError('c', 'qualcosa')).toEqual({})
  })

  it('describeExitCode spiega i codici di Windows', () => {
    expect(describeExitCode(3221225477, 'c')).toMatch(/memoria non valida/)
    expect(describeExitCode(-1073741571, 'cpp')).toMatch(/Stack overflow/)
    expect(describeExitCode(101, 'rust')).toMatch(/panico/)
    expect(describeExitCode(7, 'java')).toMatch(/codice 7/)
  })

  it('versioni ed edizione di Rust', () => {
    expect(versionIn('gcc.exe (Rev4, Built by MSYS2 project) 16.2.0')).toBe('16.2.0')
    expect(versionIn('openjdk version "25.0.4.1" 2026-08-18 LTS')).toBe('25.0.4.1')
    expect(rustEdition('1.99.0')).toBe('2024')
    expect(rustEdition('1.80.1')).toBe('2021')
  })

  it('C#: inizializzatore UTF-8 in coda, righe dell utente intatte', () => {
    const source = nativeSource('csharp', 'Console.WriteLine(1);\n\n')
    expect(source.startsWith('Console.WriteLine(1);\n')).toBe(true)
    expect(source).toContain('ModuleInitializer')
    expect(nativeSource('c', 'int main(){}')).toBe('int main(){}')
  })

  it('estensioni, parole chiave e modelli per i nuovi linguaggi', () => {
    expect(['a.c', 'b.cpp', 'c.cc', 'd.cs', 'e.java', 'f.rs'].map(quickLanguageOf)).toEqual(['c', 'cpp', 'cpp', 'csharp', 'java', 'rust'])
    for (const language of ['python', 'c', 'cpp', 'csharp', 'java', 'rust'] as const) {
      expect(QUICK_KEYWORDS[language]?.length).toBeGreaterThan(10)
      expect(QUICK_SNIPPETS[language]?.length).toBeGreaterThan(3)
    }
  })
})

// Compila ed esegue davvero con i compilatori del PC; un linguaggio senza compilatore viene saltato.
describe('compilatori installati (integrazione)', () => {
  const work = mkdtempSync(join(tmpdir(), 'lab-quick-native-'))
  const toolchains = new NativeToolchains()
  let found: QuickToolchain[] = []
  beforeAll(async () => {
    found = await toolchains.list()
  }, 60000)
  afterAll(() => {
    // I build server di .NET restano attivi qualche minuto con questa cartella come cartella corrente.
    try {
      rmSync(work, { recursive: true, force: true })
    } catch {
      /* verrà pulita dal sistema */
    }
  })

  async function execute(language: NativeLanguage, code: string, stdin = '', timeoutMs = 5000) {
    const events: QuickRunEvent[] = []
    let timer: NodeJS.Timeout | undefined
    let lines = 0
    const children: { kill: () => void }[] = []
    const result = await new Promise<{ status: string; exitCode?: number }>((resolve) => {
      let done = false
      const ctx: NativeContext = {
        push: (e) => void events.push(e),
        finish: (status, exitCode) => {
          if (done) return
          done = true
          clearTimeout(timer)
          children.forEach((c) => c.kill())
          resolve({ status, exitCode })
        },
        finished: () => done,
        track: (child) => void children.push({ kill: () => child.kill() }),
        started: (extra = 0) => {
          timer = setTimeout(() => ctx.finish('timeout'), timeoutMs + extra)
        },
        countLine: () => ++lines > 2000
      }
      void runNative(ctx, { runId: 'r', language, code, timeoutMs, stdin }, toolchains, work)
    })
    const output = events.filter((e) => e.kind === 'log').map((e) => (e as { text: string }).text).join('\n')
    const errors = events.filter((e) => e.kind === 'error') as Extract<QuickRunEvent, { kind: 'error' }>[]
    return { ...result, output, errors }
  }

  const available = (language: NativeLanguage) => found.find((t) => t.language === language)?.available ?? false

  const cases: { language: NativeLanguage; ok: string; expected: string; compileError: string; errorLine: number; crash: string; crashLine?: number }[] = [
    {
      language: 'c',
      ok: '#include <stdio.h>\nint main(void) {\n  int n; scanf("%d", &n);\n  printf("doppio %d città\\n", n * 2);\n  return 0;\n}\n',
      expected: 'doppio 42 città',
      compileError: '#include <stdio.h>\nint main(void) {\n  int x = 1\n  return x;\n}\n',
      // gcc segnala il ';' mancante sulla riga dell'istruzione successiva ('before return').
      errorLine: 4,
      crash: 'int main(void) {\n  int *p = 0;\n  return *p;\n}\n'
    },
    {
      language: 'cpp',
      ok: '#include <iostream>\nint main() {\n  int n; std::cin >> n;\n  std::cout << "doppio " << n * 2 << " città\\n";\n}\n',
      expected: 'doppio 42 città',
      compileError: 'int main() {\n  return y;\n}\n',
      errorLine: 2,
      crash: '#include <vector>\nint f(int n) { return f(n + 1) + 1; }\nint main() { return f(0); }\n'
    },
    {
      language: 'rust',
      ok: 'fn main() {\n    let mut s = String::new();\n    std::io::stdin().read_line(&mut s).unwrap();\n    let n: i32 = s.trim().parse().unwrap();\n    println!("doppio {} città", n * 2);\n}\n',
      expected: 'doppio 42 città',
      compileError: 'fn main() {\n    let x: i32 = "a";\n}\n',
      errorLine: 2,
      crash: 'fn main() {\n    let v = vec![1];\n    let i = 3;\n    println!("{}", v[i]);\n}\n',
      crashLine: 4
    },
    {
      language: 'java',
      ok: 'import java.util.Scanner;\npublic class Main {\n  public static void main(String[] a) {\n    int n = new Scanner(System.in).nextInt();\n    System.out.println("doppio " + n * 2 + " città");\n  }\n}\n',
      expected: 'doppio 42 città',
      compileError: 'public class Main {\n  public static void main(String[] a) {\n    int x = 1\n  }\n}\n',
      errorLine: 3,
      crash: 'public class Main {\n  public static void main(String[] a) {\n    int[] v = new int[1];\n    v[2] = 1;\n  }\n}\n',
      crashLine: 4
    },
    {
      language: 'csharp',
      ok: 'int n = int.Parse(Console.ReadLine()!);\nConsole.WriteLine($"doppio {n * 2} città");\n',
      expected: 'doppio 42 città',
      compileError: 'Console.WriteLine("x")\nConsole.WriteLine("y");\n',
      errorLine: 1,
      crash: 'int[] v = new int[1];\nv[2] = 1;\n',
      crashLine: 2
    }
  ]

  for (const c of cases) {
    it(`${c.language}: compila, legge l'input, errori con la riga, crash, ciclo infinito fermato`, async (ctx) => {
      if (!available(c.language)) ctx.skip()
      const ok = await execute(c.language, c.ok, '21\n', 20000)
      expect(ok.errors).toEqual([])
      expect(ok).toMatchObject({ status: 'ok' })
      expect(ok.output).toContain(c.expected)

      const broken = await execute(c.language, c.compileError)
      expect(broken.status).toBe('error')
      expect(broken.errors[0]).toMatchObject({ phase: 'compile', line: c.errorLine })

      const crash = await execute(c.language, c.crash, '', 20000)
      expect(crash.status).toBe('error')
      expect(crash.errors.at(-1)).toMatchObject({ phase: 'runtime' })
      if (c.crashLine) expect(crash.errors.at(-1)?.line).toBe(c.crashLine)

      const loops: Record<NativeLanguage, string> = {
        c: 'int main(void) { for (;;) {} }\n',
        cpp: 'int main() { while (true) {} }\n',
        rust: 'fn main() { loop {} }\n',
        java: 'public class Main { public static void main(String[] a) { while (true) {} } }\n',
        csharp: 'while (true) { }\n'
      }
      const started = Date.now()
      const loop = await execute(c.language, loops[c.language], '', 1500)
      expect(loop.status).toBe('timeout')
      expect(Date.now() - started).toBeLessThan(60000)
    }, 180000)
  }
})
