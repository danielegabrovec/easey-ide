import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { QUICK_LANGUAGES } from '../../src/shared/contracts/quick'
import { findTypos, oneEdit } from '../../src/shared/editor/typos'
import { labExamples } from '../../src/shared/quick/lab-examples'
import { languageOf } from '../../src/shared/paths'
import { createFromTemplate, listTemplates } from '../../src/main/services/workspace/templates'

const fixes = (text: string, language: string) => findTypos(text, language).map((t) => `${t.word}→${t.suggestion}`)

describe('parole sbagliate', () => {
  it('una sola modifica: lettera in più, in meno, cambiata o scambiata', () => {
    expect(oneEdit('pritn', 'print')).toBe('swap')
    expect(oneEdit('Sytem', 'System')).toBe('delete')
    expect(oneEdit('printt', 'print')).toBe('insert')
    expect(oneEdit('Print', 'print')).toBe('replace')
    expect(oneEdit('prnt', 'paint')).toBeNull()
    expect(oneEdit('abc', 'abcde')).toBeNull()
  })

  it('Python', () => {
    expect(fixes('pritn("Ciao")\nfor i in rnage(3):\n    print(i)\nif x:\n    pass\nesle:\n    pass\n', 'python')).toEqual(['pritn→print', 'rnage→range', 'esle→else'])
    expect(fixes('numeri = [1, 2]\nnumeri.apend(3)\n', 'python')).toEqual(['apend→append'])
  })

  it('JavaScript (il controllo di TypeScript è spento per i .js)', () => {
    expect(fixes("consle.log('a')\nconsole.lgo('b')\nfucntion f() { retrun 1 }\n", 'javascript')).toEqual(['consle→console', 'lgo→log', 'fucntion→function', 'retrun→return'])
    expect(fixes("document.querySelectr('#x')\n", 'javascript')).toEqual(['querySelectr→querySelector'])
  })

  it('C, C++, C#, Java, Rust', () => {
    expect(fixes('#include <stdio.h>\nint main(void) {\n  prinft("ciao");\n  retrun 0;\n}\n', 'c')).toEqual(['prinft→printf', 'retrun→return'])
    expect(fixes('#include <iostream>\nint main() { std::cuot << 1; }\n', 'cpp')).toEqual(['cuot→cout'])
    expect(fixes('Console.WritLine("x");\n', 'csharp')).toEqual(['WritLine→WriteLine'])
    expect(fixes('public class Main { public static void main(String[] args) { Sytem.out.prinltn("x"); } }\n', 'java')).toEqual(['Sytem→System', 'prinltn→println'])
    expect(fixes('fn main() {\n    printn!("ciao");\n}\n', 'rust')).toEqual(['printn→println'])
  })

  it('SQL: parole chiave, nelle stesse maiuscole; mai nomi di tabelle, colonne e alias', () => {
    expect(fixes('SELCT nome FORM clienti WHRE id = 1;', 'sql')).toEqual(['SELCT→SELECT', 'FORM→FROM', 'WHRE→WHERE'])
    expect(fixes('select nome form clienti;', 'sql')).toEqual(['form→from'])
    expect(fixes('CREATE TABLE ordini (id INTEGER, form TEXT, valeus TEXT);\nSELECT o.form, valeus FROM ordini o;', 'sql')).toEqual([])
  })

  it('mai dentro stringhe e commenti; mai sui nomi dichiarati, sulle costanti e sui membri sconosciuti', () => {
    expect(fixes('# pritn non è un errore qui\nprint("pritn")\n', 'python')).toEqual([])
    expect(fixes('// consle\nconst s = `consle ${1}`\n/* retrun */\n', 'javascript')).toEqual([])
    expect(fixes('def pritn(x):\n    return x\npritn(1)\n', 'python')).toEqual([])
    expect(fixes('prints = []\nprints.append(1)\nwidth = 3\nt.width(width)\nobj.value = 1\n', 'python')).toEqual([])
    expect(fixes('const MAXS = 3\nconst form = 1\nconsole.log(form, MAXS, Object.values({}))\n', 'javascript')).toEqual([])
    expect(fixes('int conta(int nmae) { return nmae; }\n', 'c')).toEqual([])
    expect(fixes('for chiave, valore in d.items():\n    print(chiave, valore)\n', 'python')).toEqual([])
  })

  it('TypeScript, HTML e CSS non si controllano qui', () => {
    expect(findTypos('consle.log(1)', 'typescript')).toEqual([])
    expect(findTypos('<pritn>', 'html')).toEqual([])
  })

  it('nessun falso allarme sugli esempi del Laboratorio', () => {
    for (const language of QUICK_LANGUAGES) for (const example of labExamples(language)) expect(findTypos(example.code, language), `${language}/${example.kind}`).toEqual([])
  })

  const dirs: string[] = []
  afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

  it('nessun falso allarme sui file dei modelli di progetto', async () => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]))
    for (const template of listTemplates()) {
      const dir = mkdtempSync(join(tmpdir(), 'typos-'))
      dirs.push(dir)
      const root = await createFromTemplate(template.id, 'prova', dir)
      for (const file of walk(root)) {
        const language = languageOf(file)
        expect(findTypos(readFileSync(file, 'utf8'), language), `${template.id}: ${file}`).toEqual([])
      }
    }
  })
})
