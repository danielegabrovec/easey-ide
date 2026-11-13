// Pannelli e disposizione (dockview). I moduli registrano i propri pannelli qui e li aprono
// per "area" (sinistra, centro, destra, basso) senza conoscere la struttura della griglia.
import type { FunctionComponent } from 'react'
import type { DockviewApi, IDockviewPanel, IDockviewPanelProps } from 'dockview'
import { create } from 'zustand'
import { t } from '../i18n'

/**
 * Cosa si vede intorno all'area centrale: l'Esplora a sinistra (Ctrl+B) e i pannelli di servizio
 * (anteprima a destra, console in basso: Ctrl+J). Gli editor grafici (designer, blocchi, nodi,
 * diagrammi, Scrittura rapida) nascondono da soli i pannelli di servizio, MAI l'Esplora; tornando a
 * un file riappaiono. Niente più gruppi ingranditi senza un pulsante per tornare indietro.
 */
export const useLayout = create<{ sidebar: boolean; panels: boolean }>(() => ({ sidebar: true, panels: true }))

/** Pannelli che hanno bisogno di spazio: aperti, nascondono anteprima e console. */
const WIDE_PANELS = ['designer', 'quick', 'visual:', 'diagram:']

export function isWidePanel(id: string): boolean {
  return WIDE_PANELS.some((prefix) => (prefix.endsWith(':') ? id.startsWith(prefix) : id === prefix))
}

/** I pannelli di servizio sono stati nascosti dall'apertura di un editor grafico (non dall'utente). */
let autoHidden = false
/** L'utente li ha rimostrati mentre era attivo un editor grafico: non li si nasconde di nuovo. */
let keptByUser = false

export type Area = 'left' | 'center' | 'right' | 'bottom'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PanelComponent = FunctionComponent<IDockviewPanelProps<any>>

const components: Record<string, PanelComponent> = {}
let api: DockviewApi | null = null
const areaGroups: Partial<Record<Area, string>> = {}

export function registerPanel(component: string, render: PanelComponent): void {
  components[component] = render
}

export function panelComponents(): Record<string, PanelComponent> {
  return components
}

export function setDockApi(next: DockviewApi | null): void {
  api = next
  next?.onDidActivePanelChange((panel) => onActivePanel(panel ?? null))
}

function onActivePanel(panel: IDockviewPanel | null): void {
  if (!panel || !api) return
  // Le schede dei gruppi laterali (Esplora, anteprima, console) non cambiano la disposizione.
  if ([areaGroups.left, areaGroups.right, areaGroups.bottom].includes(panel.group.id)) return
  if (isWidePanel(panel.id)) {
    if (useLayout.getState().panels && !keptByUser) setPanelsVisible(false, true)
  } else {
    keptByUser = false
    if (autoHidden) setPanelsVisible(true)
  }
}

function setGroupVisible(area: Area, visible: boolean): void {
  const group = liveGroup(area)
  if (group && group.api.isVisible !== visible) group.api.setVisible(visible)
}

/** Esplora (gruppo di sinistra) visibile o nascosto. */
export function setSidebarVisible(visible: boolean): void {
  if (!api) return
  if (api.hasMaximizedGroup()) api.exitMaximizedGroup()
  if (visible && !liveGroup('left')) showPanel({ id: 'explorer', component: 'explorer', title: t('panel.explorer'), area: 'left' })
  setGroupVisible('left', visible)
  useLayout.setState({ sidebar: visible })
}

export function toggleSidebar(): void {
  setSidebarVisible(!useLayout.getState().sidebar)
}

/** Anteprima e console visibili o nascoste. `auto` = decisione dell'IDE, non dell'utente. */
export function setPanelsVisible(visible: boolean, auto = false): void {
  if (!api) return
  if (api.hasMaximizedGroup()) api.exitMaximizedGroup()
  setGroupVisible('right', visible)
  setGroupVisible('bottom', visible)
  autoHidden = !visible && auto
  if (!auto) keptByUser = visible && isWidePanel(api.activePanel?.id ?? '')
  useLayout.setState({ panels: visible })
}

export function togglePanels(): void {
  setPanelsVisible(!useLayout.getState().panels)
}

