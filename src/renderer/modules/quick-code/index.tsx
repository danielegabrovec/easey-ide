// Modulo Scrittura rapida: codice JavaScript, TypeScript, Python, SQL, HTML, C, C++, C#, Java o Rust scritto al volo,
// eseguito subito, con aiuto AI a livelli e raccolta di salvataggi. Non crea né richiede un progetto.
import type { EditorContext } from '@shared/contracts/editor'
import { ASSIST_LEVEL_ORDER, QUICK_EXTENSIONS, QUICK_LANGUAGE_INFO, QUICK_LANGUAGES, type AssistLevel, type QuickLanguage } from '@shared/contracts/quick'
import { schemaComment } from '@shared/sql/completion'
import { executeCommand, registerCommand } from '../../workbench/commands'
import { on } from '../../workbench/events'
import { dockApi, registerPanel, showPanel } from '../../workbench/layout'
import { registerSettingsSection } from '../../workbench/settings-sections'
import { useWorkbench, workbench } from '../../workbench/store'
import { updateSettings } from '../../workbench/workbench-commands'
import { t } from '../../i18n'
import { newQuick, saveQuick, selectLanguage } from './actions'
import { registerQuickAssist } from './assist'
import { quickEditor } from './quick-editor'
import { flushQuickDraft, quick, useQuick } from './quick-store'
import { currentVirtualDocument, setCurrentVirtualDocument } from '../../workbench/documents'
import { QuickCollectionPanel, QuickOutputPanel, QuickPanel } from './QuickPanel'
import { connectRunEvents, runQuick, stopQuick } from './run'

export const QUICK_PANEL = 'quick'

/**
 * Apre la Scrittura rapida: anteprima e console si nascondono da sole (layout.ts), l'Esplora resta.
 * Il pulsante ⤢ nella sua barra la porta a tutta finestra e la riporta indietro.
 */
function showQuick(): void {
  showPanel({ id: QUICK_PANEL, component: 'quick', title: t('panel.quick'), area: 'center', renderer: 'always' })
}

const LEVEL_KEYS: Record<AssistLevel, 'quick.levelOff' | 'quick.levelLight' | 'quick.levelMedium' | 'quick.levelStrong'> = {
  off: 'quick.levelOff',
  light: 'quick.levelLight',
  medium: 'quick.levelMedium',
  strong: 'quick.levelStrong'
}

/** Il codice della Scrittura rapida come «documento» (contesto per l'AI): testo, selezione, cursore. */
function quickContext(): EditorContext | null {
  const editor = quickEditor()
  const model = editor?.getModel()
  if (!editor || !model) return null
  const language = quick().language
  const selection = editor.getSelection()
  const position = editor.getPosition()
  const hasSelection = !!selection && !selection.isEmpty()
  return {
    path: quickDocumentPath(language),
    language: model.getLanguageId(),
    text: model.getValue(),
    selection: hasSelection
      ? {
          text: model.getValueInRange(selection),
          range: { startLine: selection.startLineNumber, startColumn: selection.startColumn, endLine: selection.endLineNumber, endColumn: selection.endColumn }
        }
      : null,
    cursor: { line: position?.lineNumber ?? 1, column: position?.column ?? 1 },
    problems: []
  }
}

const quickDocumentPath = (language: QuickLanguage) => `scrittura-rapida.${QUICK_EXTENSIONS[language]}`

/** La Scrittura rapida è l'ultimo documento usato: la chat AI la vede come il file aperto (workbench/documents). */
function announceQuickDocument(): void {
  const language = quick().language
  setCurrentVirtualDocument({
    path: quickDocumentPath(language),
    label: `${t('quick.brand')} · ${QUICK_LANGUAGE_INFO[language].short}`,
    language,
    context: quickContext,
    editor: quickEditor
  })
}

/** Segue quale documento si usa: la Scrittura rapida o un file (l'editor). */
function trackQuickDocument(): void {
  let watching = false
  const watch = () => {
    const api = dockApi()
    if (!api || watching) return
    watching = true
    api.onDidActivePanelChange((panel) => {
      if (panel?.id === QUICK_PANEL) announceQuickDocument()
      else if (panel?.id.startsWith('editor:')) setCurrentVirtualDocument(null)
    })
    api.onDidRemovePanel((panel) => {
      if (panel.id === QUICK_PANEL && currentVirtualDocument()?.path.startsWith('scrittura-rapida.')) setCurrentVirtualDocument(null)
    })
    if (api.activePanel?.id === QUICK_PANEL) announceQuickDocument()
  }
  // La griglia nasce dopo l'attivazione dei moduli: si comincia a seguirla appena c'è un pannello.
  on('layout:ready', watch)
  useQuick.subscribe((state, previous) => {
    if (state.language !== previous.language && currentVirtualDocument()?.path.startsWith('scrittura-rapida.')) announceQuickDocument()
  })
}

/**
 * «Chiedi suggerimento» sul codice della Scrittura rapida: lo stesso dialogo dei file (ambiti e confronto
 * prima/dopo), ma il risultato va nell'editor della Scrittura rapida, annullabile con Ctrl+Z, e si esegue.
 * Ctrl+I «Genera» resta la barra veloce che scrive e inserisce subito.
 */
