// Vecchio pannello dockview «ai-chat»: la chat ora sta nel pannello laterale del guscio. Resta registrato
// solo perché un layout che lo contiene ancora non si rompa: appena compare si chiude e apre la chat laterale.
import { useEffect } from 'react'
import type { IDockviewPanelProps } from 'dockview'
import { sidePanel } from '../../workbench/side-panel'

export function LegacyChatPanel({ api }: IDockviewPanelProps) {
  useEffect(() => {
    // Fuori dal ciclo di render di dockview: chiudere un pannello mentre si monta non è sicuro.
    const timer = setTimeout(() => {
      api.close()
      sidePanel().setOpen(true)
    }, 0)
    return () => clearTimeout(timer)
  }, [api])
  return null
}
