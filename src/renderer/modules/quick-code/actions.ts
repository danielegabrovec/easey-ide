// Azioni della Scrittura rapida sulla raccolta e sul documento: nuovo, apri, salva (anche copia),
// rinomina, elimina, esporta, cambio di linguaggio. Le usano comandi, pulsanti e scorciatoie.
import { QUICK_EXTENSIONS, type QuickLanguage } from '@shared/contracts/quick'
import { ide } from '../../ipc'
import { confirm, prompt } from '../../ui/dialogs'
import { notify, notifyError } from '../../workbench/notifications'
import { t } from '../../i18n'
import { quickEditor, replaceAll, switchLanguage } from './quick-editor'
import { blankDoc, isDirty, quick, type QuickDoc } from './quick-store'
import { workbench } from '../../workbench/store'
import { cancelAutoRun, loadSqlSchema, runQuick } from './run'

const LANGUAGE_LABELS: Record<QuickLanguage, string> = { javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', sql: 'SQL', html: 'HTML' }

function currentDoc(): { language: QuickLanguage; doc: QuickDoc } {
  const { language, docs } = quick()
  const content = quickEditor()?.getValue() ?? docs[language].content
  return { language, doc: { ...docs[language], content } }
}

/** Titolo proposto: il primo commento del codice, altrimenti linguaggio + data e ora. */
export function suggestTitle(content: string, language: QuickLanguage, now = new Date()): string {
  const comment = /^\s*(?:\/\/|--|\/\*+|#|<!--)\s*(.+?)\s*(?:\*\/|-->)?\s*$/m.exec(content)?.[1]
  const cleaned = comment
    ?.replace(/^Scrittura rapida\s*·\s*\w+\s*[—-]\s*/i, '')
    .replace(/[.:;]+$/, '')
    .slice(0, 48)
    .trim()
  if (cleaned && cleaned.length >= 3) return cleaned
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${LANGUAGE_LABELS[language]} ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}.${pad(now.getMinutes())}`
}

async function confirmDiscard(): Promise<boolean> {
  const { language, doc } = currentDoc()
  if (!isDirty(doc, language)) return true
  return confirm({ title: t('quick.discardTitle'), message: t('quick.discardMessage'), confirmLabel: t('quick.discardConfirm'), danger: true })
}

export async function selectLanguage(language: QuickLanguage): Promise<void> {
  if (quick().language === language) return
  cancelAutoRun()
  switchLanguage(language, quick().docs[language].content)
  quick().setLanguage(language)
  if (language === 'sql') await loadSqlSchema()
  if (language === 'python') void ide.invoke('quick:prepare', 'python')
  quickEditor()?.focus()
  // Si vede subito che cosa fa il codice di questo linguaggio (la pagina HTML, i risultati…).
  if (workbench().settings.quick.autoRun) void runQuick(true)
}

export async function saveQuick(asCopy = false): Promise<boolean> {
  const { language, doc } = currentDoc()
  let title = doc.title.trim()
  if (!doc.snippetId || asCopy || !title) {
    const chosen = await prompt({
      title: asCopy ? t('quick.saveCopyTitle') : t('quick.saveTitle'),
      label: t('quick.saveLabel', { ext: QUICK_EXTENSIONS[language] }),
      value: asCopy ? `${title || suggestTitle(doc.content, language)} (copia)` : title || suggestTitle(doc.content, language),
      okLabel: t('quick.save')
    })
    if (!chosen) return false
    title = chosen
  }
  try {
    const info = await ide.invoke('quick:save', { id: asCopy ? null : doc.snippetId, title, language, content: doc.content })
    quick().setDoc(language, { snippetId: info.id, title: info.title, saved: doc.content, content: doc.content })
    await quick().refreshSnippets()
    notify(t('quick.saved', { name: info.id }), 'success')
    return true
  } catch (error) {
    notifyError(error)
    return false
  }
}

/** Cambia il titolo: un salvataggio già nella raccolta viene rinominato (con il testo attuale). */
export async function renameQuick(title: string): Promise<void> {
  const { language, doc } = currentDoc()
  const clean = title.trim()
  if (clean === doc.title) return
  if (!doc.snippetId || !clean) {
    quick().setDoc(language, { ...doc, title: clean })
    return
  }
  try {
    const info = await ide.invoke('quick:save', { id: doc.snippetId, title: clean, language, content: doc.content })
    quick().setDoc(language, { snippetId: info.id, title: info.title, saved: doc.content, content: doc.content })
    await quick().refreshSnippets()
  } catch (error) {
    notifyError(error)
  }
}

export async function newQuick(): Promise<void> {
  if (!(await confirmDiscard())) return
  const { language } = quick()
  quick().setDoc(language, blankDoc(language))
  replaceAll('')
  quickEditor()?.focus()
}

export async function openSnippet(id: string): Promise<void> {
  const current = currentDoc()
  if (current.doc.snippetId === id) return
  if (!(await confirmDiscard())) return
  try {
    const snippet = await ide.invoke('quick:read', id)
    cancelAutoRun()
    const doc: QuickDoc = { snippetId: snippet.id, title: snippet.title, saved: snippet.content, content: snippet.content }
    quick().setDoc(snippet.language, doc)
    if (snippet.language !== quick().language) {
      switchLanguage(snippet.language, snippet.content)
      quick().setLanguage(snippet.language)
      if (snippet.language === 'sql') await loadSqlSchema()
    } else replaceAll(snippet.content)
    quickEditor()?.focus()
  } catch (error) {
    notifyError(error)
    await quick().refreshSnippets()
  }
}

export async function deleteSnippet(id: string): Promise<void> {
  const ok = await confirm({ title: t('quick.deleteTitle'), message: t('quick.deleteMessage', { name: id }), confirmLabel: t('quick.deleteConfirm'), danger: true })
  if (!ok) return
  try {
    await ide.invoke('quick:delete', id)
    for (const [language, doc] of Object.entries(quick().docs) as [QuickLanguage, QuickDoc][]) {
      if (doc.snippetId === id) quick().setDoc(language, { ...doc, snippetId: null, saved: '' })
    }
    await quick().refreshSnippets()
  } catch (error) {
    notifyError(error)
  }
}

export async function exportQuick(): Promise<void> {
  const { language, doc } = currentDoc()
  const name = `${(doc.title || suggestTitle(doc.content, language)).replace(/[<>:"/\\|?*]+/g, '-')}.${QUICK_EXTENSIONS[language]}`
  try {
    const path = await ide.invoke('app:saveFile', name, doc.content)
    if (path) notify(t('quick.exported', { path }), 'success')
  } catch (error) {
    notifyError(error)
  }
}

export async function copyQuick(): Promise<void> {
  try {
    await navigator.clipboard.writeText(currentDoc().doc.content)
    notify(t('quick.copied'), 'success')
  } catch (error) {
    notifyError(error)
  }
}
