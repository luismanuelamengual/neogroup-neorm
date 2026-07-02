import { Blueprint } from '../Blueprint'
import { ColumnDefinition, SchemaExpression } from '../ColumnDefinition'
import { ForeignCommand, SchemaCommand } from '../Command'
import { SchemaGrammar } from './SchemaGrammar'

/**
 * Standard-SQL schema grammar. Its output targets PostgreSQL (the most
 * ANSI-faithful of the supported engines), so PostgresSchemaGrammar barely has
 * to override anything, while the MySQL and SQLite grammars adjust the pieces
 * that differ (identifier quoting, auto-increment syntax, boolean/array types).
 */
export class DefaultSchemaGrammar extends SchemaGrammar {
  // ── Top-level compilers ─────────────────────────────────────────────────────

  public compileCreate(blueprint: Blueprint): string[] {
    const columns = blueprint.getColumns().map((column) => this.getColumnSql(column))
    const constraints = this.getTableConstraints(blueprint)
    const body = [...columns, ...constraints].join(', ')
    const ifNotExists = blueprint.wantsIfNotExists() ? 'IF NOT EXISTS ' : ''
    const statements = [`CREATE TABLE ${ifNotExists}${this.wrapTable(blueprint.getTable())} (${body})`]

    for (const index of this.collectIndexes(blueprint)) {
      statements.push(this.createIndexSql(blueprint.getTable(), index.columns, index.name))
    }

    return statements
  }

  public compileAlter(blueprint: Blueprint): string[] {
    const table = blueprint.getTable()
    const statements: string[] = []

    for (const column of blueprint.getColumns()) {
      if (column.isChange) {
        statements.push(...this.compileChangeColumn(table, column))
      } else {
        statements.push(`ALTER TABLE ${this.wrapTable(table)} ADD COLUMN ${this.getColumnSql(column)}`)
      }

      if (column.isUnique) {
        statements.push(this.createIndexSql(table, [column.name], undefined, true))
      }

      if (column.isIndex) {
        statements.push(this.createIndexSql(table, [column.name]))
      }
    }

    for (const command of blueprint.getCommands()) {
      statements.push(...this.compileCommand(table, command))
    }

    return statements
  }

  public compileDrop(table: string): string {
    return `DROP TABLE ${this.wrapTable(table)}`
  }

  public compileDropIfExists(table: string): string {
    return `DROP TABLE IF EXISTS ${this.wrapTable(table)}`
  }

  public compileRename(from: string, to: string): string {
    return `ALTER TABLE ${this.wrapTable(from)} RENAME TO ${this.wrapTable(to)}`
  }

  public compileTableExists(table: string): { sql: string; bindings: any[] } {
    return { sql: 'SELECT * FROM information_schema.tables WHERE table_name = ?', bindings: [table] }
  }

  // ── Alter-command dispatch ──────────────────────────────────────────────────

  protected compileCommand(table: string, command: SchemaCommand): string[] {
    switch (command.name) {
      case 'foreign':
        return [`ALTER TABLE ${this.wrapTable(table)} ADD ${this.foreignClause(table, command, true)}`]
      case 'index':
        return [this.createIndexSql(table, command.columns, command.index)]
      case 'unique':
        return [this.createIndexSql(table, command.columns, command.index, true)]
      case 'primary':
        return [`ALTER TABLE ${this.wrapTable(table)} ADD PRIMARY KEY (${this.columnize(command.columns)})`]
      case 'dropColumn':
        return command.columns.map((c) => `ALTER TABLE ${this.wrapTable(table)} DROP COLUMN ${this.wrap(c)}`)
      case 'renameColumn':
        return [`ALTER TABLE ${this.wrapTable(table)} RENAME COLUMN ${this.wrap(command.from)} TO ${this.wrap(command.to)}`]
      case 'dropIndex':
      case 'dropUnique':
        return [this.compileDropIndex(table, command.index)]
      case 'dropForeign':
        return [`ALTER TABLE ${this.wrapTable(table)} DROP CONSTRAINT ${this.wrap(command.index)}`]
      case 'dropPrimary':
        return [`ALTER TABLE ${this.wrapTable(table)} DROP CONSTRAINT ${this.wrap(command.index ?? `${table}_pkey`)}`]
      default:
        return []
    }
  }

