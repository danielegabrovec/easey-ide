// Parole chiave e modelli rapidi per i linguaggi della Scrittura rapida che in Monaco non hanno un
// servizio di completamento (Python, C, C++, C#, Java, Rust). Sintassi degli snippet di Monaco:
// ${1:segnaposto}, $0 = posizione finale del cursore.
import type { QuickLanguage } from '../contracts/quick'

export interface QuickSnippet {
  label: string
  detail: string
  body: string
}

const C_KEYWORDS = ['int', 'long', 'char', 'double', 'float', 'void', 'unsigned', 'const', 'static', 'struct', 'typedef', 'enum', 'sizeof', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'default', 'NULL', 'bool', 'true', 'false']

export const QUICK_KEYWORDS: Partial<Record<QuickLanguage, string[]>> = {
  python: ['def', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and', 'or', 'class', 'import', 'from', 'with', 'as', 'try', 'except', 'finally', 'raise', 'lambda', 'yield', 'None', 'True', 'False', 'print', 'range', 'len', 'input', 'int', 'str', 'float', 'list', 'dict', 'set', 'tuple', 'sorted', 'enumerate', 'zip', 'sum', 'min', 'max'],
  c: [...C_KEYWORDS, 'printf', 'scanf', 'malloc', 'free', 'strlen', 'strcpy', 'strcmp'],
  cpp: [...C_KEYWORDS, 'class', 'public', 'private', 'protected', 'namespace', 'using', 'template', 'typename', 'auto', 'nullptr', 'new', 'delete', 'std::cout', 'std::cin', 'std::endl', 'std::string', 'std::vector', 'std::map', 'std::sort'],
  csharp: ['var', 'int', 'string', 'double', 'bool', 'void', 'class', 'record', 'struct', 'interface', 'public', 'private', 'static', 'new', 'return', 'if', 'else', 'for', 'foreach', 'in', 'while', 'switch', 'case', 'break', 'null', 'true', 'false', 'Console.WriteLine', 'Console.ReadLine', 'List', 'Dictionary', 'string.Join'],
  java: ['int', 'long', 'double', 'boolean', 'char', 'String', 'var', 'void', 'class', 'record', 'interface', 'public', 'private', 'static', 'final', 'new', 'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'null', 'true', 'false', 'System.out.println', 'List', 'ArrayList', 'Map', 'HashMap', 'Scanner'],
  rust: ['fn', 'let', 'mut', 'const', 'struct', 'enum', 'impl', 'trait', 'pub', 'use', 'mod', 'match', 'if', 'else', 'for', 'in', 'while', 'loop', 'break', 'continue', 'return', 'Some', 'None', 'Ok', 'Err', 'Vec', 'String', 'Option', 'Result', 'println!', 'vec!', 'format!']
}

export const QUICK_SNIPPETS: Partial<Record<QuickLanguage, QuickSnippet[]>> = {
  python: [
    { label: 'def', detail: 'funzione', body: 'def ${1:nome}(${2:parametri}):\n    ${0:pass}' },
    { label: 'for', detail: 'ciclo for su un intervallo', body: 'for ${1:i} in range(${2:10}):\n    ${0:print(i)}' },
    { label: 'if', detail: 'if / else', body: 'if ${1:condizione}:\n    ${2:pass}\nelse:\n    ${0:pass}' },
    { label: 'input', detail: 'leggi un numero intero', body: '${1:n} = int(input(${2:"Numero: "}))' },
    { label: 'class', detail: 'classe', body: 'class ${1:Nome}:\n    def __init__(self, ${2:valore}):\n        self.${2:valore} = ${2:valore}\n$0' }
  ],
  c: [
    { label: 'main', detail: 'programma completo', body: '#include <stdio.h>\n\nint main(void) {\n  ${0}\n  return 0;\n}' },
    { label: 'for', detail: 'ciclo for', body: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n  ${0}\n}' },
    { label: 'printf', detail: 'stampa', body: 'printf("${1:%d}\\n", ${2:valore});' },
    { label: 'scanf', detail: 'leggi un intero', body: 'int ${1:n};\nscanf("%d", &${1:n});' },
    { label: 'func', detail: 'funzione', body: '${1:int} ${2:nome}(${3:int x}) {\n  ${0:return x;}\n}' }
  ],
  cpp: [
    { label: 'main', detail: 'programma completo', body: '#include <iostream>\n\nint main() {\n  ${0}\n}' },
    { label: 'for', detail: 'ciclo for', body: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ++${1:i}) {\n  ${0}\n}' },
    { label: 'forr', detail: 'ciclo su un contenitore', body: 'for (const auto& ${1:x} : ${2:valori}) {\n  ${0}\n}' },
    { label: 'cout', detail: 'stampa', body: 'std::cout << ${1:valore} << "\\n";' },
    { label: 'cin', detail: 'leggi un intero', body: 'int ${1:n};\nstd::cin >> ${1:n};' },
    { label: 'vector', detail: 'vettore', body: 'std::vector<${1:int}> ${2:v}{${0}};' }
  ],
  csharp: [
    { label: 'cw', detail: 'Console.WriteLine', body: 'Console.WriteLine(${1:\\$"{valore}"});' },
    { label: 'for', detail: 'ciclo for', body: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++)\n{\n    ${0}\n}' },
    { label: 'foreach', detail: 'ciclo su una collezione', body: 'foreach (var ${1:x} in ${2:valori})\n{\n    ${0}\n}' },
    { label: 'readint', detail: 'leggi un intero', body: 'int ${1:n} = int.Parse(Console.ReadLine()!);' },
    { label: 'func', detail: 'funzione locale', body: 'static ${1:int} ${2:Nome}(${3:int x}) => ${0:x};' },
    { label: 'record', detail: 'record', body: 'record ${1:Persona}(${2:string Nome, int Anni});' }
  ],
  java: [
    { label: 'main', detail: 'classe con main', body: 'public class Main {\n    public static void main(String[] args) {\n        ${0}\n    }\n}' },
    { label: 'sout', detail: 'System.out.println', body: 'System.out.println(${1:valore});' },
    { label: 'for', detail: 'ciclo for', body: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n    ${0}\n}' },
    { label: 'foreach', detail: 'ciclo su una collezione', body: 'for (var ${1:x} : ${2:valori}) {\n    ${0}\n}' },
    { label: 'scanner', detail: 'leggi un intero', body: 'var ${1:in} = new java.util.Scanner(System.in);\nint ${2:n} = ${1:in}.nextInt();' },
    { label: 'record', detail: 'record', body: 'record ${1:Persona}(${2:String nome, int anni}) {}' }
  ],
  rust: [
    { label: 'main', detail: 'funzione main', body: 'fn main() {\n    ${0}\n}' },
    { label: 'fn', detail: 'funzione', body: 'fn ${1:nome}(${2:x: i32}) -> ${3:i32} {\n    ${0:x}\n}' },
    { label: 'for', detail: 'ciclo su un intervallo', body: 'for ${1:i} in ${2:0..10} {\n    ${0}\n}' },
    { label: 'println', detail: 'stampa', body: 'println!("${1:{}}", ${2:valore});' },
    { label: 'readline', detail: 'leggi un intero', body: 'let mut ${1:riga} = String::new();\nstd::io::stdin().read_line(&mut ${1:riga}).unwrap();\nlet ${2:n}: i32 = ${1:riga}.trim().parse().unwrap();' },
    { label: 'match', detail: 'match', body: 'match ${1:valore} {\n    ${2:0} => ${3:()},\n    _ => ${0:()},\n}' }
  ]
}
