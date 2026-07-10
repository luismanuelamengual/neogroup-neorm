import { DataSet } from '../../DataSet'
import { ColumnCondition, Condition, ConditionConnector, ConditionGroup } from '../conditions'
import { DeleteQuery } from '../DeleteQuery'
import { Join, JoinType, OrderByField, SelectField } from '../features'
import { Field } from '../fields'
import { InsertQuery } from '../InsertQuery'
import { Query } from '../Query'
import { QueryTable } from '../QueryTable'
import { SelectQuery } from '../SelectQuery'
import { Statement } from '../Statement'
import { UpdateQuery } from '../UpdateQuery'
import { UpsertQuery } from '../UpsertQuery'
import { QueryBuilder } from './QueryBuilder'

export class DefaultQueryBuilder extends QueryBuilder {
  protected static readonly SPACE = ' '
  protected static readonly COMMA = ','
  protected static readonly DOUBLE_QUOTES = '"'
  protected static readonly EQUALS = '='
  protected static readonly PARENTHESIS_START = '('
  protected static readonly PARENTHESIS_END = ')'
  protected static readonly SELECT = 'SELECT'
  protected static readonly INSERT = 'INSERT'
  protected static readonly UPDATE = 'UPDATE'
  protected static readonly DELETE = 'DELETE'
  protected static readonly INTO = 'INTO'
  protected static readonly SET = 'SET'
  protected static readonly VALUES = 'VALUES'
  protected static readonly DISTINCT = 'DISTINCT'
  protected static readonly ALL = '*'
  protected static readonly AS = 'AS'
  protected static readonly POINT = '.'
  protected static readonly FROM = 'FROM'
  protected static readonly AND = 'AND'
  protected static readonly OR = 'OR'
  protected static readonly NULL = 'NULL'
  protected static readonly IS = 'IS'
  protected static readonly NOT = 'NOT'
  protected static readonly ON = 'ON'
  protected static readonly WHERE = 'WHERE'
  protected static readonly EXISTS = 'EXISTS'
  protected static readonly HAVING = 'HAVING'
  protected static readonly GROUP = 'GROUP'
  protected static readonly ORDER = 'ORDER'
  protected static readonly BY = 'BY'
  protected static readonly LIMIT = 'LIMIT'
  protected static readonly OFFSET = 'OFFSET'
  protected static readonly ASC = 'ASC'
  protected static readonly DESC = 'DESC'
  protected static readonly JOIN = 'JOIN'
  protected static readonly INNER = 'INNER'
  protected static readonly OUTER = 'OUTER'
  protected static readonly LEFT = 'LEFT'
  protected static readonly RIGHT = 'RIGHT'
  protected static readonly CROSS = 'CROSS'
  protected static readonly WILDCARD = '?'
  protected static readonly UNION = 'UNION'
  protected static readonly BETWEEN = 'BETWEEN'
  protected static readonly ON_CONFLICT = 'ON CONFLICT'
  protected static readonly DO_UPDATE_SET = 'DO UPDATE SET'
  protected static readonly DO_NOTHING = 'DO NOTHING'
  protected static readonly EXCLUDED = 'EXCLUDED'

  public buildQuery(query: Query): Statement {
    const statement = { sql: '', bindings: [] }

    if (query instanceof SelectQuery) {
      this.buildSelectQuery(query, statement)
    } else if (query instanceof InsertQuery) {
      this.buildInsertQuery(query, statement)
    } else if (query instanceof UpdateQuery) {
      this.buildUpdateQuery(query, statement)
    } else if (query instanceof DeleteQuery) {
      this.buildDeleteQuery(query, statement)
    } else if (query instanceof UpsertQuery) {
      this.buildUpsertQuery(query, statement)
    }

    return statement
  }

