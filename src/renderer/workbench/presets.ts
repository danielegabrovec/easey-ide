// Disposizioni pronte (1.6, come in Easey DB): «Standard» (Benvenuto/editor al centro, Esplora a sinistra,
// anteprima a destra, console e terminale in basso, assistente AI nella colonna fuori dalla griglia) e
// «Laboratorio», didattica: al centro la Scrittura rapida con sopra la striscia degli esempi, sotto Output, Console
// e Terminale, a sinistra Raccolta ed Esplora (i file), a destra le Esecuzioni sopra l'Assistente AI (lo stesso
// contenuto della colonna laterale, qui come pannello della griglia), più «Guida» e «Manuale».
// Passare da una all'altra NON chiude i documenti aperti (file, designer, diagrammi…): restano al centro; si
// rifanno solo le colonne intorno. La scelta si ricorda (layout.ts).
import type { DockviewApi, IDockviewPanel } from 'dockview'
import { createElement } from 'react'
import { registerCommand } from './commands'
import { emit } from './events'
import { areaGroup, buildDefaultLayout, dockApi, forgetSideAreas, layoutPreset, registerPanel, rememberArea, setDockApi, setLayoutPreset, type LayoutPreset } from './layout'
import { sidePanelRegistration, useSidePanel } from './side-panel'
import { t } from '../i18n'

/** L'assistente AI come pannello della griglia (solo nel Laboratorio). */
export const AI_PANEL = 'ai-assistant'
registerPanel(AI_PANEL, function AiAssistantPanel() {
  const registration = sidePanelRegistration()
  return createElement('div', { className: 'panel ai-docked', 'data-testid': 'ai-docked' }, registration ? createElement(registration.component) : null)
})

const LAB_LEFT_WIDTH = 230
const LAB_RIGHT_WIDTH = 340
const LAB_BOTTOM_HEIGHT = 250
/** Assistente aperto o chiuso nella Standard, da rimettere tornandoci. */
const STANDARD_SIDE_KEY = 'easey.layout.standardSideOpen'

/** Mentre si rifà la griglia, chiudere il pannello dell'assistente non vuol dire «chiudi l'assistente». */
let switching = false

/** I pannelli che appartengono alle colonne intorno (non documenti): si chiudono cambiando disposizione. */
const SIDE_PANELS = new Set(['explorer', 'preview', 'console', 'terminal', 'problems', 'git', 'sql-db', 'sql-results', 'sql-terminal', 'learn', 'glossary', 'trace', 'quick-output', 'quick-collection', 'lab-history', AI_PANEL])

function closeSidePanels(api: DockviewApi): void {
  const sides = new Set(['left', 'right', 'bottom'].map((area) => areaGroup(area as 'left')?.id).filter(Boolean))
  for (const panel of [...api.panels]) {
    if (SIDE_PANELS.has(panel.id) || sides.has(panel.group.id)) panel.api.close()
  }
  forgetSideAreas()
}

/** Larghezze delle colonne, subito e di nuovo quando la griglia ha la sua misura nuova. */
function settleSizes(sizes: [IDockviewPanel, { width?: number; height?: number }][]): void {
  const apply = () => {
    for (const [panel, size] of sizes) if (dockApi()?.getPanel(panel.id)) panel.group.api.setSize(size)
  }
  apply()
  requestAnimationFrame(() => requestAnimationFrame(apply))
  setTimeout(apply, 150)
}

function addAssistant(api: DockviewApi, below: IDockviewPanel): void {
  if (api.getPanel(AI_PANEL)) return
  api.addPanel({ id: AI_PANEL, component: AI_PANEL, title: t('ai.panelTitle'), position: { referenceGroup: below.group, direction: 'below' } })
}

