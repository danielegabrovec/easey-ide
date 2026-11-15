// Documenti «senza file» (1.6): la Scrittura rapida è un documento come un file, ma non sta nel progetto. Quando è
// l'ultimo documento usato, la chat AI la vede come il file aperto (chip, contesto, «Applica», «Inserisci») invece di
// dire «nessun file aperto» — come la query senza titolo di Easey DB 1.1. Il modulo che possiede il documento lo
// annuncia qui; l'editor e la chat lo leggono senza conoscere quel modulo.
import type * as Monaco from 'monaco-editor'
import { create } from 'zustand'
import type { EditorContext } from '@shared/contracts/editor'

export interface VirtualDocument {
  /** Percorso finto, usato come chiave (es. «scrittura-rapida.py»). */
  path: string
  /** Nome per il chip della chat (es. «Scrittura rapida · Python»). */
  label: string
  language: string
  context: () => EditorContext | null
  editor: () => Monaco.editor.ICodeEditor | null
}

export const useVirtualDocument = create<{ current: VirtualDocument | null }>(() => ({ current: null }))

/** Il documento senza file attivo adesso (null = vale il file dell'editor, se c'è). */
export const currentVirtualDocument = (): VirtualDocument | null => useVirtualDocument.getState().current

export function setCurrentVirtualDocument(document: VirtualDocument | null): void {
  const current = useVirtualDocument.getState().current
  if (current === document || (current && document && current.path === document.path && current.label === document.label)) return
  useVirtualDocument.setState({ current: document })
}

/** Il documento senza file con questo percorso, se è quello attivo. */
export function virtualDocumentAt(path: string): VirtualDocument | null {
  const current = currentVirtualDocument()
  return current && current.path === path ? current : null
}
