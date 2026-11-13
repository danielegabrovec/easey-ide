// Vista affiancata grafica ↔ codice (standard «Vista affiancata grafica ↔ codice» nel vault Cerebro):
// ogni editor grafico registra qui come mostrare e nascondere il suo codice accanto. Il comando
// `view.splitCode` (Ctrl+Alt+K) e il pulsante «Affianca codice» agiscono sull'editor grafico attivo;
// la scelta si ricorda per tipo di editor (designer, blocchi, nodi).
import { t } from '../i18n'
import { registerCommand } from './commands'
import { lastWidePanel } from './layout'
import { notify } from './notifications'

export interface SplitProvider {
  /** Tipo di editor (per ricordare la scelta): 'designer', 'blocchi', 'nodi'. */
  kind: string
  matches: (panelId: string) => boolean
  isOpen: (panelId: string) => boolean
  setOpen: (panelId: string, open: boolean) => void | Promise<void>
}

const providers: SplitProvider[] = []
const storageKey = (kind: string) => `easey.splitCode.${kind}`

export function registerSplitProvider(provider: SplitProvider): void {
  providers.push(provider)
}

/** La scelta ricordata per un tipo di editor (predefinito: `fallback`). */
export function rememberedSplit(kind: string, fallback = false): boolean {
  try {
    const raw = localStorage.getItem(storageKey(kind))
    return raw === null ? fallback : raw === 'true'
  } catch {
    return fallback
  }
}

export function rememberSplit(kind: string, open: boolean): void {
  try {
    localStorage.setItem(storageKey(kind), String(open))
  } catch {
    /* archivio non disponibile */
  }
}

/** Mostra/nasconde il codice accanto all'editor grafico `panelId` (o all'ultimo attivo). */
export async function toggleSplitCode(panelId: string | null = lastWidePanel()): Promise<void> {
  const provider = panelId ? providers.find((p) => p.matches(panelId)) : undefined
  if (!panelId || !provider) {
    notify(t('split.none'), 'info')
    return
  }
  const open = !provider.isOpen(panelId)
  rememberSplit(provider.kind, open)
  await provider.setOpen(panelId, open)
}

export function registerSplitCommand(): void {
  registerCommand({ id: 'view.splitCode', title: t('split.command'), category: t('category.view'), keybinding: 'Ctrl+Alt+K', run: () => toggleSplitCode() })
}
