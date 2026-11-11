// Trasformazioni pure (testabili senza Electron) applicate ai file serviti all'anteprima.
import { BRIDGE_PATH } from '@shared/stack'

/** Marcatore dell'errore lanciato da un modulo che non compila: il ponte non lo riporta due volte. */
export const COMPILE_ERROR_MARKER = '[errore di compilazione]'

/** Inserisce lo script ponte come primo elemento di <head> (o in testa al documento). */
export function injectBridge(html: string): string {
  const tag = `<script src="/${BRIDGE_PATH}"></script>`
  const head = /<head[^>]*>/i.exec(html)
  if (head) return html.slice(0, head.index + head[0].length) + tag + html.slice(head.index + head[0].length)
  const htmlTag = /<html[^>]*>/i.exec(html)
  if (htmlTag) return html.slice(0, htmlTag.index + htmlTag[0].length) + tag + html.slice(htmlTag.index + htmlTag[0].length)
  return tag + html
}

/** Import "nudi" (es. `from 'lodash'`) → esm.sh, così i pacchetti npm funzionano nell'anteprima se si è online. */
export function rewriteBareImports(code: string): string {
  return code.replace(/(\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"./][^'"]*)\2/g, (match, prefix: string, quote: string, specifier: string) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(specifier)) return match
    return `${prefix}${quote}https://esm.sh/${specifier}${quote}`
  })
}

/**
 * Modulo sostitutivo di un file che non compila: segnala l'errore alla console dell'IDE
 * (file, riga, colonna originali) e interrompe l'esecuzione della pagina.
 */
export function compileErrorModule(path: string, message: string, line: number, column: number): string {
  const info = JSON.stringify({ path, message, line, column })
  const thrown = JSON.stringify(`${COMPILE_ERROR_MARKER} ${path}:${line}:${column} ${message}`)
  return `window.__ideCompileError && window.__ideCompileError(${info});\nthrow new SyntaxError(${thrown});\n`
}
