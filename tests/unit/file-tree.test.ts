// Esplora: righe visibili, tastiera e spostamenti (revisione del 13/11/2026, P1-4).
import { describe, expect, it } from 'vitest'
import type { FileEntry } from '@shared/contracts/workspace'
import { folderPaths, moveDestination, treeKey, visibleRows } from '@shared/file-tree'

const TREE: FileEntry[] = [
  {
    name: 'pagine',
    path: 'pagine',
    kind: 'dir',
    children: [
      { name: 'chi-sono.html', path: 'pagine/chi-sono.html', kind: 'file' },
      { name: 'vecchie', path: 'pagine/vecchie', kind: 'dir', children: [] }
    ]
  },
  { name: 'index.html', path: 'index.html', kind: 'file' },
  { name: 'style.css', path: 'style.css', kind: 'file' }
]

describe('visibleRows', () => {
  it('le cartelle chiuse nascondono il contenuto', () => {
    expect(visibleRows(TREE, new Set()).map((r) => r.path)).toEqual(['pagine', 'index.html', 'style.css'])
    const open = visibleRows(TREE, new Set(['pagine']))
    expect(open.map((r) => `${r.depth}:${r.path}`)).toEqual(['0:pagine', '1:pagine/chi-sono.html', '1:pagine/vecchie', '0:index.html', '0:style.css'])
    expect(open[1]!.parent).toBe('pagine')
  })
})

describe('treeKey (tastiera come in VS Code)', () => {
  const expanded = new Set(['pagine'])
  const rows = visibleRows(TREE, expanded)

  it('frecce su e giù, Home e Fine', () => {
    expect(treeKey(rows, 'pagine', 'ArrowDown', expanded)).toEqual({ kind: 'focus', path: 'pagine/chi-sono.html' })
    expect(treeKey(rows, 'index.html', 'ArrowUp', expanded)).toEqual({ kind: 'focus', path: 'pagine/vecchie' })
    expect(treeKey(rows, 'style.css', 'ArrowDown', expanded)).toEqual({ kind: 'focus', path: 'style.css' })
    expect(treeKey(rows, 'style.css', 'Home', expanded)).toEqual({ kind: 'focus', path: 'pagine' })
    expect(treeKey(rows, 'pagine', 'End', expanded)).toEqual({ kind: 'focus', path: 'style.css' })
  })

  it('destra apre o entra, sinistra chiude o sale', () => {
    expect(treeKey(rows, 'pagine', 'ArrowRight', expanded)).toEqual({ kind: 'focus', path: 'pagine/chi-sono.html' })
    expect(treeKey(rows, 'pagine/vecchie', 'ArrowRight', expanded)).toEqual({ kind: 'expand', path: 'pagine/vecchie' })
    expect(treeKey(rows, 'pagine', 'ArrowLeft', expanded)).toEqual({ kind: 'collapse', path: 'pagine' })
    expect(treeKey(rows, 'pagine/chi-sono.html', 'ArrowLeft', expanded)).toEqual({ kind: 'focus', path: 'pagine' })
    expect(treeKey(rows, 'index.html', 'ArrowLeft', expanded)).toBeNull()
  })

  it('Invio, F2 e Canc', () => {
    expect(treeKey(rows, 'index.html', 'Enter', expanded)).toEqual({ kind: 'open', path: 'index.html' })
    expect(treeKey(rows, 'pagine', 'Enter', expanded)).toEqual({ kind: 'toggle', path: 'pagine' })
    expect(treeKey(rows, 'style.css', 'F2', expanded)).toEqual({ kind: 'rename', path: 'style.css' })
    expect(treeKey(rows, 'pagine', 'Delete', expanded)).toEqual({ kind: 'delete', path: 'pagine', entry: 'dir' })
    expect(treeKey(rows, 'pagine', 'a', expanded)).toBeNull()
  })
})

describe('moveDestination', () => {
  it('nella cartella di destinazione con lo stesso nome', () => {
    expect(moveDestination('style.css', 'pagine')).toBe('pagine/style.css')
    expect(moveDestination('pagine/chi-sono.html', '')).toBe('chi-sono.html')
    expect(moveDestination('pagine/vecchie', '/')).toBe('vecchie')
  })

  it('niente spostamenti senza senso', () => {
    expect(moveDestination('style.css', '')).toBeNull()
    expect(moveDestination('pagine/chi-sono.html', 'pagine')).toBeNull()
    expect(moveDestination('pagine', 'pagine')).toBeNull()
    expect(moveDestination('pagine', 'pagine/vecchie')).toBeNull()
  })

  it('elenco delle cartelle per «Sposta in…»', () => {
    expect(folderPaths(TREE)).toEqual(['pagine', 'pagine/vecchie'])
  })
})
