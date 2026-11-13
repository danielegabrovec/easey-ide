// Modulo Programmazione visuale: programmi a blocchi (Blockly) e a nodi con connettori, che generano JavaScript.
import { basenameOf } from '@shared/paths'
import { isVisualFile, serializeProgram, VISUAL_SUFFIX, type BlocksProgram, type NodesProgram, type VisualKind } from '@shared/visual/program'
import { ide } from '../../ipc'
import { registerCommand } from '../../workbench/commands'
import { registerPanel, showPanel } from '../../workbench/layout'
import { registerFileOpener } from '../../workbench/openers'
import { notifyError } from '../../workbench/notifications'
import { workbench } from '../../workbench/store'
import { prompt } from '../../ui/dialogs'
import { t } from '../../i18n'
import { BlocksPanel } from './BlocksPanel'
import { NodesPanel } from './NodesPanel'
import { htmlPages, linkToPage, loadSymbols } from './project-files'

function openVisual(path: string): void {
  const kind = isVisualFile(path)
  if (!kind) return
  // Anteprima e console si nascondono da sole (layout.ts); l'Esplora resta visibile.
  showPanel({ id: `visual:${path}`, component: kind === 'blocchi' ? 'visual-blocks' : 'visual-nodes', title: basenameOf(path).replace(VISUAL_SUFFIX[kind], ''), area: 'center', params: { path }, renderer: 'always' })
}

/** Programma iniziale: se la pagina ha un pulsante e un titolo, un esempio già funzionante. */
async function starter(kind: VisualKind): Promise<string> {
  const { ids } = await loadSymbols()
  const button = ids.find((id) => /puls|button|btn|incrementa/i.test(id))
  const title = ids.find((id) => /titolo|title|valore|messaggio/i.test(id))
  if (kind === 'blocchi') {
    const program: BlocksProgram = { kind: 'blocchi', version: 1, target: 'pagina', highlight: true, workspace: {} }
    if (button && title) {
      program.workspace = {
        blocks: {
          languageVersion: 0,
          blocks: [
            {
              type: 'lab_on_event',
              x: 40,
              y: 40,
              fields: { EVENT: 'click', EL: `#${button}` },
              inputs: { DO: { block: { type: 'lab_set_text', fields: { EL: `#${title}` }, inputs: { VALUE: { shadow: { type: 'text', fields: { TEXT: 'Ciao dai blocchi!' } } } } } } }
            }
          ]
        }
      }
    }
    return serializeProgram(program)
  }
  const program: NodesProgram = { kind: 'nodi', version: 1, target: 'pagina', highlight: true, nodes: [], edges: [] }
  if (button && title) {
    program.nodes = [
      { id: 'quando', type: 'evento', x: 40, y: 60, data: { elemento: button, evento: 'click' } },
      { id: 'scrivi', type: 'testo', x: 360, y: 60, data: { elemento: title, valore: 'Ciao dai nodi!' } }
    ]
    program.edges = [{ id: 'quando:poi->scrivi:in', source: 'quando', sourceHandle: 'poi', target: 'scrivi', targetHandle: 'in' }]
  }
  return serializeProgram(program)
}

async function createProgram(kind: VisualKind): Promise<void> {
  const name = await prompt({ title: kind === 'blocchi' ? t('visual.newBlocks') : t('visual.newNodes'), label: t('visual.programName'), value: kind === 'blocchi' ? 'programma' : 'logica', validate: (v) => (/^[\w-]+$/.test(v.trim()) ? null : t('visual.invalidName')) })
  if (!name) return
  const path = `${name.trim()}${VISUAL_SUFFIX[kind]}`
  try {
    await ide.invoke('workspace:createFile', path, await starter(kind))
    const page = workbench().project?.config.run.mode === 'web' ? workbench().project!.config.run.entry : htmlPages()[0]
    if (page) await linkToPage(path, page)
    openVisual(path)
  } catch (error) {
    notifyError(error)
  }
}

export function activateVisualCode(): void {
  registerPanel('visual-blocks', BlocksPanel)
  registerPanel('visual-nodes', NodesPanel)
  const category = t('category.visual')
  const hasProject = () => workbench().project !== null
  registerCommand({ id: 'visual.newBlocks', title: t('visual.newBlocks'), category, when: hasProject, run: () => createProgram('blocchi') })
  registerCommand({ id: 'visual.newNodes', title: t('visual.newNodes'), category, when: hasProject, run: () => createProgram('nodi') })
  registerCommand<{ path: string }>({ id: 'visual.open', title: 'visual.open', palette: false, run: (args) => args && openVisual(args.path) })
  registerFileOpener({ id: 'visual', matches: (path) => isVisualFile(path) !== null, command: 'visual.open' })
}
