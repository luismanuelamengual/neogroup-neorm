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
      sql: 'SELECT * FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1',
      bindings: [table]
    }
  }
}
