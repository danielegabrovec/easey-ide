// Scala degli spazi (multipli di 4, poi di 8): margini, padding e gap presi da qui danno un ritmo
// regolare alla pagina. `--spazio-1` = 4 px … `--spazio-10` = 128 px.

export const SPACE_STEPS = [0, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128] as const

/** Gradini proposti nell'ispettore (i più usati). */
export const SPACE_CHOICES = [0, 4, 8, 12, 16, 24, 32, 48, 64] as const

export const spaceVar = (index: number): string => `var(--spazio-${index})`

export function spaceVariables(): Record<string, string> {
  const out: Record<string, string> = {}
  SPACE_STEPS.forEach((px, index) => {
    if (index > 0) out[`--spazio-${index}`] = `${px}px`
  })
  return out
}

/** Gradino più vicino a una misura in px (a pari distanza, il più piccolo). */
export function nearestSpace(px: number): number {
  return SPACE_STEPS.reduce((best, step) => (Math.abs(step - px) < Math.abs(best - px) ? step : best), SPACE_STEPS[0])
}

/** Le misure piccole (≤ 2 px: bordi, linee sottili) e quelle della scala vanno bene. */
export function isOnScale(px: number): boolean {
  return Math.abs(px) <= 2 || SPACE_STEPS.some((step) => Math.abs(step - Math.abs(px)) < 0.5)
}

/** I due gradini attorno a una misura fuori scala (es. 13 → [12, 16]). */
export function neighbours(px: number): [number, number] {
  const value = Math.abs(px)
  const below = [...SPACE_STEPS].reverse().find((s) => s <= value) ?? 0
  const above = SPACE_STEPS.find((s) => s >= value) ?? SPACE_STEPS[SPACE_STEPS.length - 1]
  return [below, above]
}

/** Raggi degli angoli: `--raggio-s` … `--raggio-pillola`. */
export const RADII: Record<string, string> = { '--raggio-s': '6px', '--raggio-m': '12px', '--raggio-l': '20px', '--raggio-pillola': '999px' }

/**
 * Elevazioni: ombre a più strati, sempre più morbide e lontane. Tinte con il colore del testo del tema
 * (color-mix), così su un tema caldo o freddo l'ombra non è un grigio «sporco».
 */
export function elevationVariables(): Record<string, string> {
  const tint = (alpha: number) => `color-mix(in srgb, var(--colore-testo, #111827) ${alpha}%, transparent)`
  return {
    '--ombra-1': `0 1px 2px ${tint(6)}, 0 1px 3px ${tint(10)}`,
    '--ombra-2': `0 2px 4px ${tint(6)}, 0 6px 16px ${tint(10)}`,
    '--ombra-3': `0 4px 8px ${tint(6)}, 0 14px 32px ${tint(14)}`,
    '--ombra-4': `0 8px 16px ${tint(8)}, 0 28px 64px ${tint(20)}`
  }
}
