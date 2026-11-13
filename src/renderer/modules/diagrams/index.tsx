// Modulo Diagrammi: flowchart, ER, classi UML, mappe mentali e diagrammi liberi con connettori.
import { useState } from 'react'
import * as monaco from 'monaco-editor'
import type { EditorContext } from '@shared/contracts/editor'
import { functionNames, functionToFlowchart } from '@shared/diagrams/flow-code'
import { DIAGRAM_SUFFIX, layeredLayout, SHAPE_SIZES, serializeDiagram, type Diagram, type DiagramEdge, type DiagramNode, type DiagramType, type ShapeKind } from '@shared/diagrams/model'
import { basenameOf, extensionOf } from '@shared/paths'
import { ide } from '../../ipc'
import { executeCommand, registerCommand } from '../../workbench/commands'
import { registerPanel, showPanel } from '../../workbench/layout'
import { registerFileOpener } from '../../workbench/openers'
import { notify, notifyError } from '../../workbench/notifications'
import { workbench } from '../../workbench/store'
import { Modal, openDialog } from '../../ui/dialogs'
import { t } from '../../i18n'
import { DiagramPanel } from './DiagramPanel'

const TYPES: DiagramType[] = ['flowchart', 'er', 'uml', 'mappa', 'libero']

function node(id: string, shape: ShapeKind, text: string, x = 0, y = 0): DiagramNode {
  return { id, shape, text, x, y, ...SHAPE_SIZES[shape] }
}
function edge(source: string, target: string, label?: string, extra: Partial<DiagramEdge> = {}): DiagramEdge {
  return { id: `${source}-${target}`, source, target, label, routing: 'ortogonale', arrow: 'fine', ...extra }
}

/** Esempio di partenza per ogni tipo di diagramma. */
export function starterDiagram(type: DiagramType): Diagram {
  const diagram: Diagram = { kind: 'diagramma', version: 1, type, nodes: [], edges: [] }
  if (type === 'flowchart') {
    diagram.nodes = [
      node('inizio', 'inizio', 'Inizio'),
      node('init', 'processo', 'somma = 0\ni = 1'),
      node('cond', 'decisione', 'i ≤ 10'),
      node('corpo', 'processo', 'somma = somma + i\ni = i + 1'),
      node('scrivi', 'io', 'scrivi somma'),
      node('fine', 'inizio', 'Fine')
    ]
    diagram.edges = [edge('inizio', 'init'), edge('init', 'cond'), edge('cond', 'corpo', 'sì'), edge('corpo', 'cond', undefined, { sourceHandle: 'l', targetHandle: 'l' }), edge('cond', 'scrivi', 'no', { sourceHandle: 'r', targetHandle: 't' }), edge('scrivi', 'fine')]
    diagram.nodes = layeredLayout(diagram.nodes, diagram.edges.filter((e) => e.sourceHandle !== 'l'))
  } else if (type === 'er') {
    diagram.nodes = [node('clienti', 'tabella', 'clienti\nid INTEGER PK AI\nnome TEXT NN\nemail TEXT UQ', 0, 0), node('ordini', 'tabella', 'ordini\nid INTEGER PK AI\ncliente_id INTEGER NN FK clienti.id\ndata DATE NN\ntotale REAL', 320, 0)]
    diagram.edges = [edge('ordini', 'clienti', 'cliente_id → id')]
  } else if (type === 'uml') {
    diagram.nodes = [node('persona', 'classe', 'Persona\n---\n+ nome: string\n# eta: number\n---\n+ saluta(): string', 0, 0), node('studente', 'classe', 'Studente\n---\n+ matricola: string\n---\n+ iscriviti(corso: string): void', 0, 240)]
    diagram.edges = [edge('studente', 'persona', 'estende')]
  } else if (type === 'mappa') {
    diagram.nodes = [node('centro', 'idea', 'Imparare a programmare', 0, 120), node('a', 'idea', 'HTML e CSS', 280, 20), node('b', 'idea', 'JavaScript', 280, 120), node('c', 'idea', 'SQL', 280, 220)]
    diagram.edges = ['a', 'b', 'c'].map((id) => edge('centro', id, undefined, { routing: 'curva', arrow: 'nessuna', sourceHandle: 'r', targetHandle: 'l' }))
  }
  return diagram
}

