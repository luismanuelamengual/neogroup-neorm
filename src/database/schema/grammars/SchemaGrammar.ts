import { Blueprint } from '../Blueprint'

/**
 * Translates an engine-agnostic Blueprint into the concrete DDL of a specific
 * database engine. Mirrors the role of Laravel's schema grammars: the Blueprint
 * describes *what* the table looks like, the grammar decides *how* to spell it
 * for PostgreSQL, MySQL or SQLite.
 *
 * Each method returns one or more ready-to-run SQL statements (no bindings —
 * DDL uses inline literals across all supported engines).
 */
export abstract class SchemaGrammar {
  /** CREATE TABLE (plus any CREATE INDEX) for a fresh table. */
  public abstract compileCreate(blueprint: Blueprint): string[]

  /** ALTER TABLE / CREATE INDEX / … for an existing table. */
  public abstract compileAlter(blueprint: Blueprint): string[]

  /** DROP TABLE. */
  public abstract compileDrop(table: string): string

  /** DROP TABLE IF EXISTS. */
  public abstract compileDropIfExists(table: string): string

  /** RENAME TABLE. */
  public abstract compileRename(from: string, to: string): string

  /** A parameterised query returning whether the given table exists. */
  public abstract compileTableExists(table: string): { sql: string; bindings: any[] }

  /** A parameterised query returning whether `column` exists on `table`. */
  public abstract compileColumnExists(table: string, column: string): { sql: string; bindings: any[] }

  /**
   * How this engine removes columns from an existing table:
   *   - 'alter'   → a plain `ALTER TABLE ... DROP COLUMN` (compiled by
   *                 compileAlter). Used by PostgreSQL and MySQL.
   *   - 'rebuild' → the engine cannot drop a column that participates in an
   *                 index or foreign key via ALTER, so the SchemaBuilder must
   *                 rebuild the table (create new, copy, drop, rename). Used by
   *                 SQLite.
   */
  public dropColumnStrategy(): 'alter' | 'rebuild' {
    return 'alter'
  }
}
