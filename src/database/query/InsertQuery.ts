import { applyMixins } from '../../utilities'
import { DataSet } from '../DataSet'
import { HasFieldValues, HasTable } from './features'
import { Query } from './Query'
import { QueryTable } from './QueryTable'

/**
 * An INSERT statement. Supports both a single record and a batch of records,
 * modelled after Eloquent's `DB::table('x')->insert($values)`:
 *
 *   - Single row:  `.setFields({ name: 'Ada' })`           (HasFieldValues)
 *   - Batch:       `.setRows([{ name: 'Ada' }, { name: 'Bob' }])`
 *
 * When `rows` is set it takes precedence and the builder emits a single
 * multi-row `INSERT INTO t (..) VALUES (..), (..)` statement. The set of
 * columns is the union of the keys across every row; a row missing a column
 * inserts NULL for it (Eloquent's behaviour).
 */
export class InsertQuery extends Query {
  protected _rows?: DataSet[]

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

  public getRows(): DataSet[] | undefined {
    return this._rows
  }
}

export interface InsertQuery extends HasTable<InsertQuery>, HasFieldValues<InsertQuery> {}
applyMixins(InsertQuery, [HasTable, HasFieldValues])
