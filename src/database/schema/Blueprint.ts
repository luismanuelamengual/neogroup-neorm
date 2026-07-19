import { ColumnDefinition, ColumnType } from './ColumnDefinition'
import {
  DropColumnCommand,
  DropForeignCommand,
  DropIndexCommand,
  DropPrimaryCommand,
  DropUniqueCommand,
  ForeignCommand,
  IndexCommand,
  PrimaryCommand,
  RenameColumnCommand,
  SchemaCommand,
  UniqueCommand
} from './Command'
import { ForeignKeyDefinition } from './ForeignKeyDefinition'
import { IndexDefinition } from './IndexDefinition'

/** What a Blueprint is compiled into: a brand-new table or an alteration. */
export type BlueprintMode = 'create' | 'alter'

/**
 * Collects the columns and structural commands that describe a table, exactly
 * like Laravel's Blueprint. Grammars turn a Blueprint into the concrete DDL for
 * a given engine, so the same Blueprint runs unchanged on PostgreSQL, MySQL and
 * SQLite.
 *
 *   Schema.create('users', (table) => {
 *     table.increments('id')
 *     table.string('email', 150).unique()
 *     table.boolean('active').default(true)
 *     table.timestamp('createdAt').useCurrent()
 *   })
 */
export class Blueprint {
  private readonly _columns: ColumnDefinition[] = []
  private readonly _commands: SchemaCommand[] = []

  constructor(
    private readonly tableName: string,
    private readonly _mode: BlueprintMode = 'create',
    private _ifNotExists = false
  ) {}

  public getTable(): string {
    return this.tableName
  }

  public getMode(): BlueprintMode {
    return this._mode
  }

  public getColumns(): ColumnDefinition[] {
    return this._columns
  }

  public getCommands(): SchemaCommand[] {
    return this._commands
  }

  /**
   * Removes and returns the `dropColumn` commands from this blueprint. Used by
   * the SchemaBuilder on engines whose `dropColumnStrategy()` is 'rebuild'
   * (SQLite): the remaining commands are compiled normally and the dropped
   * column names drive a table rebuild instead of an ALTER … DROP COLUMN.
   */
  public removeDropColumnCommands(): string[] {
    const dropped: string[] = []

    for (let index = this._commands.length - 1; index >= 0; index--) {
      const command = this._commands[index]

      if (command.name === 'dropColumn') {
        dropped.unshift(...command.columns)
        this._commands.splice(index, 1)
      }
    }

    return dropped
  }

  /** Whether the blueprint carries any column definitions or structural commands. */
  public isEmpty(): boolean {
    return this._columns.length === 0 && this._commands.length === 0
  }

  public wantsIfNotExists(): boolean {
    return this._ifNotExists
  }

  /** Emits CREATE TABLE IF NOT EXISTS. */
  public ifNotExists(): this {
    this._ifNotExists = true

    return this
  }

  // ── Column types ──────────────────────────────────────────────────────────

  private addColumn(type: ColumnType, name: string, attributes: Partial<ColumnDefinition> = {}): ColumnDefinition {
    const column = new ColumnDefinition(name, type, attributes)

    this._columns.push(column)

    return column
  }

  /** Auto-incrementing UNSIGNED INTEGER primary key. */
  public increments(name: string): ColumnDefinition {
    return this.addColumn('increments', name, { isUnsigned: true, isAutoIncrement: true, isPrimary: true })
  }

  /** Auto-incrementing UNSIGNED BIGINT primary key. */
  public bigIncrements(name: string): ColumnDefinition {
    return this.addColumn('bigIncrements', name, { isUnsigned: true, isAutoIncrement: true, isPrimary: true })
  }

  /** Alias of bigIncrements — the conventional primary key. */
  public id(name = 'id'): ColumnDefinition {
    return this.bigIncrements(name)
  }

  public char(name: string, length = 255): ColumnDefinition {
    return this.addColumn('char', name, { length })
  }

  public string(name: string, length = 255): ColumnDefinition {
    return this.addColumn('string', name, { length })
  }

  public text(name: string): ColumnDefinition {
    return this.addColumn('text', name)
  }

  public mediumText(name: string): ColumnDefinition {
    return this.addColumn('mediumText', name)
  }

  public longText(name: string): ColumnDefinition {
    return this.addColumn('longText', name)
  }

  public integer(name: string): ColumnDefinition {
    return this.addColumn('integer', name)
  }

  public unsignedInteger(name: string): ColumnDefinition {
    return this.addColumn('unsignedInteger', name, { isUnsigned: true })
  }

  public bigInteger(name: string): ColumnDefinition {
    return this.addColumn('bigInteger', name)
  }

  public unsignedBigInteger(name: string): ColumnDefinition {
    return this.addColumn('unsignedBigInteger', name, { isUnsigned: true })
  }

