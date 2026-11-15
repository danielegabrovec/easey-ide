// Aiuto contestuale (F1): una pagina in italiano semplice per ogni area principale dell'IDE, in
// resources/help/<id>.md (inclusa nel renderer al momento della build). Qui la mappa pannello → pagina, pura.

export const HELP_PAGES = ['benvenuto', 'editor', 'anteprima', 'terminale', 'designer', 'visuale', 'scrittura-rapida', 'database', 'corsi', 'assistente'] as const

export type HelpPage = (typeof HELP_PAGES)[number]

export function isHelpPage(value: unknown): value is HelpPage {
  return typeof value === 'string' && (HELP_PAGES as readonly string[]).includes(value)
}

/** Id dei pannelli (dockview) → pagina. Gli editor si chiamano `editor:<percorso>`, i programmi `visual:<percorso>`. */
const BY_PANEL: [test: (id: string) => boolean, page: HelpPage][] = [
  [(id) => id === 'welcome', 'benvenuto'],
  [(id) => id.startsWith('editor:') || id === 'image' || id.startsWith('git-diff:'), 'editor'],
  [(id) => id === 'preview' || id === 'console', 'anteprima'],
  [(id) => id === 'terminal' || id === 'problems' || id === 'trace', 'terminale'],
  [(id) => id === 'designer', 'designer'],
  [(id) => id.startsWith('visual:') || id.startsWith('diagram:'), 'visuale'],
  [(id) => id === 'quick', 'scrittura-rapida'],
  [(id) => id.startsWith('sql-'), 'database'],
  [(id) => id === 'learn', 'corsi']
]

/** La pagina per il pannello attivo; `inAssistant` = il fuoco è nella colonna dell'assistente AI. */
export function helpPageFor(panelId: string | null | undefined, inAssistant = false): HelpPage {
  if (inAssistant) return 'assistente'
  if (panelId) for (const [test, page] of BY_PANEL) if (test(panelId)) return page
  return 'benvenuto'
}