/** Laboratorio intorno ai documenti aperti. */
function buildLab(api: DockviewApi): void {
  closeSidePanels(api)
  // Centro: la Scrittura rapida, accanto ai documenti che c'erano.
  const centerGroup = api.groups[0]
  const quickBase = { id: 'quick', component: 'quick', title: t('panel.quick'), renderer: 'always' as const }
  const quick = api.getPanel('quick') ?? (centerGroup ? api.addPanel({ ...quickBase, position: { referenceGroup: centerGroup } }) : api.addPanel(quickBase))
  rememberArea('center', quick.group.id)

  // Sinistra: la Raccolta dei salvataggi e l'Esplora (i file del progetto).
  const collection = api.addPanel({ id: 'quick-collection', component: 'quick-collection', title: t('lab.collection'), position: { referenceGroup: quick.group, direction: 'left' }, initialWidth: LAB_LEFT_WIDTH })
  rememberArea('left', collection.group.id)
  api.addPanel({ id: 'explorer', component: 'explorer', title: t('lab.files'), position: { referenceGroup: collection.group }, inactive: true })

  // Destra: le Esecuzioni sopra, l'Assistente AI sotto.
  const history = api.addPanel({ id: 'lab-history', component: 'lab-history', title: t('lab.historyTitle'), position: { referenceGroup: quick.group, direction: 'right' }, initialWidth: LAB_RIGHT_WIDTH })
  rememberArea('right', history.group.id)
  useSidePanel.setState({ mode: 'panel' })
  addAssistant(api, history)

  // Sotto l'editor: Output, Console, Terminale, Problemi.
  const output = api.addPanel({ id: 'quick-output', component: 'quick-output', title: t('lab.output'), renderer: 'always', position: { referenceGroup: quick.group, direction: 'below' }, initialHeight: LAB_BOTTOM_HEIGHT })
  rememberArea('bottom', output.group.id)
  api.addPanel({ id: 'console', component: 'console', title: t('panel.console'), renderer: 'always', position: { referenceGroup: output.group }, inactive: true })
  api.addPanel({ id: 'terminal', component: 'terminal', title: t('panel.terminal'), renderer: 'always', position: { referenceGroup: output.group }, inactive: true })
  api.addPanel({ id: 'problems', component: 'problems', title: t('panel.problems'), position: { referenceGroup: output.group }, inactive: true })
  output.api.setActive()

  settleSizes([
    [collection, { width: LAB_LEFT_WIDTH }],
    [history, { width: LAB_RIGHT_WIDTH }],
    [output, { height: LAB_BOTTOM_HEIGHT }]
  ])
  quick.api.setActive()
}

/** Standard intorno ai documenti aperti: Esplora, anteprima, console/terminale/problemi. */
function buildStandard(api: DockviewApi): void {
  closeSidePanels(api)
  if (api.panels.length === 0) {
    buildDefaultLayout()
    return
  }
  const center = api.groups[0]!
  rememberArea('center', center.id)
  const preview = api.addPanel({ id: 'preview', component: 'preview', title: t('panel.preview'), renderer: 'always', position: { referenceGroup: center, direction: 'right' }, initialWidth: Math.round(window.innerWidth * 0.36) })
  rememberArea('right', preview.group.id)
  const explorer = api.addPanel({ id: 'explorer', component: 'explorer', title: t('panel.explorer'), position: { referenceGroup: center, direction: 'left' }, initialWidth: 250 })
  rememberArea('left', explorer.group.id)
  const consolePanel = api.addPanel({ id: 'console', component: 'console', title: t('panel.console'), renderer: 'always', position: { referenceGroup: center, direction: 'below' }, initialHeight: 230 })
  rememberArea('bottom', consolePanel.group.id)
  api.addPanel({ id: 'terminal', component: 'terminal', title: t('panel.terminal'), renderer: 'always', position: { referenceGroup: consolePanel.group }, inactive: true })
  api.addPanel({ id: 'problems', component: 'problems', title: t('panel.problems'), position: { referenceGroup: consolePanel.group }, inactive: true })
  settleSizes([
    [explorer, { width: 250 }],
    [consolePanel, { height: 230 }]
  ])
  center.activePanel?.api.setActive()
}