function openDiagram(path: string): void {
  // Anteprima e console si nascondono da sole (layout.ts); l'Esplora resta visibile.
  showPanel({ id: `diagram:${path}`, component: 'diagram', title: basenameOf(path).replace(DIAGRAM_SUFFIX, ''), area: 'center', params: { path }, renderer: 'always' })
}

function NewDiagramDialog({ close }: { close: () => void }) {
  const [type, setType] = useState<DiagramType>('flowchart')
  const [name, setName] = useState('diagramma')
  const create = async () => {
    const clean = name.trim().replace(/[^\w-]+/g, '-')
    if (!clean) return
    const path = `${clean}${DIAGRAM_SUFFIX}`
    try {
      await ide.invoke('workspace:createFile', path, serializeDiagram(starterDiagram(type)))
      close()
      openDiagram(path)
    } catch (error) {
      notifyError(error)
    }
  }
  return (
    <Modal
      title={t('diagram.newTitle')}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" onClick={create} data-testid="diagram-create">
            {t('diagram.create')}
          </button>
        </>
      }
    >
      <div className="template-grid" role="radiogroup">
        {TYPES.map((value) => (
          <button key={value} role="radio" aria-checked={type === value} className={`template-card${type === value ? ' selected' : ''}`} onClick={() => setType(value)} data-diagram-type={value}>
            <span>
              <strong>{t(`diagram.type.${value}` as 'diagram.type.flowchart')}</strong>
              <span className="hint" style={{ display: 'block', marginTop: 3 }}>
                {t(`diagram.hint.${value}` as 'diagram.hint.flowchart')}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="field">
        <label>{t('diagram.name')}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} spellCheck={false} data-testid="diagram-name" />
      </div>
    </Modal>
  )
}

async function flowchartFromEditor(): Promise<void> {
  const context = (await executeCommand('editor.getContext')) as EditorContext | null
  if (!context || !['js', 'ts', 'mjs', 'mts', 'jsx', 'tsx'].includes(extensionOf(context.path))) {
    notify(t('diagram.needScript'), 'error')
    return
  }
  const names = functionNames(context.text)
  if (!names.length) {
    notify(t('diagram.noFunctions'), 'error')
    return
  }
  // La funzione sotto il cursore: l'ultima dichiarata prima della riga del cursore.
  const before = context.text.split('\n').slice(0, context.cursor.line).join('\n')
  const chosen = [...names].reverse().find((n) => new RegExp(`(function\\s+${n}\\b|\\b${n}\\s*[=(:])`).test(before)) ?? names[0]!
  try {
    const diagram = functionToFlowchart(context.text, chosen)
    const path = `${chosen}${DIAGRAM_SUFFIX}`
    await ide.invoke('workspace:writeFile', path, serializeDiagram(diagram))
    openDiagram(path)
    notify(t('diagram.fromFunctionDone', { name: chosen }), 'success')
  } catch (error) {
    notifyError(error)
  }
}

export function activateDiagrams(): void {
  registerPanel('diagram', DiagramPanel)
  const category = t('category.diagrams')
  const hasProject = () => workbench().project !== null
  registerCommand({ id: 'diagram.new', title: t('diagram.newTitle'), category, when: hasProject, run: () => openDialog((close) => <NewDiagramDialog close={close} />) })
  registerCommand<{ path: string }>({ id: 'diagram.open', title: 'diagram.open', palette: false, run: (args) => args && openDiagram(args.path) })
  registerCommand({ id: 'diagram.fromFunction', title: t('diagram.fromFunction'), category, when: hasProject, run: () => flowchartFromEditor() })
  registerFileOpener({ id: 'diagram', matches: (path) => path.endsWith(DIAGRAM_SUFFIX), command: 'diagram.open' })
  monaco.editor.addEditorAction({
    id: 'lab.diagram.fromFunction',
    label: `◇ ${t('diagram.fromFunction')}`,
    precondition: 'editorLangId == javascript || editorLangId == typescript',
    contextMenuGroupId: '1_diagram',
    run: () => void flowchartFromEditor()
  })
}