/** Un pannello aperto in un gruppo nascosto lo rende di nuovo visibile (es. «Anteprima» con i pannelli nascosti). */
function revealGroupOf(panel: IDockviewPanel): void {
  if (panel.group.api.isVisible) return
  panel.group.api.setVisible(true)
  if (panel.group.id === areaGroups.left) useLayout.setState({ sidebar: true })
  else if (panel.group.id === areaGroups.right || panel.group.id === areaGroups.bottom) {
    // L'altro pannello di servizio torna insieme, come lo si era lasciato.
    setGroupVisible('right', true)
    setGroupVisible('bottom', true)
    autoHidden = false
    keptByUser = isWidePanel(api?.activePanel?.id ?? '')
    useLayout.setState({ panels: true })
  }
}

export function dockApi(): DockviewApi | null {
  return api
}

export interface ShowPanelOptions {
  id: string
  component: string
  title: string
  area: Area
  params?: Record<string, unknown>
  /** 'always' mantiene il DOM quando la scheda non è visibile (anteprima, terminale). */
  renderer?: 'always' | 'onlyWhenVisible'
  inactive?: boolean
}

function liveGroup(area: Area) {
  const id = areaGroups[area]
  if (!id || !api) return undefined
  return api.groups.find((group) => group.id === id)
}

export function showPanel(options: ShowPanelOptions): IDockviewPanel | null {
  if (!api) return null
  const existing = api.getPanel(options.id)
  if (existing) {
    if (!options.inactive) {
      revealGroupOf(existing)
      existing.api.setActive()
    }
    return existing
  }
  const base = {
    id: options.id,
    component: options.component,
    title: options.title,
    params: options.params ?? {},
    renderer: options.renderer,
    inactive: options.inactive
  }
  const group = liveGroup(options.area)
  let panel: IDockviewPanel
  if (group) {
    panel = api.addPanel({ ...base, position: { referenceGroup: group } })
  } else if (options.area === 'center') {
    const fallback = api.activeGroup ?? api.groups[0]
    panel = fallback ? api.addPanel({ ...base, position: { referenceGroup: fallback } }) : api.addPanel(base)
  } else {
    const direction = options.area === 'left' ? 'left' : options.area === 'right' ? 'right' : 'below'
    panel = api.addPanel({ ...base, position: { direction } })
  }
  areaGroups[options.area] = panel.group.id
  if (!options.inactive) revealGroupOf(panel)
  return panel
}

export function closePanel(id: string): void {
  api?.getPanel(id)?.api.close()
}

export function findPanels(prefix: string): IDockviewPanel[] {
  return api ? api.panels.filter((panel) => panel.id.startsWith(prefix)) : []
}

/** Ricorda in quale gruppo stanno gli editor: i file nuovi si aprono lì. */
export function rememberArea(area: Area, groupId: string): void {
  areaGroups[area] = groupId
}

export function buildDefaultLayout(): void {
  if (!api) return
  api.clear()
  for (const key of Object.keys(areaGroups) as Area[]) delete areaGroups[key]
  autoHidden = false
  keptByUser = false
  useLayout.setState({ sidebar: true, panels: true })
  const welcome = api.addPanel({ id: 'welcome', component: 'welcome', title: t('panel.welcome') })
  areaGroups.center = welcome.group.id
  const preview = api.addPanel({
    id: 'preview',
    component: 'preview',
    title: t('panel.preview'),
    renderer: 'always',
    position: { direction: 'right' },
    initialWidth: Math.round(window.innerWidth * 0.36)
  })
  areaGroups.right = preview.group.id
  const explorer = api.addPanel({
    id: 'explorer',
    component: 'explorer',
    title: t('panel.explorer'),
    position: { direction: 'left' },
    initialWidth: 250
  })
  areaGroups.left = explorer.group.id
  const consolePanel = api.addPanel({
    id: 'console',
    component: 'console',
    title: t('panel.console'),
    renderer: 'always',
    position: { referenceGroup: welcome.group, direction: 'below' },
    initialHeight: 230
  })
  areaGroups.bottom = consolePanel.group.id
  api.addPanel({ id: 'terminal', component: 'terminal', title: t('panel.terminal'), renderer: 'always', position: { referenceGroup: consolePanel.group }, inactive: true })
  api.addPanel({ id: 'problems', component: 'problems', title: t('panel.problems'), position: { referenceGroup: consolePanel.group }, inactive: true })
  welcome.api.setActive()
}