  protected compileDropIndex(_table: string, index: string): string {
    return `DROP INDEX ${this.wrap(index)}`
  }

  /**
   * PostgreSQL changes a column with a sequence of ALTER COLUMN statements.
   * Engines with a single MODIFY/CHANGE statement (MySQL) override this.
   */
  protected compileChangeColumn(table: string, column: ColumnDefinition): string[] {
    const prefix = `ALTER TABLE ${this.wrapTable(table)} ALTER COLUMN ${this.wrap(column.name)}`
    const statements = [`${prefix} TYPE ${this.getType(column)}`]

    statements.push(`${prefix} ${column.isNullable ? 'DROP NOT NULL' : 'SET NOT NULL'}`)

    if (column.hasDefault || column.useCurrentTimestamp) {
      statements.push(`${prefix} SET DEFAULT ${this.getDefaultLiteral(column)}`)
    }

    return statements
  }

  // ── Column SQL ──────────────────────────────────────────────────────────────

  protected getColumnSql(column: ColumnDefinition): string {
    if (column.isAutoIncrement) {
      return `${this.wrap(column.name)} ${this.getAutoIncrementType(column)}`
    }

    let sql = `${this.wrap(column.name)} ${this.getType(column)}`

    sql += this.modifyUnsigned(column)
    sql += this.modifyNullable(column)
    sql += this.modifyDefault(column)

    return sql
  }

  protected getAutoIncrementType(column: ColumnDefinition): string {
    return column.type === 'bigIncrements' ? 'BIGSERIAL PRIMARY KEY' : 'SERIAL PRIMARY KEY'
  }

  // ── Modifiers ───────────────────────────────────────────────────────────────

  protected modifyNullable(column: ColumnDefinition): string {
    return column.isNullable ? '' : ' NOT NULL'
  }

  protected modifyUnsigned(_column: ColumnDefinition): string {
    return '' // PostgreSQL has no UNSIGNED
  }

  protected modifyDefault(column: ColumnDefinition): string {
    if (!column.hasDefault && !column.useCurrentTimestamp) {
      return ''
    }

    return ` DEFAULT ${this.getDefaultLiteral(column)}`
  }

  protected getDefaultLiteral(column: ColumnDefinition): string {
    if (column.useCurrentTimestamp) {
      return 'CURRENT_TIMESTAMP'
    }

    return this.formatDefaultValue(column.defaultValue)
  }

  protected formatDefaultValue(value: any): string {
    if (value instanceof SchemaExpression) {
      return value.value
    }

    if (value === null || value === undefined) {
      return 'NULL'
    }

    if (typeof value === 'boolean') {
      return this.booleanLiteral(value)
    }

    if (typeof value === 'number') {
      return String(value)
    }

    if (Array.isArray(value)) {
      return this.arrayLiteral(value)
    }

    return `'${String(value).replace(/'/g, "''")}'`
  }

  protected booleanLiteral(value: boolean): string {
    return value ? 'true' : 'false'
  }

  protected arrayLiteral(value: any[]): string {
    return `'{${value.join(',')}}'`
  }

  // ── Types ───────────────────────────────────────────────────────────────────

  protected getType(column: ColumnDefinition): string {
    switch (column.type) {
      case 'char':
        return `CHAR(${column.length ?? 255})`
      case 'string':
        return `VARCHAR(${column.length ?? 255})`
      case 'text':
      case 'mediumText':
      case 'longText':
        return 'TEXT'
      case 'integer':
      case 'unsignedInteger':
        return 'INTEGER'
      case 'bigInteger':
      case 'unsignedBigInteger':
        return 'BIGINT'
      case 'smallInteger':
        return 'SMALLINT'
      case 'tinyInteger':
        return 'SMALLINT'
      case 'increments':
        return 'SERIAL'
      case 'bigIncrements':
        return 'BIGSERIAL'
      case 'boolean':
        return 'BOOLEAN'
      case 'float':
        return 'REAL'
      case 'double':
        return 'DOUBLE PRECISION'
      case 'decimal':
        return `NUMERIC(${column.total ?? 8}, ${column.places ?? 2})`
      case 'date':
        return 'DATE'
      case 'dateTime':
      case 'timestamp':
        return 'TIMESTAMP'
      case 'time':
        return 'TIME'
      case 'json':
        return 'JSON'
      case 'jsonb':
        return 'JSONB'
      case 'uuid':
        return 'UUID'
      case 'integerArray':
        return 'INTEGER[]'
      default:
        throw new Error(`Unsupported column type "${column.type}"`)
    }
  }

