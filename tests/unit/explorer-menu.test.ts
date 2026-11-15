import { describe, expect, it } from 'vitest'
import { duplicateName, treeMenu, treeMenuActions, type TreeMenuNode } from '../../src/shared/explorer-menu'
import { nextMenuIndex, placeMenu, placeSubmenu } from '../../src/shared/menu-position'

const submenu = (nodes: TreeMenuNode[], name: string) => nodes.find((n): n is Extract<TreeMenuNode, { submenu: string }> => typeof n === 'object' && 'submenu' in n && n.submenu === name)

describe('tasto destro dell’albero', () => {
  it('una pagina HTML: apri con anteprima e designer, AI, nuovo, copia, elimina in fondo', () => {
    const menu = treeMenu({ path: 'src/index.html', kind: 'file' })
    expect(menu[0]).toEqual({ heading: 'index.html' })
    expect(submenu(menu, 'openWith')?.items).toEqual([{ action: 'openPreview' }, { action: 'openDesigner' }])
    expect(submenu(menu, 'run')).toBeUndefined()
    expect(treeMenuActions(submenu(menu, 'ai')!.items)).toEqual(['aiExplain', 'aiComment', 'aiTests'])
    expect(treeMenuActions(submenu(menu, 'copy')!.items)).toEqual(['copyRelative', 'copyAbsolute', 'copyName'])
    expect(menu.at(-1)).toMatchObject({ action: 'delete', danger: true })
  })

  it('uno script si esegue nel terminale e passo passo; una query SQL con «Esegui la query»', () => {
    expect(treeMenuActions(submenu(treeMenu({ path: 'app.js', kind: 'file' }), 'run')!.items)).toEqual(['runTerminal', 'runStep'])
    expect(treeMenuActions(submenu(treeMenu({ path: 'q/prova.sql', kind: 'file' }), 'run')!.items)).toEqual(['runSql'])
  })

  it('immagini e database: niente AI, «Apri con» giusto', () => {
    const image = treeMenu({ path: 'img/logo.png', kind: 'file' })
    expect(submenu(image, 'ai')).toBeUndefined()
    expect(treeMenuActions(submenu(image, 'openWith')!.items)).toEqual(['openImage'])
    const db = treeMenu({ path: 'dati.sqlite', kind: 'file' })
    expect(treeMenuActions(submenu(db, 'openWith')!.items)).toEqual(['openDatabase'])
    expect(submenu(treeMenu({ path: 'giro.blocchi.json', kind: 'file' }), 'ai')).toBeUndefined()
  })

  it('una cartella: nuovo, terminale qui, espandi/comprimi; «Duplica» spento con il perché', () => {
    const menu = treeMenu({ path: 'src/css', kind: 'dir' })
    expect(menu[0]).toEqual({ heading: 'css/' })
    const actions = treeMenuActions(menu)
    expect(actions).toEqual(expect.arrayContaining(['newFile', 'newFolder', 'terminalHere', 'expandAll', 'collapseAll', 'rename', 'move', 'reveal', 'delete']))
    expect(actions).not.toContain('open')
    expect(menu.find((n) => typeof n === 'object' && 'action' in n && n.action === 'duplicate')).toMatchObject({ reason: 'folderDuplicate' })
  })

  it('lo spazio vuoto: le voci «Nuovo» in vista, niente rinomina né elimina', () => {
    const actions = treeMenuActions(treeMenu({ path: '', kind: 'root' }))
    expect(actions.slice(0, 2)).toEqual(['newFile', 'newFolder'])
    expect(actions).not.toContain('delete')
    expect(actions).not.toContain('rename')
  })

  it('nessun gruppo vuoto: mai due separatori di fila, né all’inizio o alla fine', () => {
    for (const target of [
      { path: 'a.txt', kind: 'file' as const },
      { path: 'x', kind: 'dir' as const },
      { path: '', kind: 'root' as const }
    ]) {
      const menu = treeMenu(target)
      expect(menu[0]).not.toBe('separator')
      expect(menu.at(-1)).not.toBe('separator')
      menu.forEach((node, i) => {
        if (node === 'separator') expect(menu[i + 1]).not.toBe('separator')
      })
    }
  })

  it('il nome della copia: «copia», poi «copia 2», con le estensioni doppie intere', () => {
    expect(duplicateName('src/pagina.html', ['src/pagina.html'])).toBe('src/pagina copia.html')
    expect(duplicateName('src/pagina.html', ['src/pagina.html', 'src/Pagina copia.html'])).toBe('src/pagina copia 2.html')
    expect(duplicateName('giro.blocchi.json', [])).toBe('giro copia.blocchi.json')
    expect(duplicateName('Makefile', [])).toBe('Makefile copia')
    expect(duplicateName('.env', [])).toBe('.env copia')
  })
})

describe('posizione dei menu e dei sottomenu', () => {
  const viewport = { width: 800, height: 600 }
  it('il menu resta dentro la finestra', () => {
    expect(placeMenu({ x: 790, y: 590 }, { width: 200, height: 300 }, viewport)).toEqual({ x: 596, y: 296 })
    expect(placeMenu({ x: 10, y: 10 }, { width: 200, height: 300 }, viewport)).toEqual({ x: 10, y: 10 })
  })
  it('il sottomenu a destra della voce, a sinistra se non ci sta', () => {
    expect(placeSubmenu({ x: 100, y: 100, width: 200, height: 24 }, { width: 180, height: 100 }, viewport).side).toBe('right')
    expect(placeSubmenu({ x: 560, y: 100, width: 200, height: 24 }, { width: 180, height: 100 }, viewport).side).toBe('left')
  })
  it('le frecce saltano titoli, separatori e voci spente', () => {
    const items = [{ enabled: false }, { enabled: true }, { enabled: false }, { enabled: true }]
    expect(nextMenuIndex(items, -1, 1)).toBe(1)
    expect(nextMenuIndex(items, 1, 1)).toBe(3)
    expect(nextMenuIndex(items, 3, 1)).toBe(1)
    expect(nextMenuIndex(items, 1, -1)).toBe(3)
  })
})
