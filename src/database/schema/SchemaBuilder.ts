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

    // Engines that can't ALTER-drop a column that is indexed or part of a
    // foreign key (SQLite) rebuild the table instead. The remaining, ALTER-able
    // commands are compiled and run first, then the drop is applied by rebuild.
    if (this.grammar.dropColumnStrategy() === 'rebuild') {
      const droppedColumns = blueprint.removeDropColumnCommands()

      if (droppedColumns.length > 0) {
        if (!blueprint.isEmpty()) {
          await this.build(this.grammar.compileAlter(blueprint))
        }

        await this.rebuildDroppingColumns(table, droppedColumns)

        return
      }
    }

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

  /** Whether the given column exists on the given table. */
  public async hasColumn(table: string, column: string): Promise<boolean> {
    const { sql, bindings } = this.grammar.compileColumnExists(table, column)
    const rows = await this.source.query(sql, bindings)

    return rows.length > 0
  }

  private async build(statements: string[]): Promise<void> {
    for (const statement of statements) {
      await this.source.execute(statement)
    }
  }

  /**
   * Rebuilds `table` without `dropColumns`, the way SQLite requires when a column
   * cannot be removed with `ALTER TABLE ... DROP COLUMN` (indexed / foreign-key
   * columns). It introspects the live schema via PRAGMA, recreates the table with
   * the surviving columns, foreign keys and single/compound primary key, copies
   * the data over, swaps the tables and recreates the explicit indexes whose
   * columns all survived. Foreign keys pointing at a dropped column are dropped
   * with it.
   */
  private async rebuildDroppingColumns(table: string, dropColumns: string[]): Promise<void> {
    const quote = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`
    const dropped = new Set(dropColumns)

    // ── Introspect the current table (before any mutation) ──────────────────
    const columns = await this.source.query(`SELECT * FROM pragma_table_info(?)`, [table])
    const foreignKeys = await this.source.query(`SELECT * FROM pragma_foreign_key_list(?)`, [table])
    const [createRow] = await this.source.query(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`,
      [table]
    )
    const indexRows = await this.source.query(
      `SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL`,
      [table]
    )
    const indexColumns = new Map<string, string[]>()

    for (const index of indexRows) {
      const info = await this.source.query(`SELECT name FROM pragma_index_info(?)`, [index.name])

      indexColumns.set(index.name, info.map((row) => String(row.name)))
    }

    const keptColumns = columns.filter((column) => !dropped.has(String(column.name)))
    const primaryKeyColumns = columns
      .filter((column) => Number(column.pk) > 0)
      .sort((a, b) => Number(a.pk) - Number(b.pk))
    const hasCompoundPrimaryKey = primaryKeyColumns.length > 1
    const usesAutoIncrement = /autoincrement/i.test(String(createRow?.sql ?? ''))

    // ── Column definitions ──────────────────────────────────────────────────
    const columnDefinitions = keptColumns.map((column) => {
      const name = String(column.name)
      const type = String(column.type || 'TEXT')
      let definition = `${quote(name)} ${type}`

      if (!hasCompoundPrimaryKey && Number(column.pk) > 0 && /^INTEGER$/i.test(type)) {
        definition += usesAutoIncrement ? ' PRIMARY KEY AUTOINCREMENT' : ' PRIMARY KEY'
      } else if (Number(column.notnull) === 1) {
        definition += ' NOT NULL'
      }

      if (column.dflt_value !== null && column.dflt_value !== undefined) {
        definition += ` DEFAULT ${column.dflt_value}`
      }

      return definition
    })

    const tableConstraints: string[] = []

    if (hasCompoundPrimaryKey) {
      tableConstraints.push(`PRIMARY KEY (${primaryKeyColumns.map((column) => quote(String(column.name))).join(', ')})`)
    }

    // ── Foreign keys (skip any whose child column was dropped) ───────────────
    const foreignKeyGroups = new Map<number, DataSetRow[]>()

    for (const row of foreignKeys) {
      const id = Number(row.id)

      if (!foreignKeyGroups.has(id)) {
        foreignKeyGroups.set(id, [])
      }

      foreignKeyGroups.get(id)!.push(row as DataSetRow)
    }

    for (const rows of foreignKeyGroups.values()) {
      const ordered = rows.sort((a, b) => Number(a.seq) - Number(b.seq))
      const fromColumns = ordered.map((row) => String(row.from))

      if (fromColumns.some((column) => dropped.has(column))) {
        continue
      }

      const toColumns = ordered.map((row) => String(row.to))
      const referencedTable = String(ordered[0].table)
      let clause = `FOREIGN KEY (${fromColumns.map(quote).join(', ')}) REFERENCES ${quote(referencedTable)} (${toColumns
        .map(quote)
        .join(', ')})`

      if (ordered[0].on_delete && String(ordered[0].on_delete) !== 'NO ACTION') {
        clause += ` ON DELETE ${ordered[0].on_delete}`
      }

      if (ordered[0].on_update && String(ordered[0].on_update) !== 'NO ACTION') {
        clause += ` ON UPDATE ${ordered[0].on_update}`
      }

      tableConstraints.push(clause)
    }

    // ── Recreate the table with the surviving definition, copy, swap ─────────
    const temporaryTable = `_neorm_rebuild_${table}`
    const body = [...columnDefinitions, ...tableConstraints].join(', ')
    const keptNames = keptColumns.map((column) => quote(String(column.name))).join(', ')

    await this.source.execute(`CREATE TABLE ${quote(temporaryTable)} (${body})`)
    await this.source.execute(
      `INSERT INTO ${quote(temporaryTable)} (${keptNames}) SELECT ${keptNames} FROM ${quote(table)}`
    )
    await this.source.execute(`DROP TABLE ${quote(table)}`)
    await this.source.execute(`ALTER TABLE ${quote(temporaryTable)} RENAME TO ${quote(table)}`)

    // ── Recreate the explicit indexes whose columns all survived ────────────
    for (const index of indexRows) {
      const usesDroppedColumn = (indexColumns.get(String(index.name)) ?? []).some((column) => dropped.has(column))

      if (!usesDroppedColumn && index.sql) {
        await this.source.execute(String(index.sql))
      }
    }
  }
}

type DataSetRow = { [key: string]: any }
