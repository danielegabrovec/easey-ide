// Collaudo end-to-end dei linguaggi compilati della Scrittura rapida (C, C++, C#, Java, Rust) e
// dell'input da tastiera (anche Python). Usa i compilatori del PC: un linguaggio senza compilatore
// viene saltato. Rust è "spento" apposta (LAB_IDE_NO_TOOLCHAINS) per collaudare la scheda d'installazione.
//  1. C: esempio compilato ed eseguito, versione di gcc, input da tastiera, errore di compilazione sulla
//     riga (anche accanto alla riga), crash spiegato, ciclo infinito fermato, salvataggio .c
//  2. C++, C#, Java: esempi; accenti e simboli in UTF-8; Java 25 compatto
//  3. compilatore mancante (Rust): comando winget, Ricontrolla
//  4. Python: input() dal riquadro Input
//  5. modelli rapidi (snippet) nei suggerimenti
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRun, ensureBuilt, until, wait } from './helpers.mjs'

ensureBuilt()
const run = createRun('quick-native')
const { check } = run
const collection = join(run.work, 'userData', 'Scrittura rapida')
const clean = (text) => text.replace(/ /g, ' ')
let page

const editorText = async () => clean(await page.locator('[data-testid="quick-editor"] .view-lines').innerText())
const outputText = async () => clean(await page.getByTestId('quick-output').innerText())
const status = async () => ((await page.getByTestId('quick-status').count()) ? page.getByTestId('quick-status').getAttribute('data-status') : null)

async function setCode(text) {
  await page.locator('[data-testid="quick-editor"] .view-lines').click()
  await page.evaluate((value) => navigator.clipboard.writeText(value), text)
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Control+V')
  const first = text.split('\n')[0].trim().replace(/\s+/g, ' ')
  await until(async () => (await editorText()).replace(/\s+/g, ' ').includes(first), 5000, 50)
}

async function runAndWait(expected = ['ok', 'error', 'timeout'], timeout = 60000) {
  await wait(50)
  await page.keyboard.press('Control+Enter')
  await wait(200)
  return until(async () => {
    const s = await status()
    return expected.includes(s) ? s : null
  }, timeout, 200)
}

async function language(id) {
  await page.locator(`[data-quick-language="${id}"]`).click()
  await until(async () => (await page.getByTestId('quick-panel').getAttribute('data-language')) === id, 5000)
}

async function toolchain(id) {
  const list = await page.evaluate(() => window.ide.invoke('quick:toolchains'))
  return list.find((t) => t.language === id)
}