  // ── Constraints & indexes ───────────────────────────────────────────────────

  protected getTableConstraints(blueprint: Blueprint): string[] {
    const constraints: string[] = []
    const primaryColumns = this.collectPrimaryColumns(blueprint)

    if (primaryColumns.length > 0) {
      constraints.push(`PRIMARY KEY (${this.columnize(primaryColumns)})`)
    }

    for (const group of this.collectUniqueGroups(blueprint)) {
      const name = group.name ? `CONSTRAINT ${this.wrap(group.name)} ` : ''

      constraints.push(`${name}UNIQUE (${this.columnize(group.columns)})`)
    }

    for (const command of blueprint.getCommands()) {
      if (command.name === 'foreign') {
        constraints.push(this.foreignClause(blueprint.getTable(), command))
      }
    }

    return constraints
  }

  /** Primary-key columns, excluding auto-increment columns (their PK is inline). */
  protected collectPrimaryColumns(blueprint: Blueprint): string[] {
    const columns: string[] = []

    for (const column of blueprint.getColumns()) {
      if (column.isPrimary && !column.isAutoIncrement) {
        columns.push(column.name)
      }
    }

    for (const command of blueprint.getCommands()) {
      if (command.name === 'primary') {
        columns.push(...command.columns)
      }
    }

    return columns
  }

  protected collectUniqueGroups(blueprint: Blueprint): Array<{ columns: string[]; name?: string }> {
    const groups: Array<{ columns: string[]; name?: string }> = []

    for (const column of blueprint.getColumns()) {
      if (column.isUnique) {
        groups.push({ columns: [column.name] })
      }
    }

    for (const command of blueprint.getCommands()) {
      if (command.name === 'unique') {
        groups.push({ columns: command.columns, name: command.index })
      }
    }

    return groups
  }

  protected collectIndexes(blueprint: Blueprint): Array<{ columns: string[]; name?: string }> {
    const indexes: Array<{ columns: string[]; name?: string }> = []

    for (const column of blueprint.getColumns()) {
      if (column.isIndex) {
        indexes.push({ columns: [column.name] })
      }
    }

    for (const command of blueprint.getCommands()) {
      if (command.name === 'index') {
        indexes.push({ columns: command.columns, name: command.index })
      }
    }

    return indexes
  }

  protected createIndexSql(table: string, columns: string[], name?: string, unique = false): string {
    const indexName = name ?? this.generateIndexName(table, columns, unique ? 'unique' : 'index')

    return `CREATE ${unique ? 'UNIQUE ' : ''}INDEX ${this.wrap(indexName)} ON ${this.wrapTable(table)} (${this.columnize(
      columns
    )})`
  }

  protected foreignClause(table: string, command: ForeignCommand, forceName = false): string {
    const references = command.references ?? ['id']
    let sql = ''

    if (command.index || forceName) {
      const name = command.index ?? this.generateIndexName(table, command.columns, 'foreign')

      sql += `CONSTRAINT ${this.wrap(name)} `
    }

    sql += `FOREIGN KEY (${this.columnize(command.columns)}) REFERENCES ${this.wrapTable(command.on ?? '')} (${this.columnize(
      references
    )})`

    if (command.onDelete) {
      sql += ` ON DELETE ${command.onDelete.toUpperCase()}`
    }

    if (command.onUpdate) {
      sql += ` ON UPDATE ${command.onUpdate.toUpperCase()}`
    }

    return sql
  }

  protected generateIndexName(table: string, columns: string[], type: string): string {
    return `${table}_${columns.join('_')}_${type}`.toLowerCase()
  }

  // ── Identifier helpers ──────────────────────────────────────────────────────

  protected columnize(columns: string[]): string {
    return columns.map((column) => this.wrap(column)).join(', ')
  }

  protected wrap(name: string): string {
    return `"${name.replace(/"/g, '""')}"`
  }

  protected wrapTable(table: string): string {
    return this.wrap(table)
  }
}
