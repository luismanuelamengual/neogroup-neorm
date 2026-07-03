import { ColumnDefinition, DefaultSchemaGrammar, SchemaCommand } from '../../schema'

/**
 * MySQL schema grammar. Differs from the standard grammar in identifier quoting
 * (backticks), UNSIGNED/AUTO_INCREMENT syntax, TINYINT(1) booleans, JSON in
 * place of native arrays, and the single-statement MODIFY COLUMN / DROP FOREIGN
 * KEY / DROP PRIMARY KEY forms.
 *
 * Unlike PostgreSQL and SQLite, MySQL's `CREATE INDEX` has no `IF NOT EXISTS`
 * clause, so `createIndexSql` ignores that flag here: a `Schema.createIfNotExists`
 * table re-run against MySQL is idempotent for the table itself, but re-running
 * it after the index already exists still fails with a duplicate-key-name error.
 * Track applied migrations (skip `up()` once it already ran) rather than relying
 * on index-level idempotency on this engine.
 */
export class MysqlSchemaGrammar extends DefaultSchemaGrammar {
  protected createIndexSql(table: string, columns: string[], name?: string, unique = false): string {
    return super.createIndexSql(table, columns, name, unique, false)
  }

  protected wrap(name: string): string {
    return '`' + name.replace(/`/g, '``') + '`'
  }

  protected getAutoIncrementType(column: ColumnDefinition): string {
    const base = column.type === 'bigIncrements' ? 'BIGINT' : 'INT'

    return `${base} UNSIGNED AUTO_INCREMENT PRIMARY KEY`
  }

  protected modifyUnsigned(column: ColumnDefinition): string {
    return column.isUnsigned ? ' UNSIGNED' : ''
  }

  protected booleanLiteral(value: boolean): string {
    return value ? '1' : '0'
  }

  protected arrayLiteral(value: any[]): string {
    return `'${JSON.stringify(value)}'`
  }

  protected getType(column: ColumnDefinition): string {
    switch (column.type) {
      case 'boolean':
        return 'TINYINT(1)'
      case 'float':
        return 'FLOAT'
      case 'double':
        return 'DOUBLE'
      case 'dateTime':
        return 'DATETIME'
      case 'json':
      case 'jsonb':
      case 'integerArray':
        return 'JSON'
      case 'uuid':
        return 'CHAR(36)'
      case 'text':
        return 'TEXT'
      case 'mediumText':
        return 'MEDIUMTEXT'
      case 'longText':
        return 'LONGTEXT'
      case 'tinyInteger':
        return 'TINYINT'
      case 'smallInteger':
        return 'SMALLINT'
      case 'integer':
      case 'unsignedInteger':
        return 'INT'
      case 'increments':
        return 'INT'
      case 'bigIncrements':
        return 'BIGINT'
      default:
        return super.getType(column)
    }
  }

  protected compileChangeColumn(table: string, column: ColumnDefinition): string[] {
    return [`ALTER TABLE ${this.wrapTable(table)} MODIFY COLUMN ${this.getColumnSql(column)}`]
  }

  protected compileDropIndex(table: string, index: string): string {
    return `ALTER TABLE ${this.wrapTable(table)} DROP INDEX ${this.wrap(index)}`
  }

  protected compileCommand(table: string, command: SchemaCommand): string[] {
    switch (command.name) {
      case 'dropForeign':
        return [`ALTER TABLE ${this.wrapTable(table)} DROP FOREIGN KEY ${this.wrap(command.index)}`]
      case 'dropPrimary':
        return [`ALTER TABLE ${this.wrapTable(table)} DROP PRIMARY KEY`]
      default:
        return super.compileCommand(table, command)
    }
  }

  public compileRename(from: string, to: string): string {
    return `RENAME TABLE ${this.wrapTable(from)} TO ${this.wrapTable(to)}`
  }

  public compileTableExists(table: string): { sql: string; bindings: any[] } {
    return {
      sql: 'SELECT * FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
      bindings: [table]
    }
  }
}
