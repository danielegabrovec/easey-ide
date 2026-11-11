// Sezione "Assistente AI" del dialogo Impostazioni.
import { useEffect, useState } from 'react'
import { DEFAULT_ENDPOINTS, pickChatModel, pickCompletionModel, type AiProviderKind } from '@shared/contracts/ai'
import { useWorkbench } from '../../workbench/store'
import { updateSettings } from '../../workbench/workbench-commands'
import { useAi } from '../../services/ai-client'
import { t } from '../../i18n'

export function AiSettingsSection() {
  const ai = useWorkbench((s) => s.settings.ai)
  const status = useAi((s) => s.status)
  const refresh = useAi((s) => s.refresh)
  const [endpoint, setEndpoint] = useState(ai.endpoint)
  const [apiKey, setApiKey] = useState(ai.apiKey)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const set = (patch: Partial<typeof ai>) => updateSettings({ ai: { ...ai, ...patch } })
  const models = status?.models ?? []
  const fim = models.filter((m) => m.capabilities.includes('insert'))
  const chat = models.filter((m) => m.capabilities.includes('completion') && !m.capabilities.includes('embedding'))
  const autoChat = status ? pickChatModel(models, '') : null
  const autoFim = status ? pickCompletionModel(models, '') : null

  return (
    <>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={ai.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        {t('ai.settingsEnabled')}
      </label>
      <div className="field">
        <label>{t('ai.settingsProvider')}</label>
        <select
          value={ai.provider}
          data-testid="ai-provider"
          onChange={async (e) => {
            const provider = e.target.value as AiProviderKind
            const next = DEFAULT_ENDPOINTS[provider]
            setEndpoint(next)
            // Cambiando fornitore i modelli scelti non valgono più: si torna alla scelta automatica.
            await set({ provider, endpoint: next, chatModel: '', completionModel: '' })
            await refresh()
          }}
        >
          <option value="ollama">{t('ai.providerOllama')}</option>
          <option value="openai">{t('ai.providerOpenai')}</option>
        </select>
      </div>
      <div className="field">
        <label>{t('ai.settingsEndpoint')}</label>
        <div className="row">
          <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} spellCheck={false} data-testid="ai-endpoint" />
          <button
            className="btn"
            data-testid="ai-test"
            onClick={async () => {
              await set({ endpoint, apiKey })
              await refresh()
            }}
          >
            {t('ai.settingsTest')}
          </button>
        </div>
        <span className="hint">
          {status === null ? t('common.loading') : status.available ? t('ai.settingsOk', { version: status.version ?? '?', count: models.length }) : t('ai.settingsKo', { error: status.error ?? '' })}
        </span>
      </div>
      {ai.provider === 'openai' && (
        <div className="field">
          <label>{t('ai.settingsApiKey')}</label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} onBlur={() => apiKey !== ai.apiKey && set({ apiKey })} spellCheck={false} autoComplete="off" />
          <span className="hint">{t('ai.settingsApiKeyHint')}</span>
        </div>
      )}
      <div className="field">
        <label>{t('ai.settingsChatModel')}</label>
        <select value={ai.chatModel} onChange={(e) => set({ chatModel: e.target.value })}>
          <option value="">{t('ai.auto', { model: autoChat ?? '—' })}</option>
          {chat.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name} {m.size} {m.remote ? '(cloud)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>{t('ai.settingsCompletionModel')}</label>
        <select value={ai.completionModel} onChange={(e) => set({ completionModel: e.target.value })}>
          <option value="">{t('ai.auto', { model: autoFim ?? '—' })}</option>
          {fim.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name} {m.size} {m.remote ? '(cloud)' : ''}
            </option>
          ))}
        </select>
        <span className="hint">{t('ai.settingsFimHint')}</span>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={ai.inlineCompletion} onChange={(e) => set({ inlineCompletion: e.target.checked })} />
        {t('ai.settingsInline')}
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={ai.tutorMode} onChange={(e) => set({ tutorMode: e.target.checked })} />
        {t('ai.settingsTutor')}
      </label>
      <div className="field">
        <label>{t('ai.settingsTemperature', { value: ai.temperature.toFixed(1) })}</label>
        <input type="range" min={0} max={1.2} step={0.1} value={ai.temperature} onChange={(e) => set({ temperature: Number(e.target.value) })} />
      </div>
    </>
  )
}
