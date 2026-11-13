// Modulo Assistente AI (Ollama locale): chat, azioni rapide sul codice, autocompletamento inline.
import * as monaco from 'monaco-editor'
import type { EditorContext } from '@shared/contracts/editor'
import { executeCommand, registerCommand } from '../../workbench/commands'
import { registerPanel, showPanel } from '../../workbench/layout'
import { notify } from '../../workbench/notifications'
import { registerSettingsSection } from '../../workbench/settings-sections'
import { useWorkbench, workbench } from '../../workbench/store'
import { activeModels, useAi } from '../../services/ai-client'
import { t } from '../../i18n'
import { AiChatPanel } from './AiChatPanel'
import { AiSettingsSection } from './AiSettingsSection'
import { useChat, type ApplyTarget } from './chat-store'
import { registerInlineCompletion } from './inline-completion'
import { openDialog } from '../../ui/dialogs'
import { SuggestDialog, type SuggestRequest } from './SuggestDialog'

type QuickAction = 'explain' | 'error' | 'fix' | 'comment' | 'tests'

function showChat(): void {
  showPanel({ id: 'ai-chat', component: 'ai-chat', title: t('panel.ai'), area: 'right' })
}

function wholeFileRange(text: string) {
  const lines = text.split('\n')
  return { startLine: 1, startColumn: 1, endLine: lines.length, endColumn: lines[lines.length - 1]!.length + 1 }
}

async function quickAction(kind: QuickAction): Promise<void> {
  const context = (await executeCommand('editor.getContext')) as EditorContext | null
  if (!context) {
    notify(t('ai.noEditor'), 'error')
    return
  }
  if (!activeModels().chat) {
    showChat()
    notify(t('ai.unavailable'), 'error')
    return
  }
  showChat()
  const code = context.selection?.text ?? context.text
  const where = context.selection ? t('ai.ctxSelection', { path: context.path }) : t('ai.ctxFile', { path: context.path })
  const block = `${where}\n\`\`\`${context.language}\n${code.slice(0, 12000)}\n\`\`\``
  const apply: ApplyTarget = { path: context.path, range: context.selection?.range ?? wholeFileRange(context.text), original: code, language: context.language }
  const send = useChat.getState().send

  if (kind === 'error') {
    const problems = context.problems.filter((p) => p.severity === 'error')
    const problem = problems.sort((a, b) => Math.abs(a.line - context.cursor.line) - Math.abs(b.line - context.cursor.line))[0] ?? context.problems[0]
    if (!problem) {
      notify(t('ai.noProblem'), 'info')
      return
    }
    const fileBlock = `${t('ai.ctxFile', { path: context.path })}\n\`\`\`${context.language}\n${context.text.slice(0, 12000)}\n\`\`\``
    await send(t('ai.promptError', { line: problem.line, message: problem.message }) + `\n\n${fileBlock}`, {
      display: t('ai.displayError', { line: problem.line, message: problem.message })
    })
    return
  }
  const prompts: Record<Exclude<QuickAction, 'error'>, { prompt: string; display: string; apply?: boolean }> = {
    explain: { prompt: t('ai.promptExplain'), display: t('ai.actExplain') },
    fix: { prompt: t('ai.promptFix'), display: t('ai.actFix'), apply: true },
    comment: { prompt: t('ai.promptComment'), display: t('ai.actComment'), apply: true },
    tests: { prompt: t('ai.promptTests'), display: t('ai.actTests') }
  }
  const chosen = prompts[kind]
  await send(`${chosen.prompt}\n\n${block}`, { display: `${chosen.display} · ${context.selection ? t('ai.selectionShort') : context.path}`, apply: chosen.apply ? apply : undefined })
}

function updateStatusItem(): void {
  const { status } = useAi.getState()
  const ai = workbench().settings.ai
  if (!ai.enabled) {
    workbench().removeStatusItem('ai')
    return
  }
  if (!status) return
  const models = activeModels()
  if (!status.available) {
    workbench().setStatusItem({ id: 'ai', text: `✦ ${t('ai.statusOff')}`, title: status.error, command: 'ai.chat', tone: 'warning' })
    return
  }
  const label = models.completion ?? models.chat ?? t('ai.statusNoModel')
  workbench().setStatusItem({ id: 'ai', text: `✦ ${label}`, title: t('ai.statusTitle', { chat: models.chat ?? '—', completion: models.completion ?? '—' }), command: 'ai.chat' })
}

