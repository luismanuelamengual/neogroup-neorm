import { Connection } from './Connection'
import { DataConnection } from './DataConnection'
import { DataSet } from './DataSet'
import { DataTable } from './DataTable'
import { DefaultQueryBuilder, Query, QueryBuilder } from './query'
import { getTransactionStore, runWithTransactionStore, TransactionStore } from './transactionStorage'

export abstract class DataSource {
  protected debug = false
  protected readonly = false
  protected queryBuilder: QueryBuilder

  constructor(queryBuilder?: QueryBuilder) {
    this.queryBuilder = queryBuilder ?? new DefaultQueryBuilder()
  }

  public setDebugEnabled(debug: boolean) {
    this.debug = debug
  }

  public isDebugEnabled(): boolean {
    return this.debug
  }

  public setReadonly(readonly: boolean) {
    this.readonly = readonly
  }

  public isReadonly(): boolean {
    return this.readonly
  }

  public table(tableName: string): DataTable {
    return new DataTable(this, tableName)
  }

  public async getConnection(): Promise<DataConnection> {
    const connection = new DataConnection(await this.requestConnection(), this.queryBuilder)

    connection.setDebugEnabled(this.debug)
    connection.setReadonly(this.readonly)

    return connection
  }

  public async withConnection<T>(callback: (connection: DataConnection) => Promise<T>): Promise<T> {
    const connection = await this.getConnection()

    try {
      return await callback(connection)
    } finally {
      await connection.close()
    }
  }

  /**
   * The connection that holds the transaction currently open for THIS source in
   * the active async context, or `undefined` when no transaction is in progress.
   * Query/execute and the entity layer route their statements through it so the
   * whole unit of work shares one connection.
   */
  public getActiveConnection(): DataConnection | undefined {
    return getTransactionStore()?.get(this)
  }

  /**
   * Runs `callback` inside a database transaction on this source. Every entity
   * and query operation performed within the callback (and the async work it
   * awaits) runs on the same connection and is committed atomically. If the
   * callback throws, the transaction is rolled back and the error is re-thrown.
   *
   * Transactions join: calling `transaction()` again while one is already open
   * for this source reuses the in-progress transaction instead of nesting a new
   * one, so the outermost call controls the commit/rollback.
   */
  public async transaction<T>(callback: (connection: DataConnection) => Promise<T>): Promise<T> {
    const existing = this.getActiveConnection()

    // Already inside a transaction for this source → join it (no nested BEGIN).
    if (existing) {
      return await callback(existing)
    }

    const connection = await this.getConnection()
    const store: TransactionStore = new Map(getTransactionStore())

    store.set(this, connection)

    return await runWithTransactionStore(store, async () => {
      try {
        await connection.beginTransaction()
        const result = await callback(connection)

        await connection.commitTransaction()

        return result
      } catch (error) {
        await connection.rollbackTransaction()
        throw error
      } finally {
        await connection.close()
      }
    })
  }

  public query(sql: string, bindings?: Array<any>): Promise<Array<DataSet>>
  public query(query: Query): Promise<Array<DataSet>>
  public async query(): Promise<Array<DataSet>> {
    const active = this.getActiveConnection()

    if (active) {
      // @ts-ignore
      return await active.query(...arguments)
    }

    const connection = await this.getConnection()

    try {
      // @ts-ignore
      return await connection.query(...arguments)
    } finally {
      await connection.close()
    }
  }

  public execute(sql: string, bindings?: Array<any>): Promise<number>
  public execute(query: Query): Promise<number>
  public async execute(): Promise<number> {
    const active = this.getActiveConnection()

    if (active) {
      // @ts-ignore
      return await active.execute(...arguments)
    }

    const connection = await this.getConnection()

    try {
      // @ts-ignore
      return await connection.execute(...arguments)
    } finally {
      await connection.close()
    }
  }

  protected abstract requestConnection(): Promise<Connection>
  public abstract close(): Promise<void>
}
