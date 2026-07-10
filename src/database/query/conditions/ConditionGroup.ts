import { Field } from '../fields'
import { Condition } from './Condition'
import { ConditionConnector } from './ConditionConnector'
import { ConnectedCondition } from './ConnectedCondition'
import { buildExistsCondition, ExistsSubquery } from './ExistsCondition'

export class ConditionGroup {
  private conditions: Array<ConnectedCondition> = []

  public setConditions(conditions: Array<ConnectedCondition>): ConditionGroup {
    this.conditions = conditions

    return this
  }

  public getConditions(): Array<{ condition: Condition; connector: ConditionConnector }> {
    return this.conditions
  }

  public where(callback: (group: ConditionGroup) => void): ConditionGroup
  public where(condition: Condition): ConditionGroup
  public where(field: Field, value: any): ConditionGroup
  public where(field: Field, operator: string, value: any): ConditionGroup
  public where(): ConditionGroup {
    let condition: Condition

    if (arguments.length === 1 && typeof arguments[0] === 'function') {
      const group = new ConditionGroup()

      arguments[0](group)
      condition = group
    } else {
      switch (arguments.length) {
        case 1:
          condition = arguments[0]
          break

        case 2: {
          const [field, value] = arguments

          condition = { field, operator: '=', value }
          break
        }

        case 3: {
          const [field, operator, value] = arguments

          condition = { field, operator, value }
          break
        }

        default:
          throw new Error('Wrong number of arguments for "where"')
      }
    }

    this.conditions.push({ condition, connector: ConditionConnector.AND })

    return this
  }

  public orWhere(callback: (group: ConditionGroup) => void): ConditionGroup
  public orWhere(condition: Condition): ConditionGroup
  public orWhere(field: Field, value: any): ConditionGroup
  public orWhere(field: Field, operator: string, value: any): ConditionGroup
  public orWhere(): ConditionGroup {
    let condition: Condition

    if (arguments.length === 1 && typeof arguments[0] === 'function') {
      const group = new ConditionGroup()

      arguments[0](group)
      condition = group
    } else {
      switch (arguments.length) {
        case 1:
          condition = arguments[0]
          break

        case 2: {
          const [field, value] = arguments

          condition = { field, operator: '=', value }
          break
        }

        case 3: {
          const [field, operator, value] = arguments

          condition = { field, operator, value }
          break
        }

        default:
          throw new Error('Wrong number of arguments for "orWhere"')
      }
    }

    this.conditions.push({ condition, connector: ConditionConnector.OR })

    return this
  }

  // ── WHERE convenience methods ─────────────────────────────────────────────

  public whereIn(field: Field, values: Array<any>): ConditionGroup {
    return this.where(field, 'IN', values)
  }

  public whereNotIn(field: Field, values: Array<any>): ConditionGroup {
    return this.where(field, 'NOT IN', values)
  }

  public whereBetween(field: Field, range: [any, any]): ConditionGroup {
    return this.where(field, 'BETWEEN', range)
  }

  public whereNotBetween(field: Field, range: [any, any]): ConditionGroup {
    return this.where(field, 'NOT BETWEEN', range)
  }

  public whereNull(field: Field): ConditionGroup {
    return this.where(field, null)
  }

  public whereNotNull(field: Field): ConditionGroup {
    return this.where(field, '<>', null)
  }

  /** Case-insensitive by default. Pass caseSensitive=true for exact-case matching. */
  public whereLike(field: Field, pattern: string, caseSensitive = false): ConditionGroup {
    return this.where(field, caseSensitive ? 'LIKE' : 'ILIKE', pattern)
  }

  /** Case-insensitive by default. Pass caseSensitive=true for exact-case matching. */
  public whereNotLike(field: Field, pattern: string, caseSensitive = false): ConditionGroup {
    return this.where(field, caseSensitive ? 'NOT LIKE' : 'NOT ILIKE', pattern)
  }

  public whereColumn(field: Field, column: Field): ConditionGroup
  public whereColumn(field: Field, operator: string, column: Field): ConditionGroup
  public whereColumn(field: Field, operatorOrColumn: string | Field, column?: Field): ConditionGroup {
    const operator = column !== undefined ? (operatorOrColumn as string) : '='
    const col = column !== undefined ? column : (operatorOrColumn as Field)

    this.conditions.push({ condition: { field, operator, column: col }, connector: ConditionConnector.AND })

    return this
  }

  public whereExists(subquery: ExistsSubquery): ConditionGroup {
    return this.where(buildExistsCondition(subquery))
  }

  public whereNotExists(subquery: ExistsSubquery): ConditionGroup {
    return this.where(buildExistsCondition(subquery, true))
  }

  // ── OR WHERE convenience methods ──────────────────────────────────────────

  public orWhereIn(field: Field, values: Array<any>): ConditionGroup {
    return this.orWhere(field, 'IN', values)
  }

  public orWhereNotIn(field: Field, values: Array<any>): ConditionGroup {
    return this.orWhere(field, 'NOT IN', values)
  }

  public orWhereBetween(field: Field, range: [any, any]): ConditionGroup {
    return this.orWhere(field, 'BETWEEN', range)
  }

  public orWhereNotBetween(field: Field, range: [any, any]): ConditionGroup {
    return this.orWhere(field, 'NOT BETWEEN', range)
  }

  public orWhereNull(field: Field): ConditionGroup {
    return this.orWhere(field, null)
  }

  public orWhereNotNull(field: Field): ConditionGroup {
    return this.orWhere(field, '<>', null)
  }

  /** Case-insensitive by default. Pass caseSensitive=true for exact-case matching. */
  public orWhereLike(field: Field, pattern: string, caseSensitive = false): ConditionGroup {
    return this.orWhere(field, caseSensitive ? 'LIKE' : 'ILIKE', pattern)
  }

  /** Case-insensitive by default. Pass caseSensitive=true for exact-case matching. */
  public orWhereNotLike(field: Field, pattern: string, caseSensitive = false): ConditionGroup {
    return this.orWhere(field, caseSensitive ? 'NOT LIKE' : 'NOT ILIKE', pattern)
  }

  public orWhereColumn(field: Field, column: Field): ConditionGroup
  public orWhereColumn(field: Field, operator: string, column: Field): ConditionGroup
  public orWhereColumn(field: Field, operatorOrColumn: string | Field, column?: Field): ConditionGroup {
    const operator = column !== undefined ? (operatorOrColumn as string) : '='
    const col = column !== undefined ? column : (operatorOrColumn as Field)

    this.conditions.push({ condition: { field, operator, column: col }, connector: ConditionConnector.OR })

    return this
  }

  public orWhereExists(subquery: ExistsSubquery): ConditionGroup {
    return this.orWhere(buildExistsCondition(subquery))
  }

  public orWhereNotExists(subquery: ExistsSubquery): ConditionGroup {
    return this.orWhere(buildExistsCondition(subquery, true))
  }
}
