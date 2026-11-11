// Classi UML nei diagrammi:   Persona
//                             ---
//                             + nome: string
//                             - eta: number
//                             ---
//                             + saluta(altro: string): void
// e generazione dello scheletro di una classe TypeScript.

export interface ClassText {
  name: string
  attributes: string[]
  methods: string[]
}

export function parseClassText(text: string): ClassText {
  const sections = text.split(/\n\s*-{3,}\s*\n?/)
  const name = (sections[0] ?? '').trim().split('\n')[0]?.trim().replace(/\s+/g, '') || 'Classe'
  const lines = (section: string | undefined) =>
    (section ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  return { name, attributes: lines(sections[1]), methods: lines(sections[2]) }
}

const VISIBILITY: Record<string, string> = { '+': 'public ', '-': 'private ', '#': 'protected ', '~': '' }

export function classToTypeScript(text: string): string {
  const cls = parseClassText(text)
  const out = [`export class ${cls.name} {`]
  for (const attribute of cls.attributes) {
    const match = /^([+\-#~])?\s*([\w$]+)\s*(?::\s*(.+))?$/.exec(attribute)
    if (!match) {
      out.push(`  // ${attribute}`)
      continue
    }
    const type = match[3]?.trim() || 'unknown'
    out.push(`  ${VISIBILITY[match[1] ?? '+'] ?? ''}${match[2]}: ${type}`)
  }
  if (cls.attributes.length) out.push('')
  const attrs = cls.attributes.map((a) => /^([+\-#~])?\s*([\w$]+)\s*(?::\s*(.+))?$/.exec(a)).filter((m): m is RegExpExecArray => !!m)
  if (attrs.length) {
    out.push(`  constructor(${attrs.map((m) => `${m[2]}: ${m[3]?.trim() || 'unknown'}`).join(', ')}) {`)
    for (const m of attrs) out.push(`    this.${m[2]} = ${m[2]}`)
    out.push('  }', '')
  }
  for (const method of cls.methods) {
    const match = /^([+\-#~])?\s*([\w$]+)\s*\(([^)]*)\)\s*(?::\s*(.+))?$/.exec(method)
    if (!match) {
      out.push(`  // ${method}`)
      continue
    }
    const returns = match[4]?.trim() || 'void'
    out.push(`  ${VISIBILITY[match[1] ?? '+'] ?? ''}${match[2]}(${match[3]!.trim()}): ${returns} {`)
    out.push(returns === 'void' ? '    // TODO' : `    throw new Error('Da implementare: ${match[2]}')`)
    out.push('  }', '')
  }
  if (out[out.length - 1] === '') out.pop()
  out.push('}')
  return `${out.join('\n')}\n`
}
