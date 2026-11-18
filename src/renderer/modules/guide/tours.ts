// Percorsi guidati di Easey IDE (motore comune a Easey DB: ui/Tour.tsx + src/shared/guide/tour.ts). Ogni passo
// punta a un `data-testid` (o `data-path`) già presente nei moduli — mai importati: solo selettori e comandi — e,
// dove serve, aspetta l'azione vera: un elemento che compare, un comando eseguito, un evento del workbench.
// I testi si leggono quando il percorso parte (lingua attuale).
import type { TourDefinition, TourStep } from '@shared/guide/tour'
import { t } from '../../i18n'
import type { MessageKey } from '../../i18n/it'

/** Passo con titolo e testo dalle chiavi `tour.<percorso>.<passo>.title|text`. */
function step(tour: string, id: string, rest: Omit<TourStep, 'id' | 'title' | 'text'> = {}): TourStep {
  return { id, title: t(`tour.${tour}.${id}.title` as MessageKey), text: t(`tour.${tour}.${id}.text` as MessageKey), ...rest }
}

type Rest = Omit<TourStep, 'id' | 'title' | 'text'>

function primaPagina(): TourDefinition {
  const s = (id: string, rest?: Rest) => step('page', id, rest)
  return {
    id: 'prima-pagina',
    title: t('tour.page.title'),
    description: t('tour.page.description'),
    minutes: 5,
    steps: [
      s('intro'),
      s('project', { target: '[data-testid="welcome-new-project"]', open: { command: 'workbench.welcome' }, wait: { kind: 'event', event: 'project:opened' } }),
      s('open', { target: '[data-path="index.html"]', wait: { kind: 'element', selector: '[data-editor-path="index.html"] .view-lines' } }),
      s('edit', {
        target: '[data-editor-path="index.html"]',
        dock: true,
        wait: { kind: 'event', event: 'file:saved', test: (payload) => /\.html?$/.test((payload as { path?: string } | undefined)?.path ?? '') }
      }),
      s('run', { target: '[data-testid="run-project"]', wait: { kind: 'command', command: 'run.project' } }),
      s('preview', { target: '[data-testid="preview-frame"]', open: { command: 'run.preview' }, dock: true }),
      s('done')
    ]
  }
}

function primoProgramma(): TourDefinition {
  const s = (id: string, rest?: Rest) => step('program', id, rest)
  return {
    id: 'primo-programma',
    title: t('tour.program.title'),
    description: t('tour.program.description'),
    minutes: 3,
    steps: [
      s('intro'),
      s('open', { target: '[data-testid="open-quick"]', wait: { kind: 'element', selector: '[data-testid="quick-panel"]' } }),
      s('language', { target: '[data-quick-language="python"]', open: { command: 'quick.open' } }),
      s('write', { target: '[data-testid="quick-editor"]', open: { command: 'quick.open' }, dock: true }),
      s('run', { target: '[data-testid="quick-run"]', open: { command: 'quick.open' }, wait: { kind: 'command', command: 'quick.run' } }),
      s('level', { target: '[data-testid="quick-levels"]', open: { command: 'quick.open' } }),
      s('done')
    ]
  }
}

function designer(): TourDefinition {
  const s = (id: string, rest?: Rest) => step('designer', id, rest)
  return {
    id: 'designer',
    title: t('tour.designer.title'),
    description: t('tour.designer.description'),
    minutes: 4,
    steps: [
      s('intro'),
      s('open', { target: '[data-testid="open-designer"]', wait: { kind: 'element', selector: '[data-testid="designer"]' } }),
      s('palette', { target: '[data-testid="designer-palette"]', open: { command: 'designer.open' }, dock: true }),
      s('inspector', { target: '[data-testid="designer-inspector"]', open: { command: 'designer.open' }, dock: true }),
      s('split', { target: '[data-testid="split-code"]', open: { command: 'designer.open' }, wait: { kind: 'command', command: 'view.splitCode' } }),
      s('quality', { target: '[data-testid="designer-quality"]', open: { command: 'designer.open' } }),
      s('done')
    ]
  }
}

/** «La tela libera»: disegnare, righelli e guide, allinea, livelli. */
function telaLibera(): TourDefinition {
  const s = (id: string, rest?: Rest) => step('canvas', id, rest)
  return {
    id: 'tela-libera',
    title: t('tour.canvas.title'),
    description: t('tour.canvas.description'),
    minutes: 4,
    steps: [
      s('intro'),
      s('open', { target: '[data-testid="open-designer"]', wait: { kind: 'element', selector: '[data-testid="designer"]' } }),
      s('draw', { target: '[data-testid="draw-tools"]', open: { command: 'designer.open' }, dock: true }),
      s('rulers', { target: '[data-testid="ruler-top"]', open: { command: 'designer.open' } }),
      s('arrange', { target: '[data-testid="designer-host"]', open: { command: 'designer.open' }, dock: true }),
      s('layers', { target: '[data-testid="designer-layers-tab"]', open: { command: 'designer.open' } }),
      s('done')
    ]
  }
}

/** «Lo Studio 3D»: una scena pronta, un oggetto, l'ispettore e il codice. */
function studio3d(): TourDefinition {
  const s = (id: string, rest?: Rest) => step('studio3d', id, rest)
  return {
    id: 'studio-3d',
    title: t('tour.studio3d.title'),
    description: t('tour.studio3d.description'),
    minutes: 4,
    steps: [
      s('intro'),
      s('create', { target: '[data-testid="s3-create"]', open: { command: 'studio3d.new' }, wait: { kind: 'element', selector: '[data-testid="studio3d"]' } }),
      s('add', { target: '[data-testid="s3-add"]' }),
      s('tree', { target: '[data-testid="s3-tree"]', dock: true }),
      s('inspector', { target: '[data-testid="s3-inspector"]', dock: true }),
      s('code', { target: '[data-testid="s3-show-code"]' }),
      s('done')
    ]
  }
}

/** «Il laboratorio» (1.6, come «Il laboratorio SQL» di Easey DB): la disposizione didattica, un esempio eseguito. */
function laboratorio(): TourDefinition {
  const s = (id: string, rest?: Rest) => step('lab', id, rest)
  return {
    id: 'laboratorio',
    title: t('tour.lab.title'),
    description: t('tour.lab.description'),
    minutes: 3,
    steps: [
      s('intro'),
      s('toggle', { target: '[data-testid="lab-toggle"]', wait: { kind: 'element', selector: '[data-testid="lab-strip"]' } }),
      s('example', { target: '[data-testid="lab-strip"] .lab-chip-run', open: { command: 'layout.lab' }, wait: { kind: 'command', command: 'quick.insertCode' } }),
      s('output', { target: '[data-testid="quick-output-panel"]', open: { command: 'layout.lab' }, dock: true }),
      s('history', { target: '[data-testid="lab-history"]', open: { command: 'layout.lab' }, dock: true }),
      s('assistant', { target: '[data-testid="ai-docked"]', open: { command: 'layout.lab' }, dock: true }),
      s('manual', { target: '[data-testid="lab-manual"]', open: { command: 'layout.lab' } }),
      s('done')
    ]
  }
}

export function allTours(): TourDefinition[] {
  return [primaPagina(), primoProgramma(), laboratorio(), designer(), telaLibera(), studio3d()]
}

export function tourById(id: string): TourDefinition | undefined {
  return allTours().find((tour) => tour.id === id)
}
