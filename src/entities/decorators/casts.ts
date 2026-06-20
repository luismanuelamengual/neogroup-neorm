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
      // No transformation here — the query builder for each engine is
      // responsible for serializing the array in the correct wire format
      // (e.g. SqliteQueryBuilder stringifies to JSON, PostgresQueryBuilder
      // passes the raw JS array so node-pg can produce the {1,2,3} literal).
      return value
    default:
      return value
  }
}
