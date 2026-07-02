import { DataSource } from '../DataSource'
import { Blueprint } from './Blueprint'
import { SchemaGrammar } from './grammars'

/**
 * Runs schema operations against a specific DataSource. It builds a Blueprint,
 * lets the caller describe the table through the closure, asks the source's
 * SchemaGrammar to compile it to engine-specific DDL, and executes the
 * resulting statements (honouring any in-progress transaction on the source).
 *
 * Usually reached through the static `Schema` facade rather than instantiated
 * directly.
 */
export class SchemaBuilder {
  constructor(private readonly source: DataSource) {}

  private get grammar(): SchemaGrammar {
    return this.source.getSchemaGrammar()
  }

  /** CREATE TABLE. */
  public async create(table: string, callback: (table: Blueprint) => void): Promise<void> {
    const blueprint = new Blueprint(table, 'create')

    callback(blueprint)
    await this.build(this.grammar.compileCreate(blueprint))
  }

  /** CREATE TABLE IF NOT EXISTS. */
  public async createIfNotExists(table: string, callback: (table: Blueprint) => void): Promise<void> {
    const blueprint = new Blueprint(table, 'create', true)

    callback(blueprint)
    await this.build(this.grammar.compileCreate(blueprint))
  }

  /** ALTER TABLE — add/drop/modify columns, indexes and foreign keys. */
  public async table(table: string, callback: (table: Blueprint) => void): Promise<void> {
    const blueprint = new Blueprint(table, 'alter')

    callback(blueprint)
    await this.build(this.grammar.compileAlter(blueprint))
  }

  /** DROP TABLE. */
  public async drop(table: string): Promise<void> {
    await this.build([this.grammar.compileDrop(table)])
  }

  /** DROP TABLE IF EXISTS. */
  public async dropIfExists(table: string): Promise<void> {
    await this.build([this.grammar.compileDropIfExists(table)])
  }

  /** RENAME TABLE. */
  public async rename(from: string, to: string): Promise<void> {
    await this.build([this.grammar.compileRename(from, to)])
  }

  /** Whether the given table exists. */
  public async hasTable(table: string): Promise<boolean> {
    const { sql, bindings } = this.grammar.compileTableExists(table)
    const rows = await this.source.query(sql, bindings)

    return rows.length > 0
  }

  private async build(statements: string[]): Promise<void> {
    for (const statement of statements) {
      await this.source.execute(statement)
    }
  }
}