  protected buildSelectQuery(query: SelectQuery, statement: Statement) {
    statement.sql += DefaultQueryBuilder.SELECT

    if (query.isDistinct()) {
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += DefaultQueryBuilder.DISTINCT
    }

    statement.sql += DefaultQueryBuilder.SPACE
    const selectFields = query.getSelectFields()

    if (selectFields && selectFields.length > 0) {
      let isFirst = true

      for (const field of selectFields) {
        if (!isFirst) {
          statement.sql += DefaultQueryBuilder.COMMA
          statement.sql += DefaultQueryBuilder.SPACE
        }

        this.buildSelectField(field, statement)
        isFirst = false
      }
    } else {
      statement.sql += DefaultQueryBuilder.ALL
    }

    statement.sql += DefaultQueryBuilder.SPACE
    statement.sql += DefaultQueryBuilder.FROM
    statement.sql += DefaultQueryBuilder.SPACE
    this.buildTable(query.getTable(), statement)

    const tableAlias = query.getAlias()

    if (tableAlias != null) {
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += DefaultQueryBuilder.AS
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += tableAlias
    }

    const joins = query.getJoins()

    if (joins != null && joins.length > 0) {
      for (const join of joins) {
        statement.sql += DefaultQueryBuilder.SPACE
        this.buildJoin(join, statement)
      }
    }

    const whereConditions = query.getWhereConditions()

    if (whereConditions && whereConditions.getConditions().length > 0) {
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += DefaultQueryBuilder.WHERE
      statement.sql += DefaultQueryBuilder.SPACE
      this.buildConditionGroup(whereConditions, statement)
    }

    const groupByFields = query.getGroupByFields()

    if (groupByFields && groupByFields.length > 0) {
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += DefaultQueryBuilder.GROUP
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += DefaultQueryBuilder.BY
      statement.sql += DefaultQueryBuilder.SPACE
      let isFirst = true

      for (const field of groupByFields) {
        if (!isFirst) {
          statement.sql += DefaultQueryBuilder.COMMA
          statement.sql += DefaultQueryBuilder.SPACE
        }

        this.buildField(field, statement)
        isFirst = false
      }
    }

    const havingConditions = query.getHavingConditions()

    if (havingConditions && havingConditions.getConditions().length > 0) {
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += DefaultQueryBuilder.HAVING
      statement.sql += DefaultQueryBuilder.SPACE
      this.buildConditionGroup(havingConditions, statement)
    }

    const orderByFields = query.getOrderByFields()

    if (orderByFields && orderByFields.length > 0) {
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += DefaultQueryBuilder.ORDER
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += DefaultQueryBuilder.BY
      statement.sql += DefaultQueryBuilder.SPACE
      let isFirst = true

      for (const field of orderByFields) {
        if (!isFirst) {
          statement.sql += DefaultQueryBuilder.COMMA
          statement.sql += DefaultQueryBuilder.SPACE
        }

        this.buildOrderByField(field, statement)
        isFirst = false
      }
    }

    this.buildLimitOffset(query, statement)

    for (const { query: unionQuery, all } of query.getUnions()) {
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += DefaultQueryBuilder.UNION

      if (all) {
        statement.sql += DefaultQueryBuilder.SPACE
        statement.sql += 'ALL'
      }

      statement.sql += DefaultQueryBuilder.SPACE
      this.buildSelectQuery(unionQuery, statement)
    }
  }

  protected buildLimitOffset(query: SelectQuery, statement: Statement) {
    if (query.getLimit() >= 0) {
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += DefaultQueryBuilder.LIMIT
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += query.getLimit()
    }

    if (query.getOffset() >= 0) {
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += DefaultQueryBuilder.OFFSET
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += query.getOffset()
    }
  }

  /**
   * Resolves the rows an InsertQuery should write: the batch set via setRows()
   * when present, otherwise the single record set via setFields(). The same
   * code path serves single and batch inserts, so a one-element batch produces
   * exactly the SQL a single insert used to.
   */
  protected collectInsertRows(query: InsertQuery): DataSet[] {
    const rows = query.getRows()

    if (rows && rows.length > 0) {
      return rows
    }

    const fields = query.getFields()

    return fields ? [fields] : []
  }

