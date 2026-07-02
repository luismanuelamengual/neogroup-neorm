/**
 * The set of column types understood by the schema grammars. Each maps to a
 * `type<Name>` method in the grammar, so adding a new type means adding a case
 * here plus the corresponding grammar method(s).
 */
export type ColumnType =
  | 'char'
  | 'string'
  | 'text'
  | 'mediumText'
  | 'longText'
  | 'integer'
  | 'unsignedInteger'
  | 'bigInteger'
  | 'unsignedBigInteger'
  | 'smallInteger'
  | 'tinyInteger'
  | 'increments'
  | 'bigIncrements'
  | 'boolean'
  | 'float'
  | 'double'
  | 'decimal'
  | 'date'
  | 'dateTime'
  | 'time'
  | 'timestamp'
  | 'json'
  | 'jsonb'
  | 'uuid'
  | 'integerArray'

/**
 * A raw, unescaped SQL fragment. Use it when a modifier value must be emitted
 * verbatim (e.g. a function call in a DEFAULT clause):
 *
 *   table.timestamp('createdAt').default(new SchemaExpression('NOW()'))
 */
export class SchemaExpression {
  constructor(public readonly value: string) {}
}

/**
 * Fluent description of a single table column. Column methods on the Blueprint
 * (`table.string(...)`, `table.integer(...)`, …) create one of these and return
 * it, so the caller can chain modifiers exactly like Laravel:
 *
 *   table.string('email', 150).nullable().unique()
 *   table.integer('status').default(1)
 *   table.timestamp('createdAt').useCurrent()
 */
export class ColumnDefinition {
  public name: string
  public type: ColumnType
  public length?: number
  public total?: number
  public places?: number

  public isNullable = false
  public hasDefault = false
  public defaultValue: any = undefined
  public isUnsigned = false
  public isAutoIncrement = false
  public isPrimary = false
  public isUnique = false
  public isIndex = false
  public useCurrentTimestamp = false
  public useCurrentOnUpdateTimestamp = false
  public columnComment?: string
  public afterColumn?: string
  public isChange = false

  constructor(name: string, type: ColumnType, attributes: Partial<ColumnDefinition> = {}) {
    this.name = name
    this.type = type
    Object.assign(this, attributes)
  }

  /** Marks the column as nullable (Laravel columns are NOT NULL by default). */
  public nullable(value = true): this {
    this.isNullable = value

    return this
  }

  /** Explicitly marks the column NOT NULL. */
  public notNullable(): this {
    this.isNullable = false

    return this
  }

  /** Sets the column DEFAULT value. Pass a SchemaExpression for raw SQL. */
  public default(value: any): this {
    this.hasDefault = true
    this.defaultValue = value

    return this
  }

  /** Marks an integer column UNSIGNED (no-op on engines without unsigned types). */
  public unsigned(): this {
    this.isUnsigned = true

    return this
  }

  /** Marks the column auto-incrementing (implies a primary key). */
  public autoIncrement(): this {
    this.isAutoIncrement = true
    this.isPrimary = true

    return this
  }

  /** Adds this column to the table primary key. */
  public primary(): this {
    this.isPrimary = true

    return this
  }

  /** Adds a single-column UNIQUE constraint. */
  public unique(): this {
    this.isUnique = true

    return this
  }

  /** Adds a single-column index. */
  public index(): this {
    this.isIndex = true

    return this
  }

  /** Uses CURRENT_TIMESTAMP as the column default. */
  public useCurrent(): this {
    this.useCurrentTimestamp = true

    return this
  }

  /** Uses CURRENT_TIMESTAMP when the row is updated (MySQL ON UPDATE). */
  public useCurrentOnUpdate(): this {
    this.useCurrentOnUpdateTimestamp = true

    return this
  }

  /** Attaches a column comment (emitted by engines that support it). */
  public comment(comment: string): this {
    this.columnComment = comment

    return this
  }

  /** Positions the column after another one (MySQL ADD COLUMN … AFTER). */
  public after(column: string): this {
    this.afterColumn = column

    return this
  }

  /** Marks the column as a modification of an existing one (Schema.table change). */
  public change(): this {
    this.isChange = true

    return this
  }
}
