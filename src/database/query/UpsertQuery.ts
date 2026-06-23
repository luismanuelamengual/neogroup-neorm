import { applyMixins } from '../../utilities'
import { DataSet } from '../DataSet'
import { HasTable } from './features'
import { Query } from './Query'
import { QueryTable } from './QueryTable'

/**
 * An "insert or update" statement (a.k.a. upsert), modelled after Eloquent's
 * `Model::upsert($values, $uniqueBy, $update)`:
 *
 *   - `rows`            one or more records to insert.
 *   - `conflictColumns` the column(s) that detect a conflict (a unique or
 *                       primary key). On PostgreSQL/SQLite they drive the
 *                       `ON CONFLICT (...)` target; MySQL ignores them and
 *                       relies on its own unique keys.
 *   - `updateColumns`   the columns to overwrite when a conflict happens. When
 *                       omitted it defaults to every inserted column that is
 *                       not part of `conflictColumns` (Eloquent's behaviour).
 *
 * Engines differ on the exact syntax, so the SQL is produced by each
 * QueryBuilder (DefaultQueryBuilder for PostgreSQL/SQLite, MysqlQueryBuilder
 * for MySQL) rather than here.
 */
export class UpsertQuery extends Query {
  protected _rows: DataSet[] = []
  protected _conflictColumns: string[] = []
  protected _updateColumns?: string[]

  constructor(table?: QueryTable) {
    super()

    if (table) {
      this.setTable(table)
    }
  }

  public setRows(rows: DataSet[]): this {
    this._rows = rows

    return this
  }

  public getRows(): DataSet[] {
    return this._rows
  }

  public setConflictColumns(columns: string[]): this {
    this._conflictColumns = columns

    return this
  }

  public getConflictColumns(): string[] {
    return this._conflictColumns
  }

  public setUpdateColumns(columns: string[] | undefined): this {
    this._updateColumns = columns

    return this
  }

  public getUpdateColumns(): string[] | undefined {
    return this._updateColumns
  }
}

export interface UpsertQuery extends HasTable<UpsertQuery> {}
applyMixins(UpsertQuery, [HasTable])
