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

/** Chiave di una regola di primo livello: selettore, oppure @media/@keyframes con i suoi parametri. */
function topLevelKey(node: postcss.ChildNode): string | null {
  if (node.type === 'rule') return `rule:${node.selectors.map((s) => s.trim()).join(',')}`
  if (node.type === 'atrule') {
    // Le @font-face si distinguono per famiglia (e stile): ogni carattere ha la sua.
    if (node.name === 'font-face') {
      const decls = (node.nodes ?? []).filter((n): n is postcss.Declaration => n.type === 'decl')
      const value = (prop: string) => decls.find((d) => d.prop === prop)?.value.replace(/["']/g, '').trim() ?? ''
      return `@font-face:${value('font-family')}:${value('font-style') || 'normal'}`
    }
    // Una @media si confronta anche con i selettori che contiene: blocchi diversi possono avere la stessa @media.
    const inner = (node.nodes ?? []).filter((n) => n.type === 'rule').map((n) => (n as Rule).selector.trim())
    return `@${node.name}:${node.params.replace(/\s+/g, ' ').trim()}:${inner.join('|')}`
  }
  return null
}

/**
 * Aggiunge le regole di un blocco una per una, saltando quelle che il foglio di stile ha già
 * (stesso selettore): due blocchi che condividono una regola (es. `.lab-sezione`) non la duplicano,
 * e le regole nuove arrivano anche se la prima c'era già.
 */
export function appendRulesOnce(css: string, rules: string): string {
  const incoming = safeParse(rules)
  if (!incoming) return css
  const existing = new Set<string>()
  safeParse(css)?.each((node) => {
    const key = topLevelKey(node)
    if (key) existing.add(key)
  })
  const missing: string[] = []
  incoming.each((node) => {
    const key = topLevelKey(node)
    if (key && existing.has(key)) return
    if (key) existing.add(key)
    node.raws.before = ''
    missing.push(node.toString().trim())
  })
  if (!missing.length) return css
  return `${css.replace(/\s*$/, '')}${css.trim() ? '\n\n' : ''}${missing.join('\n\n')}\n`
}

/** I quattro lati di margin/padding (alto, destra, basso, sinistra) da una scorciatoia CSS. */
export function boxSides(value: string): [string, string, string, string] {
  const parts = postcss.list.space(value.trim())
  const [top = '', right = top, bottom = top, left = right] = parts
  return [top, right, bottom, left]
}

/** La scorciatoia più corta per quattro lati; '' se sono tutti vuoti (un lato vuoto vale 0). */
export function joinBoxSides(sides: [string, string, string, string]): string {
  if (sides.every((s) => !s.trim())) return ''
  const [top, right, bottom, left] = sides.map((s) => s.trim() || '0') as [string, string, string, string]
  if (top === right && right === bottom && bottom === left) return top
  if (top === bottom && right === left) return `${top} ${right}`
  if (right === left) return `${top} ${right} ${bottom}`
  return `${top} ${right} ${bottom} ${left}`
}

export function isColorValue(value: string): boolean {
  return /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|var\(--)/i.test(value.trim())
}