function rememberStandardSide(): void {
  try {
    localStorage.setItem(STANDARD_SIDE_KEY, useSidePanel.getState().open ? '1' : '0')
  } catch {
    /* archiviazione non disponibile */
  }
}

function standardSideOpen(): boolean {
  try {
    const stored = localStorage.getItem(STANDARD_SIDE_KEY)
    if (stored !== null) return stored === '1'
  } catch {
    /* archiviazione non disponibile */
  }
  return useSidePanel.getState().open
}

/** Passa a una disposizione pronta (o la rifà, se è già quella). */
export function applyPreset(preset: LayoutPreset): void {
  const api = dockApi()
  if (!api) return
  const from = layoutPreset()
  switching = true
  try {
    if (preset === 'lab') {
      if (from !== 'lab') rememberStandardSide()
      setLayoutPreset('lab')
      buildLab(api)
      useSidePanel.setState({ open: true })
    } else {
      const open = from === 'lab' ? standardSideOpen() : useSidePanel.getState().open
      setLayoutPreset('standard')
      useSidePanel.setState({ mode: 'side' })
      buildStandard(api)
      useSidePanel.setState({ open })
    }
  } finally {
    switching = false
  }
}

/** «Ripristina la disposizione»: quella di fabbrica della disposizione pronta scelta. */
export function resetLayout(): void {
  switching = true
  try {
    useSidePanel.setState({ mode: 'side' })
    buildDefaultLayout()
    const api = dockApi()
    if (api && layoutPreset() === 'lab') {
      buildLab(api)
      useSidePanel.setState({ open: true })
    }
  } finally {
    switching = false
  }
}

/** Avvio della griglia (Workbench, onReady): la disposizione pronta ricordata. */
export function initLayout(api: DockviewApi): void {
  setDockApi(api)
  resetLayout()
  api.onDidRemovePanel((panel) => {
    // ✕ sulla scheda dell'assistente nel Laboratorio = assistente chiuso (Ctrl+Alt+B lo riapre).
    if (panel.id === AI_PANEL && !switching && layoutPreset() === 'lab' && useSidePanel.getState().open) useSidePanel.setState({ open: false })
  })
  emit('layout:ready')
}

// Nel Laboratorio «aperto» e il pannello vanno insieme: Ctrl+Alt+B, «Chiedi all'AI», ✕ dell'intestazione.
useSidePanel.subscribe((state, previous) => {
  if (switching || state.mode !== 'panel' || state.open === previous.open) return
  const api = dockApi()
  if (!api) return
  if (state.open) {
    const existing = api.getPanel(AI_PANEL)
    if (existing) existing.api.setActive()
    else {
      const history = api.getPanel('lab-history')
      if (history) addAssistant(api, history)
      else api.addPanel({ id: AI_PANEL, component: AI_PANEL, title: t('ai.panelTitle'), position: { direction: 'right' }, initialWidth: LAB_RIGHT_WIDTH })
    }
  } else api.getPanel(AI_PANEL)?.api.close()
})

export function registerLayoutCommands(): void {
  const category = t('category.view')
  registerCommand({ id: 'layout.lab', title: t('lab.cmdLab'), category, run: () => applyPreset('lab') })
  registerCommand({ id: 'layout.standard', title: t('lab.cmdStandard'), category, run: () => applyPreset('standard') })
  registerCommand({ id: 'layout.toggleLab', title: t('lab.cmdToggle'), category, palette: false, run: () => applyPreset(layoutPreset() === 'lab' ? 'standard' : 'lab') })
  registerCommand({ id: 'workbench.resetLayout', title: t('cmd.resetLayout'), category, run: () => resetLayout() })
}

/** Apre o chiude un pannello del Laboratorio (Guida, Manuale): un secondo clic lo chiude. */
export function toggleLabPanel(id: string, open: () => unknown): void {
  const panel = dockApi()?.getPanel(id)
  if (panel?.api.isVisible) {
    panel.api.close()
    return
  }
  void open()
}

