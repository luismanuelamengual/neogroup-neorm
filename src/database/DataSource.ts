import { Connection } from './Connection'
import { DataConnection } from './DataConnection'
import { DataSet } from './DataSet'
import { DataTable } from './DataTable'
import { DefaultQueryBuilder, Query, QueryBuilder } from './query'

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

  public query(sql: string, bindings?: Array<any>): Promise<Array<DataSet>>
  public query(query: Query): Promise<Array<DataSet>>
  public async query(): Promise<Array<DataSet>> {
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
