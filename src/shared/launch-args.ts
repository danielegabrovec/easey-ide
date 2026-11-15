// Aprire Easey IDE con un percorso (1.6, per Easey DB: «Apri in Easey IDE» lancia `Easey IDE.exe <file o cartella>`).
// Qui ciò che main e renderer condividono; quali argomenti sono percorsi lo decide src/main/launch-args.ts.

/** Che cosa si apre: un file (nel progetto aperto, o nella Scrittura rapida) o una cartella (come progetto). */
export interface LaunchTarget {
  kind: 'file' | 'folder'
  path: string
  /** Solo per i file fuori dal progetto: il testo, per la Scrittura rapida (al massimo LAUNCH_MAX_BYTES). */
  content?: string
}

export const LAUNCH_MAX_BYTES = 2 * 1024 * 1024

/** Percorso di un file nel progetto aperto (con «/», senza badare alle maiuscole come Windows), o null se è fuori. */
export function projectRelative(root: string, path: string): string | null {
  const clean = (value: string) => value.replace(/[\\/]+/g, '/').replace(/\/+$/, '')
  const base = clean(root).toLowerCase()
  const file = clean(path)
  return file.toLowerCase().startsWith(`${base}/`) ? file.slice(base.length + 1) : null
}
