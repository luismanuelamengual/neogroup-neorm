import { DataConnection } from './DataConnection'
import { DataSet } from './DataSet'
import { DataSource } from './DataSource'
import { DataTable } from './DataTable'
import { ConditionGroup, DeleteQuery, InsertQuery, Query, QueryTable, SelectQuery, UpdateQuery } from './query'

// ── Global state — survives Next.js hot reloads ───────────────────────────────

interface DbState {
  sources: Map<string, DataSource>
  activeSourceName?: string
}

function getGlobalState(): DbState {
  const g = globalThis as any

  if (!g.__neorm) {
    g.__neorm = { sources: new Map<string, DataSource>() }
  }

  return g.__neorm as DbState
}

// ── DB ────────────────────────────────────────────────────────────────────────

export abstract class DB {
  private static get _sources(): Map<string, DataSource> {
    return getGlobalState().sources
  }

  private static get _activeSourceName(): string | undefined {
    return getGlobalState().activeSourceName
  }

  private static set _activeSourceName(value: string | undefined) {
    getGlobalState().activeSourceName = value
  }

  // ── Registration ────────────────────────────────────────────────────────────

  public static register(source: DataSource): void
  public static register(sourceName: string, source: DataSource): void
  public static register(sourceOrName: DataSource | string, source?: DataSource): void {
    const sourceName = source ? (sourceOrName as string) : 'source' + (this._sources.size + 1)
    const sourceToRegister = source ?? (sourceOrName as DataSource)

    this._sources.set(sourceName, sourceToRegister)

    if (!this._activeSourceName) {
      this._activeSourceName = sourceName
    }
  }

  public static setActiveSource(sourceName: string): void {
    if (!this._sources.has(sourceName)) {
      throw new Error(`No DataSource registered with the name "${sourceName}"`)
    }

    this._activeSourceName = sourceName
  }

  public static source(sourceName: string): DataSource {
    this._ensureConfigured()

    const source = this._sources.get(sourceName)

    if (!source) {
      throw new Error(`No DataSource registered with the name "${sourceName}"`)
    }

    return source
  }

  // ── Environment-variable configuration ──────────────────────────────────────

  /**
   * Reads environment variables and registers the corresponding data sources.
   * Called automatically the first time a source is needed if none have been
   * registered manually.
   *
   * Supported variables:
   *
   *   Default source:
   *     DB_DRIVER     sqlite | postgres | mysql   (required)
   *     DB_FILE       path to SQLite file          (sqlite only, default: :memory:)
   *     DB_HOST       database host                (postgres / mysql)
   *     DB_PORT       database port                (postgres / mysql)
   *     DB_NAME       database name                (postgres / mysql)
   *     DB_USERNAME   login username               (postgres / mysql)
   *     DB_PASSWORD   login password               (postgres / mysql)
   *     DB_DEBUG      enable debug mode            (true/false, 1/0, yes/no, on/off)
   *     DB_READONLY   readonly mode                (true/false, 1/0, yes/no, on/off)
   *
   *   Named source  (replace <NAME> with the desired source name in upper-case):
   *     DB_<NAME>_DRIVER, DB_<NAME>_HOST, DB_<NAME>_PORT, DB_<NAME>_NAME,
   *     DB_<NAME>_USERNAME, DB_<NAME>_PASSWORD, DB_<NAME>_FILE,
   *     DB_<NAME>_DEBUG, DB_<NAME>_READONLY
   *
   * Example:
   *   DB_DRIVER=postgres DB_HOST=localhost DB_NAME=app DB_USERNAME=user DB_PASSWORD=pass
   *   DB_REPORTING_DRIVER=sqlite DB_REPORTING_FILE=./reporting.db
   */
  private static configure(): void {
    if (this._sources.size > 0) {
      return // already configured — manual register() takes precedence
    }

    const env = process.env
    // 1. Default (unnamed) source — registered first so it becomes active
    const defaultDriver = env['DB_DRIVER']

    if (defaultDriver) {
      const get = (key: string) => env[`DB_${key}`]

      this.register(this._buildSourceFromEnv(defaultDriver, get))
    }

    // 2. Named sources — DB_<NAME>_DRIVER pattern
    for (const key of Object.keys(env).sort()) {
      const match = key.match(/^DB_([A-Z][A-Z0-9_]*)_DRIVER$/)

      if (!match) {
        continue
      }

      const name = match[1].toLowerCase()
      const prefix = `DB_${match[1]}_`
      const get = (k: string) => env[prefix + k]

      this.register(name, this._buildSourceFromEnv(env[key]!, get))
    }

    if (this._sources.size === 0) {
      throw new Error(
        'No data source configured. ' +
          'Call DB.register() or set the DB_DRIVER environment variable ' +
          '(e.g. DB_DRIVER=sqlite, DB_DRIVER=postgres, DB_DRIVER=mysql).'
      )
    }
  }

