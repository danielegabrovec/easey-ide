// Pannelli e disposizione (dockview). I moduli registrano i propri pannelli qui e li aprono
// per "area" (sinistra, centro, destra, basso) senza conoscere la struttura della griglia.
import type { FunctionComponent } from 'react'
import type { DockviewApi, IDockviewPanel, IDockviewPanelProps } from 'dockview'
import { t } from '../i18n'

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
    if (!options.inactive) existing.api.setActive()
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