try {
  page = await run.launch({ LAB_IDE_NO_TOOLCHAINS: 'rust' })
  await page.waitForSelector('.welcome', { timeout: 20000 })
  await page.getByTestId('welcome-quick').click()
  await page.getByTestId('quick-panel').waitFor({ timeout: 10000 })
  // Aiuto "Intermedio" senza AI: i controlli non dipendono da Ollama.
  await page.locator('[data-testid="quick-levels"] [data-level="medium"]').click()

  // 1. C
  const gcc = await toolchain('c')
  if (!gcc?.available) {
    check('C: gcc non trovato — parte saltata', true, gcc?.problem ?? '')
  } else {
    await language('c')
    const starter = await until(async () => (await outputText()).includes('3 al quadrato fa 9'), 60000, 300)
    check('C: esempio compilato ed eseguito da solo', !!starter, await outputText())
    check('C: versione del compilatore nell intestazione', /gcc \d+/.test(await page.getByTestId('quick-toolchain').innerText()))
    await run.shot('01-c')

    await page.getByTestId('quick-stdin-toggle').click()
    await page.getByTestId('quick-stdin').fill('21\n')
    await setCode('#include <stdio.h>\nint main(void) {\n  int n;\n  scanf("%d", &n);\n  printf("doppio %d, città €\\n", n * 2);\n  return 0;\n}\n')
    check('C: legge l input da tastiera (scanf) e stampa UTF-8', (await runAndWait()) === 'ok' && (await outputText()).includes('doppio 42, città €'), await outputText())

    await setCode('#include <stdio.h>\nint main(void) {\n  printf("ciao\\n")\n  return 0;\n}\n')
    await runAndWait(['error'])
    const compile = await page.getByTestId('quick-error').first().innerText()
    check('C: errore di compilazione con la riga', /Errore di compilazione/.test(compile) && /expected/.test(compile) && /^\s*[34]\b/.test(compile), compile)
    check('C: errore segnato anche accanto alla riga', !!(await until(async () => (await editorText()).includes('✖'), 3000)), await editorText())

    await setCode('int main(void) {\n  int *p = 0;\n  return *p;\n}\n')
    await runAndWait(['error'])
    check('C: crash spiegato (memoria non valida)', /memoria non valida/.test(await outputText()), await outputText())

    await setCode('int main(void) {\n  for (;;) {}\n}\n')
    check('C: ciclo infinito fermato allo scadere del tempo', (await runAndWait(['timeout'], 40000)) === 'timeout')

    await setCode('// Doppio con scanf\n#include <stdio.h>\nint main(void) { return 0; }\n')
    await page.keyboard.press('Control+S')
    await page.locator('.dialog').waitFor({ timeout: 5000 })
    const proposed = await page.locator('.dialog input').inputValue()
    check('C: titolo proposto dal commento (non da #include)', proposed === 'Doppio con scanf', proposed)
    await page.locator('.dialog .btn.primary').click()
    check('C: salvato come file .c nella raccolta', !!(await until(() => existsSync(join(collection, 'Doppio con scanf.c')), 5000)))
  }

  // 2. C++, C#, Java
  const others = [
    { id: 'cpp', expect: 'somma 23', name: 'C++' },
    { id: 'csharp', expect: '9 → 81', name: 'C#' },
    { id: 'java', expect: 'somma 23', name: 'Java' }
  ]
  for (const lang of others) {
    const tc = await toolchain(lang.id)
    if (!tc?.available) {
      check(`${lang.name}: compilatore non trovato — parte saltata`, true, tc?.problem ?? '')
      continue
    }
    await language(lang.id)
    const ok = await until(async () => (await outputText()).includes(lang.expect), 90000, 300)
    check(`${lang.name}: esempio compilato ed eseguito (UTF-8 compreso)`, !!ok, await outputText())
    await run.shot(`02-${lang.id}`)
  }
  if ((await toolchain('java'))?.available && Number(((await toolchain('java')).version ?? '0').split('.')[0]) >= 25) {
    await language('java')
    await page.getByTestId('quick-stdin').fill('Ada\n')
    await setCode('void main() {\n    String nome = IO.readln();\n    IO.println("Ciao " + nome + " da Java");\n}\n')
    check('Java 25: forma compatta e input (IO.readln)', (await runAndWait()) === 'ok' && (await outputText()).includes('Ciao Ada da Java'), await outputText())
    await setCode('public class Main {\n  public static void main(String[] a) {\n    int[] v = new int[1];\n    v[3] = 1;\n  }\n}\n')
    await runAndWait(['error'])
    const javaErr = await page.getByTestId('quick-error').last().innerText()
    check('Java: eccezione con la riga', /ArrayIndexOutOfBounds/.test(javaErr) && /^\s*4/.test(javaErr), javaErr)
  }

  // 3. Compilatore mancante
  await language('rust')
  const missing = page.getByTestId('quick-toolchain-missing')
  check('Rust mancante: scheda con il comando winget', !!(await until(async () => (await missing.count()) > 0 && (await missing.innerText()).includes('Rustlang.Rustup'), 15000)))
  await run.shot('03-rust-mancante')
  await missing.getByRole('button', { name: 'Ricontrolla' }).click()
  await wait(1500)
  check('Rust mancante: Ricontrolla non rompe nulla', (await missing.count()) > 0)

  // 4. Python con input()
  await language('python')
  await page.getByTestId('quick-stdin').fill('Ada\n3\n')
  await setCode('nome = input("Come ti chiami? ")\nn = int(input())\nprint("Ciao", nome, "×", n)\n')
  check('Python: input() legge dal riquadro Input', (await runAndWait(['ok', 'error'], 40000)) === 'ok' && (await outputText()).includes('Ciao Ada × 3'), await outputText())
  await setCode('a = input()\nb = input()\nc = input()\n')
  await runAndWait(['error'], 20000)
  check('Python: input() oltre le righe date → EOFError spiegato', /EOFError/.test(await outputText()), await outputText())

  // 5. Modelli rapidi
  if ((await toolchain('cpp'))?.available) {
    await language('cpp')
    await setCode('int main() {\n  \n}\n')
    await page.keyboard.press('Control+Home')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('End')
    await page.keyboard.type('cou', { delay: 60 })
    await page.keyboard.press('Control+Space')
    check('C++: modello rapido «cout» nei suggerimenti', !!(await until(async () => (await page.locator('[data-testid="quick-editor"] .suggest-widget').innerText()).includes('cout'), 5000)))
    await page.keyboard.press('Escape')
  }
  check('nessun errore nella console dell IDE', run.issues.length === 0, run.issues.slice(0, 3).join(' | '))
} catch (error) {
  run.fail(error)
  await run.shot('errore').catch(() => undefined)
}
await run.finish()