  protected buildInsertQuery(query: InsertQuery, statement: Statement) {
    const rows = this.collectInsertRows(query)
    const columns = this.collectUpsertColumns(rows)

    statement.sql += DefaultQueryBuilder.INSERT
    statement.sql += DefaultQueryBuilder.SPACE
    statement.sql += DefaultQueryBuilder.INTO
    statement.sql += DefaultQueryBuilder.SPACE
    this.buildTable(query.getTable(), statement)
    statement.sql += DefaultQueryBuilder.SPACE
    statement.sql += DefaultQueryBuilder.PARENTHESIS_START
    columns.forEach((column, index) => {
      if (index > 0) {
        statement.sql += DefaultQueryBuilder.COMMA
        statement.sql += DefaultQueryBuilder.SPACE
      }

      this.buildFieldName(column, statement)
    })
    statement.sql += DefaultQueryBuilder.PARENTHESIS_END
    statement.sql += DefaultQueryBuilder.SPACE
    statement.sql += DefaultQueryBuilder.VALUES
    statement.sql += DefaultQueryBuilder.SPACE
    rows.forEach((row, rowIndex) => {
      if (rowIndex > 0) {
        statement.sql += DefaultQueryBuilder.COMMA
        statement.sql += DefaultQueryBuilder.SPACE
      }

      statement.sql += DefaultQueryBuilder.PARENTHESIS_START
      columns.forEach((column, columnIndex) => {
        if (columnIndex > 0) {
          statement.sql += DefaultQueryBuilder.COMMA
          statement.sql += DefaultQueryBuilder.SPACE
        }

        this.buildColumnValue(column in row ? row[column] : null, statement)
      })
      statement.sql += DefaultQueryBuilder.PARENTHESIS_END
    })
  }

  protected buildUpdateQuery(query: UpdateQuery, statement: Statement) {
    statement.sql += DefaultQueryBuilder.UPDATE
    statement.sql += DefaultQueryBuilder.SPACE
    this.buildTable(query.getTable(), statement)
    statement.sql += DefaultQueryBuilder.SPACE
    statement.sql += DefaultQueryBuilder.SET
    statement.sql += DefaultQueryBuilder.SPACE
    const fields = query.getFields()
    let isFirst = true

    for (const fieldName in fields) {
      if (!isFirst) {
        statement.sql += DefaultQueryBuilder.COMMA
        statement.sql += DefaultQueryBuilder.SPACE
      }

      statement.sql += fieldName
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += DefaultQueryBuilder.EQUALS
      statement.sql += DefaultQueryBuilder.SPACE
      this.buildColumnValue(fields[fieldName], statement)
      isFirst = false
    }

    const whereConditions = query.getWhereConditions()

    if (whereConditions && whereConditions.getConditions().length > 0) {
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += DefaultQueryBuilder.WHERE
      statement.sql += DefaultQueryBuilder.SPACE
      this.buildConditionGroup(whereConditions, statement)
    }
  }

  protected buildDeleteQuery(query: DeleteQuery, statement: Statement) {
    statement.sql += DefaultQueryBuilder.DELETE
    statement.sql += DefaultQueryBuilder.SPACE
    statement.sql += DefaultQueryBuilder.FROM
    statement.sql += DefaultQueryBuilder.SPACE
    this.buildTable(query.getTable(), statement)
    const whereConditions = query.getWhereConditions()

    if (whereConditions && whereConditions.getConditions().length > 0) {
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += DefaultQueryBuilder.WHERE
      statement.sql += DefaultQueryBuilder.SPACE
      this.buildConditionGroup(whereConditions, statement)
    }
  }

