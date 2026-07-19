import { DB } from '../DB'
import { Blueprint } from './Blueprint'
import { SchemaExpression } from './ColumnDefinition'
import { SchemaBuilder } from './SchemaBuilder'

/**
 * Static, database-agnostic schema facade — the neorm equivalent of Laravel's
 * `Schema`. It mirrors the same fluent Blueprint API and dispatches to the
 * active DataSource, so the very same migration runs on PostgreSQL, MySQL and
 * SQLite:
 *
 *   Schema.create('oauth_access_tokens', (table) => {
 *     table.string('id', 100).primary()
 *     table.unsignedBigInteger('userId').index()
 *     table.integer('clientId')
 *     table.text('scopes').nullable()
 *     table.boolean('revoked').default(false)
 *     table.dateTime('expiresAt').nullable()
 *   })
 *
 *   Schema.table('oauth_access_tokens', (table) => {
 *     table.foreign('userId').references('id').on('users').onDelete('cascade')
 *     table.dropColumn('scopes')
 *     table.float('weight')
 *   })
 *
 *   Schema.drop('legacy_table')
 *   Schema.dropIfExists('temp_table')
 */
export abstract class Schema {
  /** Targets a specific registered source instead of the active one. */
  public static connection(sourceName: string): SchemaBuilder {
    return new SchemaBuilder(DB.source(sourceName))
  }

  public static create(table: string, callback: (table: Blueprint) => void): Promise<void> {
    return this.builder().create(table, callback)
  }

  public static createIfNotExists(table: string, callback: (table: Blueprint) => void): Promise<void> {
    return this.builder().createIfNotExists(table, callback)
  }

  public static table(table: string, callback: (table: Blueprint) => void): Promise<void> {
    return this.builder().table(table, callback)
  }

  public static drop(table: string): Promise<void> {
    return this.builder().drop(table)
  }

  public static dropIfExists(table: string): Promise<void> {
    return this.builder().dropIfExists(table)
  }

  public static rename(from: string, to: string): Promise<void> {
    return this.builder().rename(from, to)
  }

  public static hasTable(table: string): Promise<boolean> {
    return this.builder().hasTable(table)
  }

  public static hasColumn(table: string, column: string): Promise<boolean> {
    return this.builder().hasColumn(table, column)
  }

  /** Wraps a raw SQL fragment for use as a column default. */
  public static raw(sql: string): SchemaExpression {
    return new SchemaExpression(sql)
  }

  private static builder(): SchemaBuilder {
    return new SchemaBuilder(DB.getActiveSource())
  }
}
