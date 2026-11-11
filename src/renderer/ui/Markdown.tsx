// Markdown essenziale (risposte dell'AI, lezioni dei corsi), costruito come elementi React (mai HTML grezzo).
// Supporta: titoli, paragrafi, elenchi, codice, citazioni/riquadri dei manuali (> 💡 …), tabelle, link.
import { Fragment, type ReactNode } from 'react'

export interface CodeBlockProps {
  language: string
  code: string
}

type Block = { kind: 'code'; language: string; code: string } | { kind: 'text'; lines: string[] }

export function splitBlocks(source: string): Block[] {
  const blocks: Block[] = []
  const lines = source.split('\n')
  let text: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const fence = /^\s*```\s*([\w+#.-]*)\s*$/.exec(lines[i]!)
    if (!fence) {
      text.push(lines[i]!)
      continue
    }
    if (text.length) blocks.push({ kind: 'text', lines: text })
    text = []
    const code: string[] = []
    i++
    while (i < lines.length && !/^\s*```\s*$/.test(lines[i]!)) code.push(lines[i++]!)
    blocks.push({ kind: 'code', language: fence[1] || 'text', code: code.join('\n') })
  }
  if (text.length) blocks.push({ kind: 'text', lines: text })
  return blocks
}

/** Riquadri dei manuali della Collana: il primo carattere della citazione ne decide il tipo. */
const CALLOUTS: [string, string][] = [
  ['💡', 'info'],
  ['⚠', 'warn'],
  ['🧪', 'esercizio'],
  ['🔍', 'check'],
  ['✅', 'ok'],
  ['🚀', 'tappa']
]

export function calloutKind(firstLine: string): string | null {
  const text = firstLine.trimStart()
  return CALLOUTS.find(([emoji]) => text.startsWith(emoji))?.[1] ?? null
}

function inline(text: string, keyBase: string): ReactNode[] {
  const parts: ReactNode[] = []
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|!?\[[^\]]*\]\([^)\s]+\))/g
  let last = 0
  let match: RegExpExecArray | null
  let index = 0
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    const token = match[0]
    const key = `${keyBase}-${index++}`
    if (token.startsWith('`')) parts.push(<code key={key}>{token.slice(1, -1)}</code>)
    else if (token.startsWith('**')) parts.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith('*')) parts.push(<em key={key}>{token.slice(1, -1)}</em>)
    else {
      const link = /^(!?)\[([^\]]*)\]\(([^)\s]+)\)$/.exec(token)!
      const [, image, label, url] = link
      if (image) parts.push(<em key={key}>{label || url}</em>)
      else if (/^https?:\/\//i.test(url!))
        parts.push(
          <a key={key} href={url} target="_blank" rel="noreferrer">
            {label}
          </a>
        )
      else parts.push(<span key={key}>{label}</span>)
    }
    last = match.index + token.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())

function TextBlock({ lines, keyBase }: { lines: string[]; keyBase: string }) {
  const out: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let paragraph: string[] = []
  const key = (kind: string) => `${keyBase}-${kind}${out.length}`
  const flushParagraph = () => {
    if (paragraph.length) out.push(<p key={key('p')}>{inline(paragraph.join(' '), key('p'))}</p>)
    paragraph = []
  }
  const flushList = () => {
    if (!list) return
    const items = list.items.map((item, i) => <li key={i}>{inline(item, `${key('l')}-${i}`)}</li>)
    out.push(list.ordered ? <ol key={key('o')}>{items}</ol> : <ul key={key('u')}>{items}</ul>)
    list = null
  }
  const flush = () => {
    flushParagraph()
    flushList()
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trimEnd()
    // Citazione / riquadro: righe consecutive che iniziano con ">".
    if (/^\s*>/.test(line)) {
      flush()
      const inner: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i]!)) inner.push(lines[i++]!.replace(/^\s*>\s?/, ''))
      i--
      const kind = calloutKind(inner.find((l) => l.trim()) ?? '')
      out.push(
        <blockquote key={key('q')} className={kind ? `callout callout-${kind}` : undefined}>
          <TextBlock lines={inner} keyBase={key('q')} />
        </blockquote>
      )
      continue
    }
    // Tabella: righe consecutive che iniziano con "|"; la riga |---| separa l'intestazione.
    if (/^\s*\|/.test(line)) {
      flush()
      const rows: string[] = []
      while (i < lines.length && /^\s*\|/.test(lines[i]!)) rows.push(lines[i++]!)
      i--
      const hasHeader = rows.length > 1 && /^\s*\|?\s*:?-{2,}/.test(rows[1]!)
      const head = hasHeader ? cells(rows[0]!) : null
      const body = (hasHeader ? rows.slice(2) : rows).map(cells)
      out.push(
        <table key={key('t')} className="md-table">
          {head && (
            <thead>
              <tr>
                {head.map((cell, c) => (
                  <th key={c}>{inline(cell, `${key('th')}-${c}`)}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {body.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c}>{inline(cell, `${key('td')}-${r}-${c}`)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
      continue
    }
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      const level = Math.min(6, heading[1]!.length + 2)
      const content = inline(heading[2]!, key('h'))
      out.push(level === 3 ? <h3 key={key('h')}>{content}</h3> : level === 4 ? <h4 key={key('h')}>{content}</h4> : <h5 key={key('h')}>{content}</h5>)
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flush()
      out.push(<hr key={key('r')} />)
    } else if (bullet || numbered) {
      flushParagraph()
      const ordered = !!numbered
      if (!list || list.ordered !== ordered) {
        flushList()
        list = { ordered, items: [] }
      }
      list.items.push((bullet ?? numbered)![1]!)
    } else if (!line.trim()) {
      flush()
    } else {
      flushList()
      paragraph.push(line.trim())
    }
  }
  flush()
  return <>{out}</>
}

export function Markdown({ source, renderCode }: { source: string; renderCode: (props: CodeBlockProps) => ReactNode }) {
  return (
    <div className="markdown">
      {splitBlocks(source).map((block, index) => (
        <Fragment key={index}>{block.kind === 'code' ? renderCode({ language: block.language, code: block.code }) : <TextBlock lines={block.lines} keyBase={String(index)} />}</Fragment>
      ))}
    </div>
  )
}
