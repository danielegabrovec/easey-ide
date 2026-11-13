// Comandi del guscio: palette, tema, zoom, disposizione, impostazioni, informazioni.
import { useId, useState } from 'react'
import type { Settings, ShellOption } from '@shared/contracts'
import { ide } from '../ipc'
import { Modal, openDialog } from '../ui/dialogs'
import { Markdown } from '../ui/Markdown'
import logo from '../assets/logo.svg'
import { t } from '../i18n'
import { listCommands, registerCommand } from './commands'
import { buildDefaultLayout, togglePanels, toggleSidebar } from './layout'
import { settingsSections } from './settings-sections'
import { notifyError } from './notifications'
import { useWorkbench, workbench } from './store'

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  try {
    workbench().setSettings(await ide.invoke('settings:update', patch))
  } catch (error) {
    notifyError(error)
  }
}

function SettingsDialog({ close, shells }: { close: () => void; shells: ShellOption[] }) {
  const settings = useWorkbench((s) => s.settings)
  const [fontSize, setFontSize] = useState(String(settings.fontSize))
  const id = useId()
  return (
    <Modal
      title={t('settings.title')}
      onClose={close}
      footer={
        <button className="btn primary" onClick={close}>
          {t('common.close')}
        </button>
      }
    >
      <div className="field">
        <label htmlFor={`${id}-theme`}>{t('settings.theme')}</label>
        <select id={`${id}-theme`} value={settings.theme} onChange={(e) => updateSettings({ theme: e.target.value as Settings['theme'] })}>
          <option value="dark">{t('settings.themeDark')}</option>
          <option value="light">{t('settings.themeLight')}</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${id}-language`}>{t('settings.language')}</label>
        <select id={`${id}-language`} aria-describedby={`${id}-language-hint`} value={settings.language} onChange={(e) => updateSettings({ language: e.target.value as Settings['language'] })}>
          <option value="it">Italiano</option>
          <option value="en">English</option>
        </select>
        <span className="hint" id={`${id}-language-hint`}>{t('settings.languageHint')}</span>
      </div>
      <div className="field">
        <label htmlFor={`${id}-font`}>{t('settings.fontSize')}</label>
        <input
          id={`${id}-font`}
          type="number"
          min={10}
          max={32}
          value={fontSize}
          onChange={(e) => setFontSize(e.target.value)}
          onBlur={() => updateSettings({ fontSize: Number(fontSize) })}
          onKeyDown={(e) => e.key === 'Enter' && updateSettings({ fontSize: Number(fontSize) })}
        />
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={settings.autoSave} onChange={(e) => updateSettings({ autoSave: e.target.checked })} />
        {t('settings.autoSave')}
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={settings.autoRun} onChange={(e) => updateSettings({ autoRun: e.target.checked })} />
        {t('settings.autoRun')}
      </label>
      <div className="field">
        <label htmlFor={`${id}-shell`}>{t('settings.shell')}</label>
        <select id={`${id}-shell`} value={settings.defaultShell} onChange={(e) => updateSettings({ defaultShell: e.target.value })}>
          {shells.map((shell) => (
            <option key={shell.id} value={shell.id}>
              {shell.label}
            </option>
          ))}
        </select>
      </div>
      {settingsSections().map((section) => (
        <section key={section.id} className="settings-section" data-settings-section={section.id}>
          <h3>{section.title}</h3>
          <section.render />
        </section>
      ))}
    </Modal>
  )
}

function ShortcutsDialog({ close }: { close: () => void }) {
  const [query, setQuery] = useState('')
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const commands = listCommands()
    .filter((c) => c.keybinding)
    .filter((c) => words.every((w) => `${c.category ?? ''} ${c.title} ${c.keybinding}`.toLowerCase().includes(w)))
    .sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '', 'it') || a.title.localeCompare(b.title, 'it'))
  return (
    <Modal title={t('shortcuts.title')} onClose={close} footer={<button className="btn primary" onClick={close}>{t('common.close')}</button>}>
      <input
        className="shortcuts-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('shortcuts.search')}
        aria-label={t('shortcuts.search')}
        data-testid="shortcuts-search"
      />
      <table className="shortcuts-table">
        <tbody>
          {commands.map((c) => (
            <tr key={c.id} data-shortcut={c.id}>
              <td className="hint">{c.category}</td>
              <td>{c.title}</td>
              <td style={{ textAlign: 'right' }}>
                <kbd>{c.keybinding}</kbd>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {commands.length === 0 && <p className="hint">{t('shortcuts.none')}</p>}
    </Modal>
  )
}

export function registerWorkbenchCommands(): void {
  const category = t('category.view')
  registerCommand({
    id: 'workbench.commandPalette',
    title: t('cmd.palette'),
    category,
    keybinding: 'Ctrl+Shift+P',
    palette: false,
    run: () => workbench().setPaletteOpen(!(workbench().paletteOpen && workbench().paletteMode === 'commands'), 'commands')
  })
  registerCommand({
    id: 'workbench.quickOpen',
    title: t('cmd.quickOpen'),
    category: t('category.file'),
    keybinding: 'Ctrl+P',
    when: () => workbench().project !== null,
    run: () => workbench().setPaletteOpen(!(workbench().paletteOpen && workbench().paletteMode === 'files'), 'files')
  })
  registerCommand({
    id: 'workbench.toggleTheme',
    title: t('cmd.toggleTheme'),
    category,
    run: () => updateSettings({ theme: workbench().settings.theme === 'dark' ? 'light' : 'dark' })
  })
  registerCommand({ id: 'workbench.zoomIn', title: t('cmd.zoomIn'), category, keybinding: 'Ctrl+=', run: () => updateSettings({ fontSize: workbench().settings.fontSize + 1 }) })
  registerCommand({ id: 'workbench.zoomOut', title: t('cmd.zoomOut'), category, keybinding: 'Ctrl+-', run: () => updateSettings({ fontSize: workbench().settings.fontSize - 1 }) })
  registerCommand<Partial<Settings>>({ id: 'workbench.updateSettings', title: 'workbench.updateSettings', palette: false, run: (patch) => patch && updateSettings(patch) })
  registerCommand<{ url: string }>({ id: 'app.openUrl', title: 'app.openUrl', palette: false, run: (args) => args && ide.invoke('app:openExternal', args.url) })
  registerCommand({ id: 'workbench.resetLayout', title: t('cmd.resetLayout'), category, run: () => buildDefaultLayout() })
  // Come in VS Code: Ctrl+B mostra/nasconde la barra laterale (Esplora), Ctrl+J i pannelli (anteprima e console).
  registerCommand({ id: 'workbench.toggleSidebar', title: t('cmd.toggleSidebar'), category, keybinding: 'Ctrl+B', run: () => toggleSidebar() })
  registerCommand({ id: 'workbench.togglePanels', title: t('cmd.togglePanels'), category, keybinding: 'Ctrl+J', run: () => togglePanels() })
  registerCommand({
    id: 'workbench.settings',
    title: t('cmd.settings'),
    category: t('category.preferences'),
    keybinding: 'Ctrl+,',
    run: async () => {
      const capabilities = await ide.invoke('terminal:capabilities')
      openDialog((close) => <SettingsDialog close={close} shells={capabilities.shells} />)
    }
  })
  registerCommand({
    id: 'workbench.shortcuts',
    title: t('cmd.shortcuts'),
    category: t('category.help'),
    run: () => openDialog((close) => <ShortcutsDialog close={close} />)
  })
  registerCommand({
    id: 'workbench.about',
    title: t('cmd.about'),
    category: t('category.help'),
    run: async () => {
      const info = await ide.invoke('app:info')
      const capabilities = await ide.invoke('terminal:capabilities')
      const showLegal = async (doc: 'licenza' | 'note' | 'terze-parti', title: string) => {
        try {
          const text = await ide.invoke('app:legal', doc)
          openDialog((closeLegal) => (
            <Modal title={title} onClose={closeLegal} wide footer={<button className="btn primary" onClick={closeLegal}>{t('common.close')}</button>}>
              <div className="legal-text" data-testid="legal-text">
                {doc === 'licenza' ? <pre>{text}</pre> : <Markdown source={text} renderCode={({ code }) => <pre>{code}</pre>} />}
              </div>
            </Modal>
          ))
        } catch (error) {
          notifyError(error)
        }
      }
      openDialog((close) => (
        <Modal title={info.name} onClose={close} footer={<button className="btn primary" onClick={close}>{t('common.close')}</button>}>
          <div className="about-head">
            <img src={logo} alt="" width={56} height={56} />
            <div>
              <div className="about-name">{info.name}</div>
              <div>{t('about.text')}</div>
            </div>
          </div>
          <p data-testid="about-author">
            {t('about.author')}
            <br />
            {t('about.copyright')}
          </p>
          <div className="about-links">
            <button className="btn" onClick={() => showLegal('licenza', t('about.license'))} data-testid="about-license">
              {t('about.license')}
            </button>
            <button className="btn" onClick={() => showLegal('note', t('about.legal'))} data-testid="about-legal">
              {t('about.legal')}
            </button>
            <button className="btn" onClick={() => showLegal('terze-parti', t('about.thirdParty'))} data-testid="about-third">
              {t('about.thirdParty')}
            </button>
            <button className="btn ghost" onClick={() => ide.invoke('app:openExternal', 'https://github.com/danielegabrovec/easey-ide')}>
              {t('about.repo')}
            </button>
          </div>
          <div className="hint">
            {t('about.version', { version: info.version })} · Electron {info.electron} · Node {info.node} · {capabilities.pty ? t('about.ptyOn') : t('about.ptyOff')} · {t('about.node', { version: capabilities.node.version, source: capabilities.node.source === 'system' ? t('about.nodeSystem') : t('about.nodeBundled') })}
          </div>
        </Modal>
      ))
    }
  })
}
