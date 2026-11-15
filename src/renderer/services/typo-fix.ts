// Parole sbagliate nell'editor (1.6, come «Volevi dire EXISTS?» di Easey DB): avviso sulla parola («Forse volevi
// scrivere print?») e correzione rapida con Ctrl+. o la lampadina. Vale per i file dei progetti e per la Scrittura
// rapida (tutti i modelli di Monaco nei linguaggi di TYPO_LANGUAGES). Le regole sono in @shared/editor/typos.
import * as monaco from 'monaco-editor'
import { findTypos, TYPO_LANGUAGES } from '@shared/editor/typos'
import { t } from '../i18n'

const OWNER = 'easey-typos'
const DELAY_MS = 500

function check(model: monaco.editor.ITextModel): void {
  if (model.isDisposed()) return
  const typos = TYPO_LANGUAGES.includes(model.getLanguageId()) ? findTypos(model.getValue(), model.getLanguageId()) : []
  monaco.editor.setModelMarkers(
    model,
    OWNER,
    typos.map((typo) => {
      const start = model.getPositionAt(typo.start)
      const end = model.getPositionAt(typo.end)
      return {
        severity: monaco.MarkerSeverity.Warning,
        message: t('typo.didYouMean', { word: typo.suggestion }),
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
        source: t('typo.source'),
        // La parola giusta viaggia con l'avviso: la correzione rapida la legge da qui.
        code: typo.suggestion
      }
    })
  )
}

function watch(model: monaco.editor.ITextModel): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => check(model), DELAY_MS)
  }
  const changes = model.onDidChangeContent(schedule)
  const language = model.onDidChangeLanguage(() => check(model))
  model.onWillDispose(() => {
    if (timer) clearTimeout(timer)
    changes.dispose()
    language.dispose()
  })
  check(model)
}

let installed = false

export function installTypoFix(): void {
  if (installed) return
  installed = true
  monaco.editor.getModels().forEach(watch)
  monaco.editor.onDidCreateModel(watch)
  monaco.languages.registerCodeActionProvider(TYPO_LANGUAGES, {
    provideCodeActions(model, _range, context) {
      const actions: monaco.languages.CodeAction[] = context.markers
        .filter((marker) => marker.source === t('typo.source') && typeof marker.code === 'string')
        .map((marker) => {
          const word = marker.code as string
          return {
            title: t('typo.fix', { word }),
            kind: 'quickfix',
            diagnostics: [marker],
            isPreferred: true,
            edit: { edits: [{ resource: model.uri, versionId: model.getVersionId(), textEdit: { range: marker, text: word } }] }
          }
        })
      return { actions, dispose: () => undefined }
    }
  })
}
