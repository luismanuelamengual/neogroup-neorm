import { debugLog } from '../utilities'
import { Connection } from './Connection'
import { DataSet } from './DataSet'
import { Query, QueryBuilder } from './query'

export class DataConnection {
  private connection: Connection
  private queryBuilder: QueryBuilder
  private debug = false
  private readonly = false

  constructor(connection: Connection, queryBuilder: QueryBuilder) {
    this.connection = connection
    this.queryBuilder = queryBuilder
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

  public async beginTransaction(): Promise<void> {
    if (this.debug) {
      debugLog('[BEGIN TRANSACTION]')
    }

    if (!this.readonly) {
      await this.connection.beginTransaction()
    }
  }

  public async rollbackTransaction(): Promise<void> {
    if (this.debug) {
      debugLog('[ROLLBACK TRANSACTION]')
    }

    if (!this.readonly) {
      await this.connection.rollbackTransaction()
    }
  }

  public async commitTransaction(): Promise<void> {
    if (this.debug) {
      debugLog('[COMMIT TRANSACTION]')
    }

    if (!this.readonly) {
      await this.connection.commitTransaction()
    }
  }

  public async lastInsertId(): Promise<number> {
    return this.connection.lastInsertId()
  }

  public async close(): Promise<void> {
    await this.connection.close()
  }

  public query(sql: string, bindings?: Array<any>): Promise<Array<DataSet>>
  public query(query: Query): Promise<Array<DataSet>>
  public async query(sqlOrQuery: string | Query, bindings?: Array<any>): Promise<Array<DataSet>> {
    if (sqlOrQuery instanceof Query) {
      const statement = this.queryBuilder.buildQuery(sqlOrQuery)

      sqlOrQuery = statement.sql
      bindings = statement.bindings
    }

    if (this.debug) {
      debugLog(
        'SQL: ' +
          sqlOrQuery +
          ';' +
          (bindings
            ? '   [' + bindings.map((value) => (typeof value === 'string' ? '"' + value + '"' : value)).join(', ') + ']'
            : '')
      )
    }

    return await this.connection.query(sqlOrQuery as string, bindings)
  }

  public execute(sql: string, bindings?: Array<any>): Promise<number>
  public execute(query: Query): Promise<number>
  public async execute(sqlOrQuery: string | Query, bindings?: Array<any>): Promise<number> {
    if (sqlOrQuery instanceof Query) {
      const statement = this.queryBuilder.buildQuery(sqlOrQuery)

      sqlOrQuery = statement.sql
      bindings = statement.bindings
    }

    if (this.debug) {
      debugLog(
        'SQL: ' +
          sqlOrQuery +
          ';' +
          (bindings
            ? '   [' + bindings.map((value) => (typeof value === 'string' ? '"' + value + '"' : value)).join(', ') + ']'
            : '')
      )
    }

    return this.readonly ? 0 : await this.connection.execute(sqlOrQuery as string, bindings)
  }

  public async executeTransaction(transaction: (connection: DataConnection) => Promise<void>) {
    await this.beginTransaction()

    try {
      await transaction(this)
      await this.commitTransaction()
    } catch (e) {
      await this.rollbackTransaction()
      throw e
    }
  }
}
