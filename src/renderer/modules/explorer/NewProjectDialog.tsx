// Nuovo progetto da modello: scelta del modello, nome e cartella.
import { useEffect, useState } from 'react'
import { Globe, TerminalSquare } from 'lucide-react'
import type { ProjectTemplate } from '@shared/contracts/workspace'
import { ide } from '../../ipc'
import { Modal } from '../../ui/dialogs'
import { t } from '../../i18n'
import { createProject, validateName } from './project'

export function NewProjectDialog({ close, initialTemplate }: { close: () => void; initialTemplate?: string }) {
  const [templates, setTemplates] = useState<ProjectTemplate[]>([])
  const [templateId, setTemplateId] = useState(initialTemplate ?? 'web-js')
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void ide.invoke('workspace:templates').then(setTemplates)
    void ide.invoke('workspace:defaultLocation').then(setLocation)
  }, [])

  useEffect(() => {
    const template = templates.find((tpl) => tpl.id === templateId)
    if (template && !name) setName(template.mode === 'web' ? t('newProject.defaultWebName') : t('newProject.defaultConsoleName'))
  }, [templates, templateId, name])

  const nameError = validateName(name) ?? (name.includes('/') ? t('newProject.noSlash') : null)
  const canCreate = !busy && !!name.trim() && !nameError && !!location

  const create = async () => {
    if (!canCreate) return
    setBusy(true)
    const ok = await createProject(templateId, name.trim(), location)
    setBusy(false)
    if (ok) close()
  }

  return (
    <Modal
      title={t('newProject.title')}
      onClose={close}
      wide
      footer={
        <>
          <button className="btn" onClick={close}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" disabled={!canCreate} onClick={create} data-testid="create-project">
            {t('newProject.create')}
          </button>
        </>
      }
    >
      <div className="template-grid" role="radiogroup" aria-label={t('newProject.template')}>
        {templates.map((template) => (
          <button
            key={template.id}
            role="radio"
            aria-checked={template.id === templateId}
            className={`template-card${template.id === templateId ? ' selected' : ''}`}
            onClick={() => setTemplateId(template.id)}
            data-template={template.id}
          >
            <span className="template-icon">{template.mode === 'web' ? <Globe size={18} /> : <TerminalSquare size={18} />}</span>
            <span>
              <strong>{template.title}</strong>
              <span className="hint" style={{ display: 'block', marginTop: 3 }}>
                {template.description}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="field">
        <label htmlFor="project-name">{t('newProject.name')}</label>
        <input id="project-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} spellCheck={false} data-testid="project-name" />
        {nameError && <span className="error-text">{nameError}</span>}
      </div>
      <div className="field">
        <label>{t('newProject.location')}</label>
        <div className="row">
          <input value={location} onChange={(e) => setLocation(e.target.value)} spellCheck={false} data-testid="project-location" />
          <button
            className="btn"
            onClick={async () => {
              const picked = await ide.invoke('workspace:pickFolder')
              if (picked) setLocation(picked)
            }}
          >
            {t('newProject.browse')}
          </button>
        </div>
        <span className="hint">{t('newProject.willCreate', { path: `${location}\\${name.trim()}` })}</span>
      </div>
    </Modal>
  )
}
