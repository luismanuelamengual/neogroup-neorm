import { CastType } from '../CastType'

// ── Cast helpers ──────────────────────────────────────────────────────────────

export function applyCast(value: any, type: CastType): any {
  if (value == null) {
    return null
  }

  switch (type) {
    case 'number':
      return Number(value)
    case 'boolean':
      return value === true || value === 1 || value === '1' || value === 'true'
    case 'string':
      return String(value)
    case 'json':
      return typeof value === 'string' ? JSON.parse(value) : value
    case 'date':
      return value instanceof Date ? value : new Date(value)
    case 'array':
      // Engines that store arrays as JSON strings (SQLite, MySQL) return a
      // string here; native array engines (Postgres INT[], TEXT[]) already
      // return a JS array via the driver, so we pass it through unchanged.
      return typeof value === 'string' ? JSON.parse(value) : value
  }
}

export function applyCastForStorage(value: any, type: CastType): any {
  if (value == null) {
    return null
  }

  switch (type) {
    case 'boolean':
      return value ? 1 : 0
    case 'json':
      return typeof value === 'string' ? value : JSON.stringify(value)
    case 'date':
      return value instanceof Date ? value.toISOString() : value
    case 'array':
      // Serialize to a JSON string for engines that lack native array types
      // (SQLite, MySQL). On Postgres, columns declared without cast use native
      // INT[]/TEXT[] and the value never reaches applyCastForStorage — the raw
      // JS array is passed directly to the driver by buildColumnValue.
      return Array.isArray(value) ? JSON.stringify(value) : value
    default:
      return value
  }
}
