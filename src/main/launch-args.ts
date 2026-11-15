// Quali argomenti della riga di comando sono percorsi da aprire (1.6, per «Apri in Easey IDE» di Easey DB): mai il
// programma stesso (argv[0]), mai le opzioni di Electron e di Chromium (--qualcosa, -x), mai la cartella dell'app né i
// suoi file (`electron .` durante lo sviluppo e nei collaudi). Puro: se il percorso esiste e se è un file o una
// cartella lo decide index.ts. Testato in tests/unit/launch-args.test.ts.
import { isAbsolute, normalize, resolve, sep } from 'node:path'

/**
 * Percorsi candidati, assoluti, nell'ordine della riga di comando. `appPath` = cartella dell'app (app.getAppPath()),
 * `cwd` = cartella da cui è partito il comando (per i percorsi relativi; con second-instance quella dell'altro avvio).
 */
export function launchCandidates(argv: readonly string[], appPath: string, cwd: string): string[] {
  const app = normalize(resolve(appPath)).toLowerCase()
  const out: string[] = []
  for (const arg of argv.slice(1)) {
    const value = arg.trim().replace(/^"(.*)"$/, '$1')
    if (!value || value.startsWith('-')) continue
    // Indirizzi (es. easey-ide://…, file:///…) non sono percorsi del disco.
    if (/^[a-z][a-z0-9+.-]+:\/\//i.test(value)) continue
    const absolute = normalize(isAbsolute(value) ? value : resolve(cwd, value))
    const lower = absolute.toLowerCase()
    // `electron .` e lo script principale durante lo sviluppo e nei collaudi.
    if (lower === app || lower.startsWith(app + sep)) continue
    out.push(absolute)
  }
  return out
}
