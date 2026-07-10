import { buildExistsCondition, Condition, ConditionConnector, ConditionGroup, ExistsSubquery } from '../conditions'
import { Field } from '../fields'

export abstract class HasWhereConditions<R> {
  protected _whereConditions?: ConditionGroup

  public setWhereConditions(conditions: ConditionGroup | undefined): R {
    this._whereConditions = conditions

    return this as unknown as R
  }

  public getWhereConditions(): ConditionGroup {
    if (!this._whereConditions) {
      this._whereConditions = new ConditionGroup()
    }

    return this._whereConditions
  }

  // ── WHERE ────────────────────────────────────────────────────────────────────

  public where(callback: (group: ConditionGroup) => void): R
  public where(condition: Condition): R
  public where(field: Field, value: any): R
  public where(field: Field, operator: string, value: any): R
  public where(): R {
    // @ts-ignore
    this.getWhereConditions().where(...arguments)

    return this as unknown as R
  }

  public whereIn(field: Field, values: Array<any>): R {
    return this.where(field, 'IN', values)
  }

  public whereNotIn(field: Field, values: Array<any>): R {
    return this.where(field, 'NOT IN', values)
  }

  public whereBetween(field: Field, range: [any, any]): R {
    return this.where(field, 'BETWEEN', range)
  }

  public whereNotBetween(field: Field, range: [any, any]): R {
    return this.where(field, 'NOT BETWEEN', range)
  }

  public whereNull(field: Field): R {
    return this.where(field, null)
  }

  public whereNotNull(field: Field): R {
    return this.where(field, '<>', null)
  }

  /** Case-insensitive by default. Pass caseSensitive=true for exact-case matching. */
  public whereLike(field: Field, pattern: string, caseSensitive = false): R {
    return this.where(field, caseSensitive ? 'LIKE' : 'ILIKE', pattern)
  }

  public whereNotLike(field: Field, pattern: string, caseSensitive = false): R {
    return this.where(field, caseSensitive ? 'NOT LIKE' : 'NOT ILIKE', pattern)
  }

  public whereExists(subquery: ExistsSubquery): R {
    return this.where(buildExistsCondition(subquery))
  }

  public whereNotExists(subquery: ExistsSubquery): R {
    return this.where(buildExistsCondition(subquery, true))
  }

  // ── OR WHERE ─────────────────────────────────────────────────────────────────

  public orWhere(callback: (group: ConditionGroup) => void): R
  public orWhere(condition: Condition): R
  public orWhere(field: Field, value: any): R
  public orWhere(field: Field, operator: string, value: any): R
  public orWhere(): R {
    // @ts-ignore
    this.getWhereConditions().orWhere(...arguments)

    return this as unknown as R
  }

  public orWhereIn(field: Field, values: Array<any>): R {
    return this.orWhere(field, 'IN', values)
  }

  public orWhereNotIn(field: Field, values: Array<any>): R {
    return this.orWhere(field, 'NOT IN', values)
  }

  public orWhereBetween(field: Field, range: [any, any]): R {
    return this.orWhere(field, 'BETWEEN', range)
  }

  public orWhereNotBetween(field: Field, range: [any, any]): R {
    return this.orWhere(field, 'NOT BETWEEN', range)
  }

  public orWhereNull(field: Field): R {
    return this.orWhere(field, null)
  }

  public orWhereNotNull(field: Field): R {
    return this.orWhere(field, '<>', null)
  }

  /** Case-insensitive by default. Pass caseSensitive=true for exact-case matching. */
  public orWhereLike(field: Field, pattern: string, caseSensitive = false): R {
    return this.orWhere(field, caseSensitive ? 'LIKE' : 'ILIKE', pattern)
  }

  public orWhereNotLike(field: Field, pattern: string, caseSensitive = false): R {
    return this.orWhere(field, caseSensitive ? 'NOT LIKE' : 'NOT ILIKE', pattern)
  }

  public orWhereExists(subquery: ExistsSubquery): R {
    return this.orWhere(buildExistsCondition(subquery))
  }

  public orWhereNotExists(subquery: ExistsSubquery): R {
    return this.orWhere(buildExistsCondition(subquery, true))
  }

  // ── WHERE COLUMN ──────────────────────────────────────────────────────────

  public whereColumn(field: Field, column: Field): R
  public whereColumn(field: Field, operator: string, column: Field): R
  public whereColumn(field: Field, operatorOrColumn: string | Field, column?: Field): R {
    const operator = column !== undefined ? (operatorOrColumn as string) : '='
    const col = column !== undefined ? column : (operatorOrColumn as Field)

    this.getWhereConditions()
      .getConditions()
      .push({ condition: { field, operator, column: col }, connector: ConditionConnector.AND })

    return this as unknown as R
  }

  public orWhereColumn(field: Field, column: Field): R
  public orWhereColumn(field: Field, operator: string, column: Field): R
  public orWhereColumn(field: Field, operatorOrColumn: string | Field, column?: Field): R {
    const operator = column !== undefined ? (operatorOrColumn as string) : '='
    const col = column !== undefined ? column : (operatorOrColumn as Field)

    this.getWhereConditions()
      .getConditions()
      .push({ condition: { field, operator, column: col }, connector: ConditionConnector.OR })

    return this as unknown as R
  }
}
