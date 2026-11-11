// Modulo Scrittura rapida: codice JavaScript, TypeScript, Python, SQL o HTML scritto al volo,
// eseguito subito, con aiuto AI a livelli e raccolta di salvataggi. Non crea né richiede un progetto.
import { ASSIST_LEVEL_ORDER, QUICK_LANGUAGES, type AssistLevel, type QuickLanguage } from '@shared/contracts/quick'
import { registerCommand } from '../../workbench/commands'
import { dockApi, registerPanel, showPanel } from '../../workbench/layout'
import { registerSettingsSection } from '../../workbench/settings-sections'
import { useWorkbench, workbench } from '../../workbench/store'
import { updateSettings } from '../../workbench/workbench-commands'
import { t } from '../../i18n'
import { newQuick, saveQuick, selectLanguage } from './actions'
import { registerQuickAssist } from './assist'
import { quick } from './quick-store'
import { QuickPanel } from './QuickPanel'
import { connectRunEvents, runQuick, stopQuick } from './run'

export const QUICK_PANEL = 'quick'

/** Apre la Scrittura rapida come modalità a sé: il pannello occupa tutta la finestra (si torna con ⤡ o Esc). */
function showQuick(): void {
  const panel = showPanel({ id: QUICK_PANEL, component: 'quick', title: t('panel.quick'), area: 'center', renderer: 'always' })
  if (panel && !panel.api.isMaximized()) panel.api.maximize()
}

const LANGUAGE_TITLES: Record<QuickLanguage, string> = { javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', sql: 'SQL', html: 'HTML' }
const LEVEL_KEYS: Record<AssistLevel, 'quick.levelOff' | 'quick.levelLight' | 'quick.levelMedium' | 'quick.levelStrong'> = {
  off: 'quick.levelOff',
  light: 'quick.levelLight',
  medium: 'quick.levelMedium',
  strong: 'quick.levelStrong'
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
  registerQuickAssist()
  connectRunEvents()
  registerSettingsSection({ id: 'quick', title: t('quick.brand'), render: QuickSettingsSection })

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
  for (const language of QUICK_LANGUAGES) {
    registerCommand({
      id: `quick.language.${language}`,
      title: t('cmd.quickLanguage', { language: LANGUAGE_TITLES[language] }),
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
