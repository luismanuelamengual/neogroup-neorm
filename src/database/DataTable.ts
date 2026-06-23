import { applyMixins } from '../utilities'
import { DataSet } from './DataSet'
import { DataSource } from './DataSource'
import { PaginationResult } from './PaginationResult'
import {
  DeleteQuery,
  Field,
  HasAlias,
  HasDistinct,
  HasFieldValues,
  HasGroupByFields,
  HasHavingConditions,
  HasJoins,
  HasLimit,
  HasOffset,
  HasSelectFields,
  HasTable,
  HasWhen,
  HasWhereConditions,
  InsertQuery,
  SelectQuery,
  UpdateQuery,
  UpsertQuery
} from './query'
import { HasOrderByFields } from './query/features/HasOrderByFields'

export class DataTable {
  private source: DataSource

  constructor(source: DataSource, name: string) {
    this.source = source
    this.setTable(name)
  }

  public async get(): Promise<Array<DataSet>> {
    return await this.source.query(this.createSelectQuery())
  }

  public async first(): Promise<DataSet | null> {
    const records = await this.source.query(this.createSelectQuery().setLimit(1))

    return records && records.length > 0 ? records[0] : null
  }

  /**
   * Returns the number of records that match the current query, ignoring any
   * limit/offset/order-by clause. Honours where conditions, joins, group-by and
   * having. When a column is given (other than '*') and the query is distinct,
   * a COUNT(DISTINCT column) is emitted.
   *
   *   await DB.table('users').where('active', 1).count()        // → number
   *   await DB.table('users').distinct().count('country')       // COUNT(DISTINCT country)
   */
  public async count(column: Field = '*'): Promise<number> {
    const columnExpr = typeof column === 'string' ? column : `${column.table ? `${column.table}.` : ''}${column.name}`
    const useDistinct = this._distinct && columnExpr !== '*'
    const aggregate = useDistinct ? `COUNT(DISTINCT ${columnExpr})` : `COUNT(${columnExpr})`
    const query = new SelectQuery()
      .setTable(this._table)
      .setSelectFields([`${aggregate} AS aggregate`])
      .setWhereConditions(this._whereConditions)
      .setGroupByFields(this._groupByFields)
      .setHavingConditions(this._havingConditions)
      .setJoins(this._joins)
    const records = await this.source.query(query)

    // With GROUP BY the engine returns one row per group → count the groups.
    if (this._groupByFields && this._groupByFields.length > 0) {
      return records.length
    }

    return records.length > 0 ? Number(records[0].aggregate) : 0
  }

  /**
   * Length-aware pagination. Runs a COUNT
   * for the total and a windowed SELECT for the page, then returns both plus
   * the navigation metadata.
   *
   *   const page = await DB.table('users').orderBy('name').paginate(15, 2)
   *   // { data, total, perPage, currentPage, lastPage, from, to }
   */
  public async paginate(perPage = 15, page = 1): Promise<PaginationResult<DataSet>> {
    const currentPage = Math.max(page, 1)
    const total = await this.count()
    const lastPage = Math.max(Math.ceil(total / perPage), 1)
    const data = await this.setOffset((currentPage - 1) * perPage)
      .setLimit(perPage)
      .get()
    const from = total === 0 ? null : (currentPage - 1) * perPage + 1
    const to = from === null ? null : from + data.length - 1

    return { data, total, perPage, currentPage, lastPage, from, to }
  }

  public async insert(fields?: DataSet): Promise<number> {
    if (fields) {
      this.setFields(fields)
    }

    return await this.source.execute(this.createInsertQuery())
  }

  public async update(fields?: DataSet): Promise<number> {
    if (fields) {
      this.setFields(fields)
    }

    return await this.source.execute(this.createUpdateQuery())
  }

  public async delete(): Promise<number> {
    return await this.source.execute(this.createDeleteQuery())
  }

  /**
   * Inserts the given rows, updating the conflicting columns when a row already
   * exists. Mirrors Eloquent's `upsert($values, $uniqueBy, $update)`:
   *
   *   await DB.table('player_statistics').upsert(
   *     [{ playerId: 7, points: 120, updatedAt: new Date() }],
   *     'playerId',                 // unique-by column(s)
   *     ['points', 'updatedAt']     // columns to overwrite on conflict (optional)
   *   )
   *
   * When `update` is omitted, every inserted column that is not part of
   * `uniqueBy` is updated. The engine-specific SQL (PostgreSQL/SQLite
   * `ON CONFLICT`, MySQL `ON DUPLICATE KEY UPDATE`) is produced by the source's
   * query builder.
   */
  public async upsert(rows: DataSet[], uniqueBy: string | string[], update?: string[]): Promise<number> {
    if (rows.length === 0) {
      return 0
    }

    const query = new UpsertQuery(this._table)
      .setRows(rows)
      .setConflictColumns(Array.isArray(uniqueBy) ? uniqueBy : [uniqueBy])
      .setUpdateColumns(update)

    return await this.source.execute(query)
  }

  private createSelectQuery(): SelectQuery {
    return new SelectQuery()
      .setTable(this._table)
      .setDistinct(this._distinct)
      .setLimit(this._limit)
      .setOffset(this._offset)
      .setOrderByFields(this._orderByFields)
      .setGroupByFields(this._groupByFields)
      .setFields(this._fields)
      .setSelectFields(this._selectFields)
      .setAlias(this._alias)
      .setWhereConditions(this._whereConditions)
      .setHavingConditions(this._havingConditions)
      .setJoins(this._joins)
  }

  private createInsertQuery(): InsertQuery {
    return new InsertQuery().setTable(this._table).setFields(this._fields)
  }

  private createUpdateQuery(): UpdateQuery {
    return new UpdateQuery().setTable(this._table).setFields(this._fields).setWhereConditions(this._whereConditions)
  }

  private createDeleteQuery(): DeleteQuery {
    return new DeleteQuery().setTable(this._table).setWhereConditions(this._whereConditions)
  }
}

export interface DataTable
  extends HasDistinct<DataTable>,
    HasLimit<DataTable>,
    HasOffset<DataTable>,
    HasOrderByFields<DataTable>,
    HasGroupByFields<DataTable>,
    HasFieldValues<DataTable>,
    HasSelectFields<DataTable>,
    HasTable<DataTable>,
    HasAlias<DataTable>,
    HasWhereConditions<DataTable>,
    HasHavingConditions<DataTable>,
    HasJoins<DataTable>,
    HasWhen<DataTable> {}
applyMixins(DataTable, [
  HasDistinct,
  HasLimit,
  HasOffset,
  HasOrderByFields,
  HasGroupByFields,
  HasFieldValues,
  HasSelectFields,
  HasTable,
  HasAlias,
  HasWhereConditions,
  HasHavingConditions,
  HasJoins,
  HasWhen
])