function suggestOnQuick(): void {
  const context = quickContext()
  if (!context) return
  const language = quick().language
  void executeCommand('ai.suggestFor', {
    context,
    // Per l'SQL lo schema del database in memoria della Scrittura rapida (come «Genera»).
    loadContext: async () => (language === 'sql' ? schemaComment(quick().schemas[workbench().settings.quick.sqlEngine], 3000) : ''),
    apply: (text: string) => {
      const current = quickEditor()
      const target = current?.getModel()
      if (!current || !target) return
      current.pushUndoStop()
      current.executeEdits('quick-ai', [{ range: target.getFullModelRange(), text }])
      current.pushUndoStop()
      current.focus()
      void runQuick(false)
    }
  })
}

function QuickSettingsSection() {
  const settings = useWorkbench((s) => s.settings.quick)
  const set = (patch: Partial<typeof settings>) => updateSettings({ quick: { ...settings, ...patch } })
  return (
    <>
      <div className="field">
        <label>{t('quick.levelTitle')}</label>
        <select value={settings.level} onChange={(e) => void set({ level: e.target.value as AssistLevel })}>
          {ASSIST_LEVEL_ORDER.map((level) => (
            <option key={level} value={level}>
              {t(LEVEL_KEYS[level])}
            </option>
          ))}
        </select>
        <span className="hint">{t('quick.levelSettingsHint')}</span>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={settings.autoRun} onChange={(e) => void set({ autoRun: e.target.checked })} />
        {t('quick.autoRunHint')}
      </label>
      <div className="field">
        <label>{t('quick.timeout')}</label>
        <input type="number" min={1} max={60} value={settings.timeoutMs / 1000} onChange={(e) => void set({ timeoutMs: Number(e.target.value) * 1000 })} />
      </div>
    </>
  )
}

export function activateQuickCode(): void {
  registerPanel('quick', QuickPanel)
  // Laboratorio (1.6): risultati e raccolta come pannelli della griglia.
  registerPanel('quick-output', QuickOutputPanel)
  registerPanel('quick-collection', QuickCollectionPanel)
  registerQuickAssist()
  connectRunEvents()
  registerSettingsSection({ id: 'quick', title: t('quick.brand'), render: QuickSettingsSection })
  on('app:closing', flushQuickDraft)
  trackQuickDocument()

  const category = t('quick.brand')
  const isOpen = () => dockApi()?.getPanel(QUICK_PANEL) !== undefined
  registerCommand({ id: 'quick.open', title: t('cmd.quickCodeOpen'), category, keybinding: 'Ctrl+Shift+Q', run: () => showQuick() })
  // Scorciatoie "di pannello": valgono solo con la Scrittura rapida attiva e lì hanno la precedenza.
  registerCommand({ id: 'quick.run', title: t('quick.run'), category, keybinding: 'Ctrl+Enter', panel: QUICK_PANEL, when: isOpen, run: () => runQuick(false) })
  registerCommand({ id: 'quick.runF5', title: t('quick.run'), palette: false, keybinding: 'F5', panel: QUICK_PANEL, run: () => runQuick(false) })
  registerCommand({ id: 'quick.stop', title: t('quick.stop'), category, when: isOpen, run: () => stopQuick() })
  registerCommand({ id: 'quick.save', title: t('quick.save'), category, keybinding: 'Ctrl+S', panel: QUICK_PANEL, when: isOpen, run: () => saveQuick(false) })
  registerCommand({ id: 'quick.saveCopy', title: t('quick.saveCopy'), category, when: isOpen, run: () => saveQuick(true) })
  registerCommand({ id: 'quick.new', title: t('quick.new'), category, when: isOpen, run: () => newQuick() })
  registerCommand({ id: 'quick.generate', title: t('quick.generate'), category, keybinding: 'Ctrl+I', panel: QUICK_PANEL, when: isOpen, run: () => quick().setPromptOpen(true) })
  registerCommand({ id: 'quick.suggest', title: t('suggest.commandQuick'), category, keybinding: 'Ctrl+Alt+I', panel: QUICK_PANEL, when: isOpen, run: () => suggestOnQuick() })
  // Esempi del Laboratorio e «di nuovo nell'editor» della Cronologia: il codice al posto di quello scritto
  // (si torna indietro con Ctrl+Z), nel linguaggio giusto; con `run` si esegue anche.
  registerCommand<{ code: string; language?: QuickLanguage; run?: boolean }>({
    id: 'quick.insertCode',
    title: 'quick.insertCode',
    palette: false,
    run: async (args) => {
      if (!args) return
      showQuick()
      if (args.language && args.language !== quick().language) await selectLanguage(args.language)
      const editor = quickEditor()
      const model = editor?.getModel()
      if (!editor || !model) return
      editor.pushUndoStop()
      editor.executeEdits('quick-example', [{ range: model.getFullModelRange(), text: args.code }])
      editor.pushUndoStop()
      editor.setPosition(model.getPositionAt(args.code.length))
      editor.focus()
      if (args.run) await runQuick(false)
    }
  })
  for (const language of QUICK_LANGUAGES) {
    registerCommand({
      id: `quick.language.${language}`,
      title: t('cmd.quickLanguage', { language: QUICK_LANGUAGE_INFO[language].title }),
      category,
      run: async () => {
        showQuick()
        await selectLanguage(language)
      }
    })
  }
  for (const level of ASSIST_LEVEL_ORDER) {
    registerCommand({
      id: `quick.level.${level}`,
      title: t('cmd.quickLevel', { level: t(LEVEL_KEYS[level]) }),
      category,
      run: () => updateSettings({ quick: { ...workbench().settings.quick, level } })
    })
  }
}
