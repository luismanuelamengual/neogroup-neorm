import { ColumnDefinition, DefaultSchemaGrammar, SchemaCommand } from '../../schema'

/**
 * SQLite schema grammar. SQLite has a single INTEGER type, no native boolean or
 * array types, and a very restricted ALTER TABLE. Auto-increment keys use
 * `INTEGER PRIMARY KEY AUTOINCREMENT`; booleans are stored as INTEGER (0/1);
 * arrays and JSON are stored as TEXT (JSON-encoded). Column changes and adding
 * foreign keys / dropping constraints after creation are not supported and
 * raise a clear error.
 */
export class SqliteSchemaGrammar extends DefaultSchemaGrammar {
  protected getAutoIncrementType(_column: ColumnDefinition): string {
    return 'INTEGER PRIMARY KEY AUTOINCREMENT'
  }

  protected modifyUnsigned(_column: ColumnDefinition): string {
    return '' // SQLite has no UNSIGNED
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
        return 'INTEGER'
      case 'bigInteger':
      case 'unsignedBigInteger':
        return 'INTEGER'
      case 'float':
      case 'double':
        return 'REAL'
      case 'json':
      case 'jsonb':
      case 'integerArray':
        return 'TEXT'
      case 'uuid':
        return 'TEXT'
      case 'dateTime':
      case 'timestamp':
        return 'TIMESTAMP'
      default:
        return super.getType(column)
    }
  }

  protected compileChangeColumn(_table: string, column: ColumnDefinition): string[] {
    throw new Error(
      `SQLite cannot modify column "${column.name}" in place. Recreate the table instead (create new, copy, drop, rename).`
    )
  }

  protected compileCommand(table: string, command: SchemaCommand): string[] {
    switch (command.name) {
      case 'foreign':
        throw new Error(
          'SQLite cannot add a foreign key to an existing table. Declare it inside Schema.create() instead.'
        )
      case 'dropForeign':
        throw new Error('SQLite cannot drop a foreign key from an existing table.')
      case 'dropPrimary':
        throw new Error('SQLite cannot drop a primary key from an existing table.')
      default:
        return super.compileCommand(table, command)
    }
  }

  public compileTableExists(table: string): { sql: string; bindings: any[] } {
    return {
      sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      bindings: [table]
    }
  }
}