  /**
   * Builds an upsert (insert-or-update) statement. The INSERT ... VALUES part is
   * shared across engines; the conflict-resolution clause is delegated to
   * buildUpsertConflictClause, which engine-specific builders override.
   */
  protected buildUpsertQuery(query: UpsertQuery, statement: Statement) {
    const rows = query.getRows()
    const columns = this.collectUpsertColumns(rows)

    statement.sql += DefaultQueryBuilder.INSERT
    statement.sql += DefaultQueryBuilder.SPACE
    statement.sql += DefaultQueryBuilder.INTO
    statement.sql += DefaultQueryBuilder.SPACE
    this.buildTable(query.getTable(), statement)
    statement.sql += DefaultQueryBuilder.SPACE
    statement.sql += DefaultQueryBuilder.PARENTHESIS_START
    columns.forEach((column, index) => {
      if (index > 0) {
        statement.sql += DefaultQueryBuilder.COMMA
        statement.sql += DefaultQueryBuilder.SPACE
      }

      this.buildFieldName(column, statement)
    })
    statement.sql += DefaultQueryBuilder.PARENTHESIS_END
    statement.sql += DefaultQueryBuilder.SPACE
    statement.sql += DefaultQueryBuilder.VALUES
    statement.sql += DefaultQueryBuilder.SPACE
    rows.forEach((row, rowIndex) => {
      if (rowIndex > 0) {
        statement.sql += DefaultQueryBuilder.COMMA
        statement.sql += DefaultQueryBuilder.SPACE
      }

      statement.sql += DefaultQueryBuilder.PARENTHESIS_START
      columns.forEach((column, columnIndex) => {
        if (columnIndex > 0) {
          statement.sql += DefaultQueryBuilder.COMMA
          statement.sql += DefaultQueryBuilder.SPACE
        }

        this.buildColumnValue(column in row ? row[column] : null, statement)
      })
      statement.sql += DefaultQueryBuilder.PARENTHESIS_END
    })

    this.buildUpsertConflictClause(query, columns, statement)
  }

  /**
   * Resolves the columns updated on conflict: the explicit list when provided,
   * otherwise every inserted column that is not part of the conflict target
   * (Eloquent's default behaviour).
   */
  protected resolveUpsertUpdateColumns(query: UpsertQuery, columns: string[]): string[] {
    const updateColumns = query.getUpdateColumns()

    if (updateColumns) {
      return updateColumns
    }

    const conflictColumns = query.getConflictColumns()

    return columns.filter((column) => !conflictColumns.includes(column))
  }

  /**
   * Conflict-resolution clause for PostgreSQL and SQLite, which share the
   * `ON CONFLICT (...) DO UPDATE SET col = EXCLUDED.col` syntax. MySQL overrides
   * this with its `ON DUPLICATE KEY UPDATE` form.
   */
  protected buildUpsertConflictClause(query: UpsertQuery, columns: string[], statement: Statement) {
    const conflictColumns = query.getConflictColumns()
    const updateColumns = this.resolveUpsertUpdateColumns(query, columns)

    statement.sql += DefaultQueryBuilder.SPACE
    statement.sql += DefaultQueryBuilder.ON_CONFLICT
    statement.sql += DefaultQueryBuilder.SPACE
    statement.sql += DefaultQueryBuilder.PARENTHESIS_START
    conflictColumns.forEach((column, index) => {
      if (index > 0) {
        statement.sql += DefaultQueryBuilder.COMMA
        statement.sql += DefaultQueryBuilder.SPACE
      }

      this.buildFieldName(column, statement)
    })
    statement.sql += DefaultQueryBuilder.PARENTHESIS_END
    statement.sql += DefaultQueryBuilder.SPACE

    if (updateColumns.length === 0) {
      statement.sql += DefaultQueryBuilder.DO_NOTHING

      return
    }

    statement.sql += DefaultQueryBuilder.DO_UPDATE_SET
    statement.sql += DefaultQueryBuilder.SPACE
    updateColumns.forEach((column, index) => {
      if (index > 0) {
        statement.sql += DefaultQueryBuilder.COMMA
        statement.sql += DefaultQueryBuilder.SPACE
      }

      this.buildFieldName(column, statement)
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += DefaultQueryBuilder.EQUALS
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += DefaultQueryBuilder.EXCLUDED
      statement.sql += DefaultQueryBuilder.POINT
      this.buildFieldName(column, statement)
    })
  }

