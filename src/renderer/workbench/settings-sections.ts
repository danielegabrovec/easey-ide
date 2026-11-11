// Sezioni aggiuntive del dialogo Impostazioni, registrate dai moduli (AI, SQL Lab…).
import type { FunctionComponent } from 'react'

export interface SettingsSection {
  id: string
  title: string
  render: FunctionComponent
}

const sections: SettingsSection[] = []

export function registerSettingsSection(section: SettingsSection): void {
  const index = sections.findIndex((s) => s.id === section.id)
  if (index >= 0) sections[index] = section
  else sections.push(section)
}

export function settingsSections(): SettingsSection[] {
  return sections
}