  public smallInteger(name: string): ColumnDefinition {
    return this.addColumn('smallInteger', name)
  }

  public tinyInteger(name: string): ColumnDefinition {
    return this.addColumn('tinyInteger', name)
  }

  public boolean(name: string): ColumnDefinition {
    return this.addColumn('boolean', name)
  }

  public float(name: string): ColumnDefinition {
    return this.addColumn('float', name)
  }

  public double(name: string): ColumnDefinition {
    return this.addColumn('double', name)
  }

  public decimal(name: string, total = 8, places = 2): ColumnDefinition {
    return this.addColumn('decimal', name, { total, places })
  }

  public date(name: string): ColumnDefinition {
    return this.addColumn('date', name)
  }

  public dateTime(name: string): ColumnDefinition {
    return this.addColumn('dateTime', name)
  }

  public time(name: string): ColumnDefinition {
    return this.addColumn('time', name)
  }

  public timestamp(name: string): ColumnDefinition {
    return this.addColumn('timestamp', name)
  }

  public json(name: string): ColumnDefinition {
    return this.addColumn('json', name)
  }

  public jsonb(name: string): ColumnDefinition {
    return this.addColumn('jsonb', name)
  }

  public uuid(name: string): ColumnDefinition {
    return this.addColumn('uuid', name)
  }

  /**
   * Array of integers: native INT[] on PostgreSQL, JSON-encoded TEXT on SQLite,
   * JSON on MySQL. Lets the same migration keep list columns engine-agnostic.
   */
  public integerArray(name: string): ColumnDefinition {
    return this.addColumn('integerArray', name)
  }

  /** Adds nullable createdAt / updatedAt TIMESTAMP columns. */
  public timestamps(): void {
    this.timestamp('createdAt').nullable()
    this.timestamp('updatedAt').nullable()
  }

  /**
   * UNSIGNED BIGINT column meant to hold a foreign key (Laravel's foreignId).
   * Call `.constrained(table)` on the result to add the matching constraint.
   */
  public foreignId(name: string): ColumnDefinition {
    const column = this.unsignedBigInteger(name)

    // Attach a constrained() helper bound to this blueprint.
    ;(column as any).constrained = (table?: string, referenced = 'id'): ForeignKeyDefinition => {
      const inferredTable = table ?? this.guessForeignTable(name)

      return this.foreign(name).references(referenced).on(inferredTable)
    }

    return column
  }

  private guessForeignTable(column: string): string {
    // organizationId → organizations, user_id → users
    const base = column.replace(/[_]?[iI]d$/, '')

    return base.endsWith('s') ? base : base + 's'
  }

  // ── Structural commands ─────────────────────────────────────────────────────

  private addCommand<T extends SchemaCommand>(command: T): T {
    this._commands.push(command)

    return command
  }

  public primary(columns: string | string[], name?: string): IndexDefinition {
    const command: PrimaryCommand = {
      name: 'primary',
      columns: Array.isArray(columns) ? columns : [columns],
      index: name
    }

    this.addCommand(command)

    return new IndexDefinition(command)
  }

  public unique(columns: string | string[], name?: string): IndexDefinition {
    const command: UniqueCommand = {
      name: 'unique',
      columns: Array.isArray(columns) ? columns : [columns],
      index: name
    }

    this.addCommand(command)

    return new IndexDefinition(command)
  }

  public index(columns: string | string[], name?: string): IndexDefinition {
    const command: IndexCommand = {
      name: 'index',
      columns: Array.isArray(columns) ? columns : [columns],
      index: name
    }

    this.addCommand(command)

    return new IndexDefinition(command)
  }

  public foreign(columns: string | string[], name?: string): ForeignKeyDefinition {
    const command: ForeignCommand = {
      name: 'foreign',
      columns: Array.isArray(columns) ? columns : [columns],
      index: name
    }

    this.addCommand(command)

    return new ForeignKeyDefinition(command)
  }

  public dropColumn(columns: string | string[]): void {
    const command: DropColumnCommand = {
      name: 'dropColumn',
      columns: Array.isArray(columns) ? columns : [columns]
    }

    this.addCommand(command)
  }

  public renameColumn(from: string, to: string): void {
    const command: RenameColumnCommand = { name: 'renameColumn', from, to }

    this.addCommand(command)
  }

  public dropIndex(index: string): void {
    const command: DropIndexCommand = { name: 'dropIndex', index }

    this.addCommand(command)
  }

  public dropUnique(index: string): void {
    const command: DropUniqueCommand = { name: 'dropUnique', index }

    this.addCommand(command)
  }

  public dropPrimary(index?: string): void {
    const command: DropPrimaryCommand = { name: 'dropPrimary', index }

    this.addCommand(command)
  }

  public dropForeign(index: string): void {
    const command: DropForeignCommand = { name: 'dropForeign', index }

    this.addCommand(command)
  }
}
