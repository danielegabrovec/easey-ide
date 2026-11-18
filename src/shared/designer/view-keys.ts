// Chiavi degli elementi nello stato che vale solo nell'editor (occhio e lucchetto dei Livelli): `#id` se
// l'elemento ha un id, altrimenti `@percorso` (indici fra fratelli). Il designer dà un id a quasi ogni elemento
// che modifica: allora la chiave `@percorso` va portata su `#id`, se no occhio e lucchetto si perdono o si
// duplicano (e il percorso slitta appena si inserisce un fratello prima). Puro e testato.
import { findByAttrId, findByPath, type ElementInfo, type HtmlModel } from './html-model'

export const viewKey = (element: Pick<ElementInfo, 'attrs' | 'path'>): string => (element.attrs['id'] ? `#${element.attrs['id']}` : `@${element.path.join('.')}`)

/** L'elemento di una chiave (null se non c'è più). */
export function elementForViewKey(model: HtmlModel, key: string): ElementInfo | null {
  if (key.startsWith('#')) return findByAttrId(model, key.slice(1))
  if (key.startsWith('@')) return findByPath(model, key.slice(1) ? key.slice(1).split('.').map(Number) : [])
  return null
}

/**
 * Le chiavi aggiornate al nuovo modello: un `@percorso` il cui elemento ora ha un id diventa `#id`
 * (senza doppioni). Restituisce lo stesso array se non cambia niente.
 */
export function migrateViewKeys(keys: readonly string[], model: HtmlModel): readonly string[] {
  let changed = false
  const out: string[] = []
  for (const key of keys) {
    let next = key
    if (key.startsWith('@')) {
      const element = elementForViewKey(model, key)
      if (element?.attrs['id']) next = `#${element.attrs['id']}`
    }
    if (next !== key) changed = true
    if (!out.includes(next)) out.push(next)
    else changed = true
  }
  return changed ? out : keys
}

/** La chiave è dell'elemento? (Per i Livelli e la tela: si confronta l'elemento, non il testo della chiave.) */
export function keyMatches(model: HtmlModel, keys: readonly string[], element: ElementInfo): boolean {
  return keys.some((key) => elementForViewKey(model, key)?.id === element.id)
}