  /** Collects the ordered, de-duplicated set of columns present across all rows. */
  protected collectUpsertColumns(rows: DataSet[]): string[] {
    const columns: string[] = []
    const seen = new Set<string>()

    for (const row of rows) {
      for (const column of Object.keys(row)) {
        if (!seen.has(column)) {
          seen.add(column)
          columns.push(column)
        }
      }
    }

    return columns
  }

  /**
   * Outputs a plain identifier (column name). Override in engine-specific
   * subclasses to add quoting (e.g. backticks for MySQL).
   */
  protected buildFieldName(name: string, statement: Statement) {
    statement.sql += name
  }

  /**
   * Parses and outputs a raw string field, supporting:
   *   - 'field'              → plain identifier
   *   - 'table.field'        → quoted table + field (engine-aware)
   *   - 'FUNC(field)'        → function call, field parsed recursively
   *   - 'FUNC(table.field)'  → function call with qualified field
   *   - Any string with spaces is treated as a raw SQL expression and
   *     passed through as-is (e.g. 'COUNT(*) AS total').
   */
  protected buildRawFieldString(raw: string, statement: Statement) {
    if (raw.includes(' ')) {
      statement.sql += raw

      return
    }

    const funcMatch = raw.match(/^(\w+)\((.+)\)$/)

    if (funcMatch) {
      statement.sql += funcMatch[1].toUpperCase()
      statement.sql += DefaultQueryBuilder.PARENTHESIS_START
      this.buildRawFieldString(funcMatch[2].trim(), statement)
      statement.sql += DefaultQueryBuilder.PARENTHESIS_END

      return
    }

    if (raw === DefaultQueryBuilder.ALL) {
      statement.sql += DefaultQueryBuilder.ALL

      return
    }

    const dotIndex = raw.indexOf('.')

    if (dotIndex !== -1) {
      this.buildTable(raw.substring(0, dotIndex), statement)
      statement.sql += DefaultQueryBuilder.POINT
      this.buildFieldName(raw.substring(dotIndex + 1), statement)

      return
    }

    this.buildFieldName(raw, statement)
  }

  protected buildSelectField(field: SelectField, statement: Statement) {
    if (typeof field === 'string' || field instanceof String) {
      this.buildRawFieldString(field as string, statement)
    } else {
      if (field.function) {
        statement.sql += field.function.toUpperCase()
        statement.sql += DefaultQueryBuilder.PARENTHESIS_START
      }

      if (field.table) {
        this.buildTable(field.table, statement)
        statement.sql += DefaultQueryBuilder.POINT
      }

      this.buildFieldName(field.name, statement)

      if (field.function) {
        statement.sql += DefaultQueryBuilder.PARENTHESIS_END
      }

      if (field.alias) {
        statement.sql += DefaultQueryBuilder.SPACE
        statement.sql += DefaultQueryBuilder.AS
        statement.sql += DefaultQueryBuilder.SPACE
        statement.sql += field.alias
      }
    }
  }

  protected buildOrderByField(field: OrderByField, statement: Statement) {
    if (typeof field === 'string' || field instanceof String) {
      this.buildRawFieldString(field as string, statement)
    } else if (field instanceof Array) {
      const [fieldName, direction] = field

      statement.sql += fieldName
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += direction
    } else {
      if (field.table) {
        this.buildTable(field.table, statement)
        statement.sql += DefaultQueryBuilder.POINT
      }

      this.buildFieldName(field.name, statement)

      if (field.direction) {
        statement.sql += DefaultQueryBuilder.SPACE
        statement.sql += field.direction
      }
    }
  }

