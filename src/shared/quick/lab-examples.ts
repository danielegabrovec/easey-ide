// Esempi da provare del Laboratorio (1.6, come la striscia del Laboratorio SQL di Easey DB): per ogni linguaggio
// della Scrittura rapida tre o quattro programmi brevi e completi, che girano così come sono (niente input da
// tastiera). Il testo del pulsante è `lab.ex.<tipo>`. Puro: niente DOM.
import type { QuickLanguage } from '../contracts/quick'

export type LabExampleKind = 'hello' | 'condition' | 'loop' | 'function' | 'list' | 'object' | 'table' | 'filter' | 'group' | 'join' | 'page' | 'button' | 'style'

export interface LabExample {
  kind: LabExampleKind
  code: string
}

const EXAMPLES: Record<QuickLanguage, LabExample[]> = {
  javascript: [
    { kind: 'hello', code: "// Il primo programma: scrive una riga nell'output.\nconsole.log('Ciao, mondo!')\n" },
    { kind: 'condition', code: "const voto = 7\nif (voto >= 6) {\n  console.log('Promosso con', voto)\n} else {\n  console.log('Da recuperare:', voto)\n}\n" },
    { kind: 'loop', code: "// Un ciclo: ripete le istruzioni per i da 1 a 5.\nfor (let i = 1; i <= 5; i++) {\n  console.log(i, 'al quadrato fa', i * i)\n}\n" },
    { kind: 'function', code: "function saluta(nome) {\n  return 'Ciao ' + nome + '!'\n}\nconsole.log(saluta('Ada'))\nconsole.log(saluta('Alan'))\n" },
    { kind: 'list', code: "const frutti = ['mela', 'pera', 'kiwi']\nfrutti.push('banana')\nconsole.log('Quanti:', frutti.length)\nfor (const frutto of frutti) console.log('-', frutto)\n" }
  ],
  typescript: [
    { kind: 'hello', code: "const messaggio: string = 'Ciao, mondo!'\nconsole.log(messaggio)\n" },
    { kind: 'function', code: "function area(base: number, altezza: number): number {\n  return base * altezza\n}\nconsole.log('Area:', area(4, 3))\n" },
    { kind: 'object', code: "interface Studente {\n  nome: string\n  voto: number\n}\nconst classe: Studente[] = [\n  { nome: 'Ada', voto: 9 },\n  { nome: 'Alan', voto: 7 }\n]\nfor (const s of classe) console.log(s.nome, s.voto >= 8 ? 'ottimo' : 'bene')\n" },
    { kind: 'loop', code: "let totale = 0\nfor (let i = 1; i <= 10; i++) {\n  totale += i\n}\nconsole.log('Somma da 1 a 10:', totale)\n" }
  ],
  python: [
    { kind: 'hello', code: "# Il primo programma: scrive una riga nell'output.\nprint(\"Ciao, mondo!\")\n" },
    { kind: 'condition', code: "voto = 7\nif voto >= 6:\n    print(\"Promosso con\", voto)\nelse:\n    print(\"Da recuperare:\", voto)\n" },
    { kind: 'loop', code: "# Un ciclo: ripete le istruzioni per i da 1 a 5.\nfor i in range(1, 6):\n    print(i, \"al quadrato fa\", i * i)\n" },
    { kind: 'function', code: "def saluta(nome):\n    return \"Ciao \" + nome + \"!\"\n\nprint(saluta(\"Ada\"))\nprint(saluta(\"Alan\"))\n" },
    { kind: 'list', code: "frutti = [\"mela\", \"pera\", \"kiwi\"]\nfrutti.append(\"banana\")\nprint(\"Quanti:\", len(frutti))\nfor frutto in frutti:\n    print(\"-\", frutto)\n" }
  ],
  sql: [
    { kind: 'table', code: "-- Crea una tabella, inserisce tre righe e le legge.\nCREATE TABLE IF NOT EXISTS studenti (id INTEGER PRIMARY KEY, nome TEXT, voto INTEGER);\nINSERT INTO studenti (nome, voto) VALUES ('Ada', 9), ('Alan', 7), ('Grace', 10);\nSELECT * FROM studenti;\n" },
    { kind: 'filter', code: "CREATE TABLE IF NOT EXISTS studenti (id INTEGER PRIMARY KEY, nome TEXT, voto INTEGER);\nINSERT INTO studenti (nome, voto) VALUES ('Ada', 9), ('Alan', 7), ('Grace', 10);\n-- Solo chi ha almeno 8, dal voto più alto.\nSELECT nome, voto FROM studenti WHERE voto >= 8 ORDER BY voto DESC;\n" },
    { kind: 'group', code: "CREATE TABLE IF NOT EXISTS vendite (id INTEGER PRIMARY KEY, citta TEXT, importo INTEGER);\nINSERT INTO vendite (citta, importo) VALUES ('Roma', 10), ('Milano', 25), ('Roma', 5), ('Torino', 8);\n-- Quante vendite e quanto in totale per città.\nSELECT citta, COUNT(*) AS quante, SUM(importo) AS totale FROM vendite GROUP BY citta ORDER BY totale DESC;\n" },
    { kind: 'join', code: "CREATE TABLE IF NOT EXISTS clienti (id INTEGER PRIMARY KEY, nome TEXT);\nCREATE TABLE IF NOT EXISTS ordini (id INTEGER PRIMARY KEY, cliente_id INTEGER, prodotto TEXT);\nINSERT INTO clienti (id, nome) VALUES (1, 'Ada'), (2, 'Alan');\nINSERT INTO ordini (cliente_id, prodotto) VALUES (1, 'Libro'), (1, 'Penna'), (2, 'Quaderno');\n-- Ogni ordine con il nome del cliente.\nSELECT clienti.nome, ordini.prodotto FROM ordini JOIN clienti ON clienti.id = ordini.cliente_id;\n" }
  ],
  html: [
    { kind: 'page', code: "<h1>La mia pagina</h1>\n<p>Un paragrafo con una parola in <strong>grassetto</strong>.</p>\n<ul>\n  <li>Primo punto</li>\n  <li>Secondo punto</li>\n</ul>\n" },
    { kind: 'button', code: "<button id=\"saluta\">Salutami</button>\n<p id=\"messaggio\"></p>\n<script>\n  document.querySelector('#saluta').addEventListener('click', () => {\n    document.querySelector('#messaggio').textContent = 'Ciao!'\n    console.log('pulsante premuto')\n  })\n</script>\n" },
    { kind: 'style', code: "<style>\n  body { font-family: system-ui, sans-serif; background: #f4f6ff; padding: 24px; }\n  .scheda { background: white; border-radius: 12px; padding: 16px; box-shadow: 0 2px 8px #0002; }\n  h2 { color: #4f46e5; }\n</style>\n<div class=\"scheda\">\n  <h2>Una scheda</h2>\n  <p>Colori, bordi arrotondati e ombra con il CSS.</p>\n</div>\n" }
  ],
  c: [
    { kind: 'hello', code: "#include <stdio.h>\n\nint main(void) {\n  printf(\"Ciao, mondo!\\n\");\n  return 0;\n}\n" },
    { kind: 'loop', code: "#include <stdio.h>\n\nint main(void) {\n  for (int i = 1; i <= 5; i++) {\n    printf(\"%d al quadrato fa %d\\n\", i, i * i);\n  }\n  return 0;\n}\n" },
    { kind: 'function', code: "#include <stdio.h>\n\nint massimo(int a, int b) {\n  return a > b ? a : b;\n}\n\nint main(void) {\n  printf(\"Il massimo fra 4 e 9 è %d\\n\", massimo(4, 9));\n  return 0;\n}\n" },
    { kind: 'list', code: "#include <stdio.h>\n\nint main(void) {\n  int voti[] = {7, 9, 6, 10};\n  int n = sizeof voti / sizeof voti[0];\n  int somma = 0;\n  for (int i = 0; i < n; i++) somma += voti[i];\n  printf(\"Media: %.2f\\n\", (double)somma / n);\n  return 0;\n}\n" }
  ],
  cpp: [
    { kind: 'hello', code: "#include <iostream>\n\nint main() {\n  std::cout << \"Ciao, mondo!\" << std::endl;\n}\n" },
    { kind: 'loop', code: "#include <iostream>\n\nint main() {\n  for (int i = 1; i <= 5; i++) {\n    std::cout << i << \" al quadrato fa \" << i * i << \"\\n\";\n  }\n}\n" },
    { kind: 'function', code: "#include <iostream>\n#include <string>\n\nstd::string saluta(const std::string& nome) {\n  return \"Ciao \" + nome + \"!\";\n}\n\nint main() {\n  std::cout << saluta(\"Ada\") << \"\\n\";\n}\n" },
    { kind: 'list', code: "#include <iostream>\n#include <string>\n#include <vector>\n\nint main() {\n  std::vector<std::string> frutti{\"mela\", \"pera\", \"kiwi\"};\n  frutti.push_back(\"banana\");\n  std::cout << \"Quanti: \" << frutti.size() << \"\\n\";\n  for (const auto& frutto : frutti) std::cout << \"- \" << frutto << \"\\n\";\n}\n" }
  ],
  csharp: [
    { kind: 'hello', code: "Console.WriteLine(\"Ciao, mondo!\");\n" },
    { kind: 'loop', code: "for (int i = 1; i <= 5; i++)\n{\n    Console.WriteLine($\"{i} al quadrato fa {i * i}\");\n}\n" },
    { kind: 'function', code: "Console.WriteLine(Saluta(\"Ada\"));\nConsole.WriteLine(Saluta(\"Alan\"));\n\nstatic string Saluta(string nome) => $\"Ciao {nome}!\";\n" },
    { kind: 'list', code: "var frutti = new List<string> { \"mela\", \"pera\", \"kiwi\" };\nfrutti.Add(\"banana\");\nConsole.WriteLine($\"Quanti: {frutti.Count}\");\nforeach (var frutto in frutti) Console.WriteLine($\"- {frutto}\");\n" }
  ],
  java: [
    { kind: 'hello', code: "public class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Ciao, mondo!\");\n    }\n}\n" },
    { kind: 'loop', code: "public class Main {\n    public static void main(String[] args) {\n        for (int i = 1; i <= 5; i++) {\n            System.out.println(i + \" al quadrato fa \" + i * i);\n        }\n    }\n}\n" },
    { kind: 'function', code: "public class Main {\n    static String saluta(String nome) {\n        return \"Ciao \" + nome + \"!\";\n    }\n\n    public static void main(String[] args) {\n        System.out.println(saluta(\"Ada\"));\n    }\n}\n" },
    { kind: 'list', code: "import java.util.ArrayList;\nimport java.util.List;\n\npublic class Main {\n    public static void main(String[] args) {\n        List<String> frutti = new ArrayList<>(List.of(\"mela\", \"pera\", \"kiwi\"));\n        frutti.add(\"banana\");\n        System.out.println(\"Quanti: \" + frutti.size());\n        for (String frutto : frutti) System.out.println(\"- \" + frutto);\n    }\n}\n" }
  ],
  rust: [
    { kind: 'hello', code: "fn main() {\n    println!(\"Ciao, mondo!\");\n}\n" },
    { kind: 'loop', code: "fn main() {\n    for i in 1..=5 {\n        println!(\"{} al quadrato fa {}\", i, i * i);\n    }\n}\n" },
    { kind: 'function', code: "fn saluta(nome: &str) -> String {\n    format!(\"Ciao {}!\", nome)\n}\n\nfn main() {\n    println!(\"{}\", saluta(\"Ada\"));\n}\n" },
    { kind: 'list', code: "fn main() {\n    let mut frutti = vec![\"mela\", \"pera\", \"kiwi\"];\n    frutti.push(\"banana\");\n    println!(\"Quanti: {}\", frutti.len());\n    for frutto in &frutti {\n        println!(\"- {}\", frutto);\n    }\n}\n" }
  ]
}

export function labExamples(language: QuickLanguage): LabExample[] {
  return EXAMPLES[language] ?? []
}
