import { ForeignCommand } from './Command'

/**
 * Fluent configuration of a foreign-key constraint, returned by
 * `table.foreign(...)`:
 *
 *   table.foreign('userId').references('id').on('users').onDelete('cascade')
 *
 * It mutates the underlying ForeignCommand held by the Blueprint, so every
 * chained call keeps configuring the same constraint.
 */
export class ForeignKeyDefinition {
  constructor(private readonly command: ForeignCommand) {}

  /** The referenced column(s) on the foreign table. */
  public references(columns: string | string[]): this {
    this.command.references = Array.isArray(columns) ? columns : [columns]

    return this
  }

  /** The referenced (foreign) table. */
  public on(table: string): this {
    this.command.on = table

    return this
  }

  /** ON DELETE action (e.g. 'cascade', 'set null', 'restrict', 'no action'). */
  public onDelete(action: string): this {
    this.command.onDelete = action

    return this
  }

  /** ON UPDATE action. */
  public onUpdate(action: string): this {
    this.command.onUpdate = action

    return this
  }

  /** Sets an explicit constraint name. */
  public name(name: string): this {
    this.command.index = name

    return this
  }

  public cascadeOnDelete(): this {
    return this.onDelete('cascade')
  }

  public restrictOnDelete(): this {
    return this.onDelete('restrict')
  }

  public nullOnDelete(): this {
    return this.onDelete('set null')
  }

  public cascadeOnUpdate(): this {
    return this.onUpdate('cascade')
  }

  public restrictOnUpdate(): this {
    return this.onUpdate('restrict')
  }
}
