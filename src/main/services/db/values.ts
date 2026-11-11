// Normalizzazione dei valori restituiti dai motori: all'interfaccia arrivano solo
// stringhe, numeri, booleani e null (niente BigInt, Date, Buffer o oggetti).
import type { CellValue } from '@shared/contracts/db'

export function normalizeValue(value: unknown, dateOnly = false): CellValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString()
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? String(value) : dateOnly ? value.toISOString().slice(0, 10) : value.toISOString()
  if (value instanceof Uint8Array) return `<BLOB ${value.byteLength} byte>`
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/^Error: /, '')
}