  protected buildField(field: Field, statement: Statement) {
    if (typeof field === 'string' || field instanceof String) {
      this.buildRawFieldString(field as string, statement)
    } else {
      if (field.table) {
        this.buildTable(field.table, statement)
        statement.sql += DefaultQueryBuilder.POINT
      }

      this.buildFieldName(field.name, statement)
    }
  }

  protected buildCondition(condition: Condition, statement: Statement) {
    if (typeof condition === 'string' || condition instanceof String) {
      statement.sql += condition
    } else if (condition instanceof ConditionGroup) {
      this.buildConditionGroup(condition, statement)
    } else if ('exists' in condition) {
      if (condition.not) {
        statement.sql += DefaultQueryBuilder.NOT
        statement.sql += DefaultQueryBuilder.SPACE
      }

      statement.sql += DefaultQueryBuilder.EXISTS
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += DefaultQueryBuilder.PARENTHESIS_START
      this.buildSelectQuery(condition.exists, statement)
      statement.sql += DefaultQueryBuilder.PARENTHESIS_END
    } else if ('sql' in condition) {
      const { sql, bindings } = condition

      statement.sql += sql
      statement.bindings.push(...bindings)
    } else if ('column' in condition) {
      const { field, operator, column } = condition as ColumnCondition

      this.buildField(field, statement)
      statement.sql += DefaultQueryBuilder.SPACE
      this.buildOperator(operator, statement)
      statement.sql += DefaultQueryBuilder.SPACE
      this.buildField(column, statement)
    } else if ('field' in condition) {
      const { field, operator, value } = condition

      this.buildField(field, statement)
      statement.sql += DefaultQueryBuilder.SPACE

      if (value === null && (operator === '=' || operator === '!=' || operator === '<>')) {
        statement.sql += DefaultQueryBuilder.IS
        statement.sql += DefaultQueryBuilder.SPACE

        if (operator !== '=') {
          statement.sql += DefaultQueryBuilder.NOT
          statement.sql += DefaultQueryBuilder.SPACE
        }

        statement.sql += DefaultQueryBuilder.NULL
      } else if (operator && /^(NOT\s+)?BETWEEN$/i.test(operator) && Array.isArray(value) && value.length === 2) {
        this.buildOperator(operator, statement)
        statement.sql += DefaultQueryBuilder.SPACE
        this.buildSingleValue(value[0], statement)
        statement.sql += DefaultQueryBuilder.SPACE
        statement.sql += DefaultQueryBuilder.AND
        statement.sql += DefaultQueryBuilder.SPACE
        this.buildSingleValue(value[1], statement)
      } else if (operator) {
        this.buildOperator(operator, statement)
        statement.sql += DefaultQueryBuilder.SPACE

        if (value != undefined) {
          this.buildValue(value, statement)
        }
      }
    }
  }

  protected buildConditionGroup(conditionGroup: ConditionGroup, statement: Statement) {
    let isFirst = true

    for (const { connector, condition } of conditionGroup.getConditions()) {
      if (!isFirst) {
        statement.sql += DefaultQueryBuilder.SPACE
        statement.sql += connector == ConditionConnector.AND ? DefaultQueryBuilder.AND : DefaultQueryBuilder.OR
        statement.sql += DefaultQueryBuilder.SPACE
      }

      if (condition instanceof ConditionGroup) {
        statement.sql += DefaultQueryBuilder.PARENTHESIS_START
        this.buildConditionGroup(condition, statement)
        statement.sql += DefaultQueryBuilder.PARENTHESIS_END
      } else {
        this.buildCondition(condition, statement)
      }

      isFirst = false
    }
  }

