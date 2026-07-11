import { Connection } from '../../Connection'
import { DataSet } from '../../DataSet'

/**
 * node:sqlite (`DatabaseSync`) only accepts `null`, numbers, bigints, strings and
 * buffers as bound parameter values — passing a `boolean`, a `Date` or `undefined`
 * throws `TypeError: Provided value cannot be bound to SQLite parameter N`. Every
 * other data source (Postgres, MySQL) binds those types natively, so callers
 * throughout the query builder / active record layer pass them as plain JS
 * values without a SQLite-specific cast. Coercing right here, at the last step
 * before the value reaches node:sqlite, covers every path (query builder,
 * active record saves, raw `execute`/`query` calls) in one place instead of
 * requiring every caller to know about this driver's limitation.
 */
function coerceBinding(value: any): any {
  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (value === undefined) {
    return null
  }

  return value
}

function coerceBindings(bindings?: Array<any>): Array<any> {
  return bindings ? bindings.map(coerceBinding) : []
}

export class SqliteConnection implements Connection {
  private db: any
  private _lastInsertId: number = 0

  constructor(db: any) {
    this.db = db
  }

  public async query(sql: string, bindings?: Array<any>): Promise<Array<DataSet>> {
    const stmt = this.db.prepare(sql)

    return stmt.all(...coerceBindings(bindings))
  }

  public async execute(sql: string, bindings?: Array<any>): Promise<number> {
    const stmt = this.db.prepare(sql)
    const result = stmt.run(...coerceBindings(bindings))

    this._lastInsertId = Number(result.lastInsertRowid ?? 0)

    return result.changes ?? 0
  }

  public async lastInsertId(): Promise<number> {
    return this._lastInsertId
  }

  public async beginTransaction(): Promise<void> {
    this.db.prepare('BEGIN').run()
  }

  public async rollbackTransaction(): Promise<void> {
    this.db.prepare('ROLLBACK').run()
  }

  public async commitTransaction(): Promise<void> {
    this.db.prepare('COMMIT').run()
  }

  public async close(): Promise<void> {
    // La instancia db es compartida; el cierre lo maneja SqliteDataSource
  }
}