  private static _buildSourceFromEnv(driver: string, get: (key: string) => string | undefined): DataSource {
    const source = this._buildDriverSource(driver, get)
    const debug = get('DEBUG')
    const readonly = get('READONLY')

    if (debug !== undefined) {
      source.setDebugEnabled(this._parseEnvBoolean(debug))
    }

    if (readonly !== undefined) {
      source.setReadonly(this._parseEnvBoolean(readonly))
    }

    return source
  }

  private static _parseEnvBoolean(value: string): boolean {
    return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase())
  }

  private static _buildDriverSource(driver: string, get: (key: string) => string | undefined): DataSource {
    switch (driver.toLowerCase()) {
      case 'sqlite': {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SqliteDataSource } = require('./sources/sqlite')
        const s = new SqliteDataSource()
        const file = get('FILE')

        if (file) {
          s.setFilename(file)
        }

        return s
      }

      case 'postgres':

      case 'postgresql': {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { PostgresDataSource } = require('./sources/postgres')
        const s = new PostgresDataSource()
        const host = get('HOST')
        const port = get('PORT')
        const name = get('NAME') ?? get('DATABASE')
        const username = get('USERNAME') ?? get('USER')
        const password = get('PASSWORD') ?? get('PASS')

        if (host) {
          s.setHost(host)
        }

        if (port) {
          s.setPort(Number(port))
        }

        if (name) {
          s.setDatabaseName(name)
        }

        if (username) {
          s.setUsername(username)
        }

        if (password) {
          s.setPassword(password)
        }

        return s
      }

      case 'mysql': {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MysqlDataSource } = require('./sources/mysql')
        const s = new MysqlDataSource()
        const host = get('HOST')
        const port = get('PORT')
        const name = get('NAME') ?? get('DATABASE')
        const username = get('USERNAME') ?? get('USER')
        const password = get('PASSWORD') ?? get('PASS')

        if (host) {
          s.setHost(host)
        }

        if (port) {
          s.setPort(Number(port))
        }

        if (name) {
          s.setDatabaseName(name)
        }

        if (username) {
          s.setUsername(username)
        }

        if (password) {
          s.setPassword(password)
        }

        return s
      }

      default:
        throw new Error(`Unknown DB driver "${driver}". Supported drivers: sqlite, postgres, mysql.`)
    }
  }

  private static _ensureConfigured(): void {
    if (this._sources.size === 0) {
      this.configure()
    }
  }

  // ── Query builder helpers ────────────────────────────────────────────────────

  public static table(tableName: string): DataTable {
    return this._activeSource.table(tableName)
  }

  public static conditionGroup(): ConditionGroup {
    return new ConditionGroup()
  }

  public static selectQuery(table?: QueryTable): SelectQuery {
    return new SelectQuery(table)
  }

  public static updateQuery(table?: QueryTable): UpdateQuery {
    return new UpdateQuery(table)
  }

  public static deleteQuery(table?: QueryTable): DeleteQuery {
    return new DeleteQuery(table)
  }

  public static insertQuery(table?: QueryTable): InsertQuery {
    return new InsertQuery(table)
  }

  // ── Connection ──────────────────────────────────────────────────────────────

  public static connection(): Promise<DataConnection> {
    return this._activeSource.getConnection()
  }

  public static withConnection<T>(callback: (connection: DataConnection) => Promise<T>): Promise<T> {
    return this._activeSource.withConnection(callback)
  }

  // ── Query / Execute ─────────────────────────────────────────────────────────

  public static query(sql: string, bindings?: Array<any>): Promise<Array<DataSet>>
  public static query(query: Query): Promise<Array<DataSet>>
  public static async query(): Promise<Array<DataSet>> {
    const conn = await this.connection()

    try {
      // @ts-ignore
      return await conn.query(...arguments)
    } finally {
      await conn.close()
    }
  }

  public static execute(sql: string, bindings?: Array<any>): Promise<number>
  public static execute(query: Query): Promise<number>
  public static async execute(): Promise<number> {
    const conn = await this.connection()

    try {
      // @ts-ignore
      return await conn.execute(...arguments)
    } finally {
      await conn.close()
    }
  }

  // ── Transactions ────────────────────────────────────────────────────────────

  public static async beginTransaction(): Promise<void> {
    return (await this.connection()).beginTransaction()
  }

  public static async commitTransaction(): Promise<void> {
    return (await this.connection()).commitTransaction()
  }

  public static async rollbackTransaction(): Promise<void> {
    return (await this.connection()).rollbackTransaction()
  }

  public static async executeTransaction(callback: (connection: DataConnection) => Promise<void>): Promise<void> {
    return this.withConnection((conn) => conn.executeTransaction(callback))
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  public static getActiveSource(): DataSource {
    return this._activeSource
  }

  private static get _activeSource(): DataSource {
    this._ensureConfigured()

    return this._sources.get(this._activeSourceName!) as DataSource
  }
}
