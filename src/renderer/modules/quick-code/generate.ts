// "Genera con AI": si descrive a parole cosa si vuole, il modello di chat scrive il codice
// (in qualunque linguaggio; SQL sullo schema del database in memoria) e lo inserisce nell'editor:
// sostituisce la selezione, o tutto se c'è solo l'esempio iniziale, altrimenti si aggiunge al cursore.
import { QUICK_LANGUAGE_INFO } from '@shared/contracts/quick'
import { schemaComment } from '@shared/sql/completion'
import { activeModels, extractCode, streamChat, type ChatStream } from '../../services/ai-client'
import { notify, notifyError } from '../../workbench/notifications'
import { workbench } from '../../workbench/store'
import { t } from '../../i18n'
import { quickEditor } from './quick-editor'
import { STARTERS, quick } from './quick-store'
import { runQuick } from './run'

let current: ChatStream | null = null

export function cancelGeneration(): void {
  current?.cancel()
  current = null
}

export async function generateWithAi(description: string): Promise<boolean> {
  const editor = quickEditor()
  const model = editor?.getModel()
  if (!editor || !model || !description.trim()) return false
  if (!activeModels().chat) {
    notify(t('ai.unavailable'), 'error')
    return false
  }
  const language = quick().language
  const name = QUICK_LANGUAGE_INFO[language].ai
  const selection = editor.getSelection()
  const selected = selection && !selection.isEmpty() ? model.getValueInRange(selection) : ''
  const text = model.getValue()
  const fresh = !text.trim() || text === STARTERS[language]

  let context = ''
  if (language === 'sql') {
    const { sqlEngine } = workbench().settings.quick
    context = `${t('quick.genSqlContext', { engine: sqlEngine === 'postgres' ? 'PostgreSQL' : 'SQLite' })}\n${schemaComment(quick().schemas[sqlEngine], 3000) || t('quick.genNoTables')}\n`
  }
  const code = selected || (fresh ? '' : text)
  const task = selected ? t('quick.genReplace') : fresh ? t('quick.genNew') : t('quick.genAppend')
  const messages = [
    { role: 'system' as const, content: t('quick.genSystem', { language: name }) },
    {
      role: 'user' as const,
      content: `${context}${code ? `${t('quick.genCurrent')}\n\`\`\`${language}\n${code.slice(0, 8000)}\n\`\`\`\n` : ''}${task}\n${t('quick.genRequest')}: ${description.trim()}`
    }
  ]

  quick().setGenerating(true)
  try {
    current = streamChat(messages, () => undefined)
    const answer = extractCode(await current.done)
    current = null
    if (!answer.trim()) {
      notify(t('quick.genEmpty'), 'error')
      return false
    }
    editor.pushUndoStop()
    if (selected && selection) {
      editor.executeEdits('quick-ai', [{ range: selection, text: answer }])
    } else if (fresh) {
      editor.executeEdits('quick-ai', [{ range: model.getFullModelRange(), text: `${answer}\n` }])
    } else {
      const position = editor.getPosition() ?? model.getFullModelRange().getEndPosition()
      const line = position.lineNumber
      const end = model.getLineMaxColumn(line)
      const lineText = model.getLineContent(line)
      editor.executeEdits('quick-ai', [{ range: { startLineNumber: line, startColumn: end, endLineNumber: line, endColumn: end }, text: `${lineText.trim() ? '\n' : ''}${answer}\n` }])
    }
    editor.pushUndoStop()
    editor.focus()
    void runQuick(false)
    return true
  } catch (error) {
    current = null
    if (!/abort/i.test(String(error))) notifyError(error)
    return false
  } finally {
    quick().setGenerating(false)
  }
}
