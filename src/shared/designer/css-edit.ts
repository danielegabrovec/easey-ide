// Modifiche al foglio di stile con postcss: si toccano solo le dichiarazioni interessate,
// commenti e formattazione del resto del file restano come li ha scritti l'utente.
import postcss, { type AtRule, type Container, type Root, type Rule } from 'postcss'

export type Declarations = Record<string, string>

/** Punti di interruzione del designer: desktop = regola base. */
export const BREAKPOINTS = {
  desktop: null,
  tablet: '(max-width: 900px)',
  phone: '(max-width: 600px)'
} as const

export type Breakpoint = keyof typeof BREAKPOINTS

function container(root: Root, media: string | null, create: boolean): Container | null {
  if (!media) return root
  let found: AtRule | null = null
  root.walkAtRules('media', (rule) => {
    if (!found && rule.params.replace(/\s+/g, ' ').trim() === media) found = rule
  })
  if (found || !create) return found
  const rule = postcss.atRule({ name: 'media', params: media })
  rule.raws.before = '\n\n'
  rule.raws.between = ' '
  rule.raws.after = '\n'
  root.append(rule)
  return rule
}

function findRule(parent: Container, selector: string): Rule | null {
  let found: Rule | null = null
  parent.each((node) => {
    if (!found && node.type === 'rule' && node.selectors.map((s) => s.trim()).includes(selector) && node.selectors.length === 1) found = node
  })
  return found
}

export function getDeclarations(css: string, selector: string, media: string | null = null): Declarations {
  const root = safeParse(css)
  const parent = root ? container(root, media, false) : null
  const rule = parent ? findRule(parent, selector) : null
  const out: Declarations = {}
  rule?.each((node) => {
    if (node.type === 'decl') out[node.prop] = node.value + (node.important ? ' !important' : '')
  })
  return out
}

function safeParse(css: string): Root | null {
  try {
    return postcss.parse(css)
  } catch {
    return null
  }
}

/** Imposta (o toglie, con null/'') proprietà di una regola; crea regola e @media se servono. */
export function setDeclarations(css: string, selector: string, declarations: Record<string, string | null>, media: string | null = null): string {
  const root = safeParse(css)
  if (!root) throw new Error('Il foglio di stile contiene un errore di sintassi: correggilo prima di usare il designer.')
  const parent = container(root, media, true)!
  let rule = findRule(parent, selector)
  if (!rule) {
    if (Object.values(declarations).every((v) => v === null || v === '')) return css
    rule = postcss.rule({ selector })
    rule.raws.before = parent === root ? (root.nodes.length ? '\n\n' : '') : '\n  '
    rule.raws.between = ' '
    rule.raws.after = parent === root ? '\n' : '\n  '
    rule.raws.semicolon = true
    parent.append(rule)
  }
  const indent = parent === root ? '\n  ' : '\n    '
  for (const [prop, value] of Object.entries(declarations)) {
    const existing: postcss.Declaration[] = []
    rule.walkDecls(prop, (decl) => {
      if (decl.parent === rule) existing.push(decl)
    })
    if (value === null || value === '') {
      existing.forEach((d) => d.remove())
      continue
    }
    const important = /\s*!important\s*$/i.test(value)
    const clean = value.replace(/\s*!important\s*$/i, '')
    if (existing.length) {
      existing.slice(1).forEach((d) => d.remove())
      existing[0]!.value = clean
      existing[0]!.important = important
    } else {
      const decl = postcss.decl({ prop, value: clean, important })
      decl.raws.before = rule.nodes.length ? (rule.nodes[0]!.raws.before ?? indent) : indent
      decl.raws.between = ': '
      rule.append(decl)
    }
  }
  if (rule.nodes.length === 0) {
    rule.remove()
    if (parent !== root && (parent as AtRule).nodes?.length === 0) (parent as AtRule).remove()
  } else {
    rule.raws.semicolon = true
    if (!/\n/.test(rule.raws.after ?? '') && rule.nodes.some((n) => /\n/.test(n.raws.before ?? ''))) rule.raws.after = parent === root ? '\n' : '\n  '
  }
  return root.toString()
}

/** Variabili CSS del sito (:root { --nome: valore }). */
export function getVariables(css: string): Declarations {
  const out: Declarations = {}
  for (const [prop, value] of Object.entries(getDeclarations(css, ':root'))) if (prop.startsWith('--')) out[prop] = value
  return out
}

export function setVariable(css: string, name: string, value: string | null): string {
  const prop = name.startsWith('--') ? name : `--${name}`
  return setDeclarations(css, ':root', { [prop]: value })
}

/** Aggiunge un blocco di regole solo se il suo primo selettore non esiste già. */
export function appendRulesOnce(css: string, rules: string): string {
  const first = /^\s*([^{]+)\{/.exec(rules)?.[1]?.trim()
  if (first && css.includes(`${first} {`)) return css
  return `${css.replace(/\s*$/, '')}${css.trim() ? '\n\n' : ''}${rules.trim()}\n`
}

export function isColorValue(value: string): boolean {
  return /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|var\(--)/i.test(value.trim())
}
