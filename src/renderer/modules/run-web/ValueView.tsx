// Rappresentazione di un valore della console, con oggetti e array espandibili.
import { useState } from 'react'
import type { SerializedValue } from '@shared/contracts/runner'

function preview(value: SerializedValue): string {
  switch (value.t) {
    case 'string':
      return JSON.stringify(value.v)
    case 'number':
    case 'bigint':
    case 'symbol':
    case 'date':
    case 'regexp':
      return value.v
    case 'boolean':
      return String(value.v)
    case 'null':
      return 'null'
    case 'undefined':
      return 'undefined'
    case 'function':
      return `ƒ ${value.name}()`
    case 'error':
      return `${value.name}: ${value.message}`
    case 'element':
      return `<${value.tag}${value.id ? `#${value.id}` : ''}${value.className ? `.${value.className.trim().split(/\s+/).join('.')}` : ''}>`
    case 'array':
      return `Array(${value.length})`
    case 'object':
      return value.ctor === 'Object' ? '{…}' : `${value.ctor} {…}`
    case 'map':
      return `Map(${value.entries.length})`
    case 'set':
      return `Set(${value.items.length})`
    case 'circular':
      return '[riferimento circolare]'
    case 'truncated':
      return '…'
  }
}

function inline(value: SerializedValue, depth = 0): string {
  if (depth > 1) return preview(value)
  if (value.t === 'array') {
    const items = value.items.slice(0, 8).map((item) => inline(item, depth + 1))
    return `[${items.join(', ')}${value.length > 8 ? ', …' : ''}]`
  }
  if (value.t === 'object') {
    const entries = value.entries.slice(0, 6).map(([k, v]) => `${k}: ${inline(v, depth + 1)}`)
    return `${value.ctor === 'Object' ? '' : `${value.ctor} `}{${entries.join(', ')}${value.entries.length > 6 || value.more ? ', …' : ''}}`
  }
  return preview(value)
}

function isExpandable(value: SerializedValue): boolean {
  return (
    (value.t === 'array' && value.items.length > 0) ||
    (value.t === 'object' && value.entries.length > 0) ||
    (value.t === 'map' && value.entries.length > 0) ||
    (value.t === 'set' && value.items.length > 0) ||
    (value.t === 'error' && !!value.stack)
  )
}

function children(value: SerializedValue): [string, SerializedValue][] {
  switch (value.t) {
    case 'array':
      return value.items.map((item, index) => [String(index), item])
    case 'object':
      return value.entries
    case 'map':
      return value.entries.map(([k, v]) => [inline(k), v])
    case 'set':
      return value.items.map((item, index) => [String(index), item])
    default:
      return []
  }
}

export function ValueView({ value, topLevel = false }: { value: SerializedValue; topLevel?: boolean }) {
  const [open, setOpen] = useState(false)
  // Le stringhe al primo livello si mostrano senza virgolette, come nella console del browser.
  if (topLevel && value.t === 'string') return <span className="v-plain">{value.v}</span>
  if (!isExpandable(value)) return <span className={`v-${value.t}`}>{topLevel ? inline(value) : preview(value)}</span>
  if (value.t === 'error') {
    return (
      <span className="v-error">
        <button className="v-toggle" onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'}
        </button>
        {preview(value)}
        {open && <pre className="v-stack">{value.stack}</pre>}
      </span>
    )
  }
  return (
    <span className="v-tree">
      <button className="v-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? '▾' : '▸'} <span className={`v-${value.t}`}>{inline(value)}</span>
      </button>
      {open && (
        <span className="v-children">
          {children(value).map(([key, child]) => (
            <span key={key} className="v-row">
              <span className="v-key">{key}</span>: <ValueView value={child} />
            </span>
          ))}
          {value.t === 'object' && value.more && <span className="v-row hint">…</span>}
        </span>
      )}
    </span>
  )
}

/** Righe di una console.table: array di oggetti o oggetto di oggetti. */
export function TableView({ value }: { value: SerializedValue }) {
  const rows: [string, SerializedValue][] =
    value.t === 'array' ? value.items.map((item, index) => [String(index), item]) : value.t === 'object' ? value.entries : []
  if (rows.length === 0) return <ValueView value={value} topLevel />
  const columns: string[] = []
  let hasValueColumn = false
  for (const [, row] of rows) {
    if (row.t === 'object') {
      for (const [key] of row.entries) if (!columns.includes(key)) columns.push(key)
    } else if (row.t === 'array') {
      row.items.forEach((_, index) => !columns.includes(String(index)) && columns.push(String(index)))
    } else hasValueColumn = true
  }
  const cell = (row: SerializedValue, column: string) => {
    if (row.t === 'object') return row.entries.find(([key]) => key === column)?.[1]
    if (row.t === 'array') return row.items[Number(column)]
    return undefined
  }
  return (
    <table className="console-table">
      <thead>
        <tr>
          <th>(indice)</th>
          {columns.map((c) => (
            <th key={c}>{c}</th>
          ))}
          {hasValueColumn && <th>Valore</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map(([key, row]) => (
          <tr key={key}>
            <td>{key}</td>
            {columns.map((c) => {
              const v = cell(row, c)
              return <td key={c}>{v ? <ValueView value={v} /> : ''}</td>
            })}
            {hasValueColumn && <td>{row.t !== 'object' && row.t !== 'array' ? <ValueView value={row} /> : ''}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
