// Token del design system del progetto: tutte le variabili CSS che il kit scrive in :root
// (colori del tema con la scala del primario, scala del testo, spazi, raggi, elevazioni).
// I nomi sono in italiano come nella 1.3 (`--colore-primario`, `--testo-xl`, `--spazio-4`, `--raggio-m`,
// `--ombra-2`), così i siti già fatti continuano a funzionare.
import { elevationVariables, RADII, spaceVariables } from './space'
import { COLOR_ROLES, primaryScaleVariables, type KitTheme } from './themes'
import { DEFAULT_TYPE_SCALE, typeVariables, type TypeScaleId } from './type'

export function themeColorVariables(theme: KitTheme): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [role, variable] of COLOR_ROLES) out[variable] = theme[role]
  return out
}

export interface DesignTokenOptions {
  theme: KitTheme
  typeScale?: TypeScaleId
}

/** Tutte le variabili del kit per un tema (da scrivere in `:root`). */
export function designTokens({ theme, typeScale = DEFAULT_TYPE_SCALE }: DesignTokenOptions): Record<string, string> {
  return {
    ...themeColorVariables(theme),
    ...primaryScaleVariables(theme.primary),
    '--font-titoli': theme.headingFont,
    '--font-testo': theme.bodyFont,
    ...typeVariables(typeScale),
    ...spaceVariables(),
    ...RADII,
    ...elevationVariables()
  }
}

/** Blocco CSS leggibile: `selettore {\n  prop: valore;\n}`. */
export function cssBlock(selector: string, declarations: Record<string, string>): string {
  const body = Object.entries(declarations)
    .map(([prop, value]) => `  ${prop}: ${value};`)
    .join('\n')
  return `${selector} {\n${body}\n}`
}
