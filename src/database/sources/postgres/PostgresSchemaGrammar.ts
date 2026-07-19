import { DefaultSchemaGrammar } from '../../schema'

/**
 * PostgreSQL schema grammar. DefaultSchemaGrammar already emits standard,
 * PostgreSQL-compatible DDL (double-quoted identifiers, SERIAL/BIGSERIAL
 * auto-increment, native INTEGER[] and JSONB, `true`/`false` booleans), so only
 * the table-exists probe needs the engine's `$n` placeholder style.
 */
export class PostgresSchemaGrammar extends DefaultSchemaGrammar {
  public compileTableExists(table: string): { sql: string; bindings: any[] } {
    return {
      sql: 'SELECT * FROM information_schema.tables WHERE table_schema = current_schema() AND lower(table_name) = lower($1)',
      bindings: [table]
    }
  }

  public compileColumnExists(table: string, column: string): { sql: string; bindings: any[] } {
    // Identifiers are emitted unquoted, so PostgreSQL folds them to lower case on
    // creation (e.g. `userId` is stored as `userid`). information_schema keeps the
    // real (folded) name, so the probe must compare case-insensitively — otherwise
    // hasColumn('t', 'userId') never matches the stored 'userid'.
    return {
      sql:
        'SELECT * FROM information_schema.columns WHERE table_schema = current_schema() ' +
        'AND lower(table_name) = lower($1) AND lower(column_name) = lower($2)',
      bindings: [table, column]
    }
  }

  /**
   * Adds the PostgreSQL `USING <method>` clause (e.g. GIN for INT[] columns)
   * when an index declares one via `table.index(...).using('gin')`. Falls back
   * to the default B-tree DDL when no method is set.
   */
  protected createIndexSql(
    table: string,
    columns: string[],
    name?: string,
    unique = false,
    ifNotExists = false,
    using?: string
  ): string {
    const base = super.createIndexSql(table, columns, name, unique, ifNotExists, using)

    if (!using) {
      return base
    }

    // Insert `USING <method>` between the table reference and the column list:
    //   CREATE INDEX name ON table USING gin (columns)
    return base.replace(/ \(([^(]*)\)$/, ` USING ${using.toUpperCase()} ($1)`)
  }
}
