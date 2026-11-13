// Azioni rapide dell'assistente (Spiega, Perché questo errore?, Correggi, Commenta, Test): dal tasto
// destro dell'editor, dalla palette e dai comandi «/» nella casella della chat laterale.
import type { EditorContext } from '@shared/contracts/editor'
import { buildContextPrompt, type ChatContextSnapshot } from '@shared/ai/chat-context'
import type { QuickActionKind } from '@shared/ai/slash'
import { executeCommand } from '../../workbench/commands'
import { notify } from '../../workbench/notifications'
import { sidePanel } from '../../workbench/side-panel'
import { activeModels } from '../../services/ai-client'
import { t } from '../../i18n'
import type { MessageKey } from '../../i18n/it'
import { useChat } from './chat-store'

/** Apre la chat laterale; con `focus` mette il cursore nella casella. */
export function showChat(focus = false): void {
  sidePanel().setOpen(true, focus)
}

/** Fotografia del documento attivo (testo o selezione + intervallo) per il prompt e per «Applica». */
export function snapshotOf(context: EditorContext, options: { selection?: boolean; problems?: boolean } = {}): ChatContextSnapshot {
  return {
    path: context.path,
    language: context.language,
    text: context.text,
    selection: options.selection === false ? null : context.selection,
    problems: options.problems ? context.problems.filter((p) => p.severity !== 'info') : []
  }
}

/** Intestazione del codice allegato: «Codice selezionato in x:» o «File x:». */
export function contextHeader(snapshot: ChatContextSnapshot): string {
  return snapshot.selection ? t('ai.ctxSelection', { path: snapshot.path }) : t('ai.ctxFile', { path: snapshot.path })
}

export function promptWithContext(question: string, snapshot: ChatContextSnapshot | null): string {
  return buildContextPrompt(question, snapshot, { header: snapshot ? contextHeader(snapshot) : '', problems: t('ai.ctxProblems') })
}

/** Etichetta di ogni azione (voce di menu, riga della tendina «/»). */
export const QUICK_ACTION_LABEL: Record<QuickActionKind, MessageKey> = {
  explain: 'ai.actExplain',
  error: 'ai.actError',
  fix: 'ai.actFix',
  comment: 'ai.actComment',
  tests: 'ai.actTests'
}

const PROMPTS: Record<Exclude<QuickActionKind, 'error'>, MessageKey> = {
  explain: 'ai.promptExplain',
  fix: 'ai.promptFix',
  comment: 'ai.promptComment',
  tests: 'ai.promptTests'
}

/** Esegue un'azione rapida sul documento attivo; `extra` sono istruzioni in più scritte dopo il comando «/». */
export async function quickAction(kind: QuickActionKind, extra = ''): Promise<void> {
  const context = (await executeCommand('editor.getContext')) as EditorContext | null
  if (!context) {
    notify(t('ai.noEditor'), 'error')
    return
  }
  showChat()
  if (!activeModels().chat) {
    notify(t('ai.unavailable'), 'error')
    return
  }
  const send = useChat.getState().send
  const more = extra ? `\n\n${extra}` : ''

  if (kind === 'error') {
    const problems = context.problems.filter((p) => p.severity === 'error')
    const problem = problems.sort((a, b) => Math.abs(a.line - context.cursor.line) - Math.abs(b.line - context.cursor.line))[0] ?? context.problems[0]
    if (!problem) {
      notify(t('ai.noProblem'), 'info')
      return
    }
    const snapshot = snapshotOf(context, { selection: false })
    await send(promptWithContext(t('ai.promptError', { line: problem.line, message: problem.message }) + more, snapshot), {
      display: t('ai.displayError', { line: problem.line, message: problem.message }) + (extra ? ` · ${extra}` : ''),
      context: snapshot
    })
    return
  }
  const snapshot = snapshotOf(context)
  const where = context.selection ? t('ai.selectionShort') : context.path
  await send(promptWithContext(t(PROMPTS[kind]) + more, snapshot), {
    display: `${t(QUICK_ACTION_LABEL[kind])} · ${where}${extra ? ` · ${extra}` : ''}`,
    context: snapshot
  })
}
