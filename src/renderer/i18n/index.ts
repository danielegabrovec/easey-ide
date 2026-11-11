// Traduzioni: t('chiave', { parametro }) con segnaposto {parametro}.
import type { Language } from '@shared/contracts/settings'
import { en } from './en'
import { it, type MessageKey } from './it'

const dictionaries: Record<Language, Record<MessageKey, string>> = { it, en }
let current: Record<MessageKey, string> = it

export function setLanguage(language: Language): void {
  current = dictionaries[language] ?? it
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const template = current[key] ?? it[key] ?? key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}
