// Codice generato accanto a blocchi e nodi: visibile o nascosto per pannello, con la scelta ricordata
// per tipo (vista affiancata grafica ↔ codice, comando view.splitCode / Ctrl+Alt+K).
import { create } from 'zustand'
import { isVisualFile } from '@shared/visual/program'
import { registerSplitProvider, rememberedSplit } from '../../workbench/split-code'

export const useCodeSide = create<{ open: Record<string, boolean> }>(() => ({ open: {} }))

const kindOf = (panelId: string) => (panelId.startsWith('visual:') ? isVisualFile(panelId.slice('visual:'.length)) : null)

/** Il codice è affiancato al pannello? (predefinito: sì, come è sempre stato) */
export function codeSideOpen(panelId: string): boolean {
  const kind = kindOf(panelId)
  return useCodeSide.getState().open[panelId] ?? (kind ? rememberedSplit(kind, true) : true)
}

export function useCodeSideOpen(panelId: string): boolean {
  return useCodeSide((s) => s.open[panelId] ?? rememberedSplit(kindOf(panelId) ?? 'nodi', true))
}

export function registerVisualSplit(): void {
  for (const kind of ['blocchi', 'nodi'] as const) {
    registerSplitProvider({
      kind,
      matches: (id) => kindOf(id) === kind,
      isOpen: (id) => codeSideOpen(id),
      setOpen: (id, open) => useCodeSide.setState((s) => ({ open: { ...s.open, [id]: open } }))
    })
  }
}