  protected buildJoin(join: Join, statement: Statement) {
    const { type, table, condition, alias } = join

    switch (type) {
      case JoinType.INNER_JOIN:
        statement.sql += DefaultQueryBuilder.INNER
        statement.sql += DefaultQueryBuilder.SPACE
        break
      case JoinType.OUTER_JOIN:
        statement.sql += DefaultQueryBuilder.OUTER
        statement.sql += DefaultQueryBuilder.SPACE
        break
      case JoinType.LEFT_JOIN:
        statement.sql += DefaultQueryBuilder.LEFT
        statement.sql += DefaultQueryBuilder.SPACE
        break
      case JoinType.RIGHT_JOIN:
        statement.sql += DefaultQueryBuilder.RIGHT
        statement.sql += DefaultQueryBuilder.SPACE
        break
      case JoinType.CROSS_JOIN:
        statement.sql += DefaultQueryBuilder.CROSS
        statement.sql += DefaultQueryBuilder.SPACE
        break
    }

    statement.sql += DefaultQueryBuilder.JOIN
    statement.sql += DefaultQueryBuilder.SPACE
    this.buildTable(table, statement)

    if (alias) {
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += DefaultQueryBuilder.AS
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += alias
    }

    statement.sql += DefaultQueryBuilder.SPACE
    statement.sql += DefaultQueryBuilder.ON
    statement.sql += DefaultQueryBuilder.SPACE
    this.buildConditionGroup(condition, statement)
  }

  protected buildTable(table: QueryTable, statement: Statement) {
    if (typeof table === 'string' || table instanceof String) {
      statement.sql += table
    } else {
      if (table.schema) {
        statement.sql += table.schema
        statement.sql += DefaultQueryBuilder.POINT
      }

      statement.sql += table.name
    }
  }

  protected buildValue(value: any, statement: Statement) {
    if (value === null || value === undefined) {
      this.buildSingleValue(value, statement)
    } else if (Array.isArray(value)) {
      this.buildArrayValue(value, statement)
    } else if (value instanceof SelectQuery) {
      statement.sql += DefaultQueryBuilder.PARENTHESIS_START
      this.buildSelectQuery(value, statement)
      statement.sql += DefaultQueryBuilder.PARENTHESIS_END
    } else if (value instanceof Date) {
      this.buildSingleValue(value, statement)
    } else if (typeof value === 'object') {
      this.buildField(value, statement)
    } else {
      this.buildSingleValue(value, statement)
    }
  }

  /**
   * Builds a column value for INSERT/UPDATE statements.
   *
   * Unlike buildValue, arrays are treated as a single opaque binding and are
   * never expanded into a list of placeholders. This lets the underlying driver
   * (e.g. node-postgres) serialize native array types (INT[], TEXT[], JSONB…)
   * correctly without interference from the query builder.
   */
  protected buildColumnValue(value: any, statement: Statement) {
    if (value instanceof SelectQuery) {
      statement.sql += DefaultQueryBuilder.PARENTHESIS_START
      this.buildSelectQuery(value, statement)
      statement.sql += DefaultQueryBuilder.PARENTHESIS_END
    } else if (!Array.isArray(value) && value !== null && value !== undefined && typeof value === 'object') {
      this.buildField(value, statement)
    } else {
      this.buildSingleValue(value, statement)
    }
  }

  protected buildArrayValue(value: Array<any>, statement: Statement) {
    statement.sql += DefaultQueryBuilder.PARENTHESIS_START
    let isFirst = true

    for (const valueItem of value) {
      if (!isFirst) {
        statement.sql += DefaultQueryBuilder.COMMA
        statement.sql += DefaultQueryBuilder.SPACE
      }

      this.buildSingleValue(valueItem, statement)
      isFirst = false
    }

    statement.sql += DefaultQueryBuilder.PARENTHESIS_END
  }

  protected buildSingleValue(value: any, statement: Statement) {
    statement.sql += DefaultQueryBuilder.WILDCARD
    statement.bindings.push(value)
  }

  protected buildOperator(operator: string, statement: Statement) {
    statement.sql += operator.toUpperCase()
  }
}