export function activateAiAssist(): void {
  registerPanel('ai-chat', AiChatPanel)
  registerSettingsSection({ id: 'ai', title: t('ai.settingsTitle'), render: AiSettingsSection })
  registerInlineCompletion()

  const category = t('category.ai')
  const hasEditor = () => workbench().activeFile !== null
  registerCommand({ id: 'ai.chat', title: t('cmd.aiChat'), category, keybinding: 'Ctrl+Shift+A', run: () => showChat() })
  registerCommand({
    id: 'ai.suggest',
    title: t('suggest.command'),
    category,
    keybinding: 'Ctrl+Alt+I',
    when: hasEditor,
    run: async () => {
      const context = (await executeCommand('editor.getContext')) as EditorContext | null
      if (!context) {
        notify(t('ai.noEditor'), 'error')
        return
      }
      openDialog((close) => <SuggestDialog context={context} close={close} />)
    }
  })
  // Lo stesso dialogo per editor che non sono file del progetto (Scrittura rapida): contesto e applicazione dal chiamante.
  registerCommand<SuggestRequest>({
    id: 'ai.suggestFor',
    title: 'ai.suggestFor',
    palette: false,
    run: (args) => {
      if (args) openDialog((close) => <SuggestDialog {...args} close={close} />)
    }
  })
  registerCommand({ id: 'ai.explain', title: t('ai.actExplain'), category, when: hasEditor, run: () => quickAction('explain') })
  registerCommand({ id: 'ai.explainError', title: t('ai.actError'), category, when: hasEditor, run: () => quickAction('error') })
  registerCommand({ id: 'ai.fix', title: t('ai.actFix'), category, when: hasEditor, run: () => quickAction('fix') })
  registerCommand({ id: 'ai.comment', title: t('ai.actComment'), category, when: hasEditor, run: () => quickAction('comment') })
  registerCommand({ id: 'ai.tests', title: t('ai.actTests'), category, when: hasEditor, run: () => quickAction('tests') })
  registerCommand({
    id: 'ai.toggleInline',
    title: t('cmd.aiToggleInline'),
    category,
    run: async () => {
      const ai = workbench().settings.ai
      await executeCommand('workbench.updateSettings', { ai: { ...ai, inlineCompletion: !ai.inlineCompletion } })
      notify(!ai.inlineCompletion ? t('ai.inlineOn') : t('ai.inlineOff'))
    }
  })
  // Per gli altri moduli (SQL Lab, didattica…): apre l'assistente e invia una domanda.
  registerCommand<{ prompt: string; display?: string }>({
    id: 'ai.ask',
    title: 'ai.ask',
    palette: false,
    run: async (args) => {
      if (!args) return
      showChat()
      if (!activeModels().chat) {
        notify(t('ai.unavailable'), 'error')
        return
      }
      await useChat.getState().send(args.prompt, { display: args.display })
    }
  })
  registerCommand({ id: 'ai.refresh', title: t('ai.refresh'), category, run: () => useAi.getState().refresh() })

  // Voci nel menu del tasto destro dell'editor.
  const actions: [string, string, string][] = [
    ['lab.ai.suggest', t('suggest.command'), 'ai.suggest'],
    ['lab.ai.explain', t('ai.actExplain'), 'ai.explain'],
    ['lab.ai.error', t('ai.actError'), 'ai.explainError'],
    ['lab.ai.fix', t('ai.actFix'), 'ai.fix'],
    ['lab.ai.comment', t('ai.actComment'), 'ai.comment'],
    ['lab.ai.tests', t('ai.actTests'), 'ai.tests']
  ]
  // Nell'editor della Scrittura rapida (modelli "quick:") il suggerimento lavora su quel codice, non sul file attivo.
  const commandFor = (command: string, editor: monaco.editor.ICodeEditor) =>
    command === 'ai.suggest' && editor.getModel()?.uri.scheme === 'quick' ? 'quick.suggest' : command
  actions.forEach(([id, label, command], index) =>
    monaco.editor.addEditorAction({
      id,
      label: `✦ ${label}`,
      contextMenuGroupId: '0_ai',
      contextMenuOrder: index,
      run: (editor) => void executeCommand(commandFor(command, editor))
    })
  )

  useAi.subscribe(updateStatusItem)
  let lastAi = workbench().settings.ai
  useWorkbench.subscribe((state) => {
    if (state.settings.ai === lastAi) return
    const endpointChanged = state.settings.ai.endpoint !== lastAi.endpoint
    lastAi = state.settings.ai
    if (endpointChanged) void useAi.getState().refresh()
    else updateStatusItem()
  })
  void useAi.getState().refresh()
  // Se Ollama parte dopo l'IDE, lo si scopre da soli.
  setInterval(() => {
    const status = useAi.getState().status
    if (workbench().settings.ai.enabled && status && !status.available) void useAi.getState().refresh()
  }, 30_000)
}
