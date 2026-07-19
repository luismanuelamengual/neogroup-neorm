import { IndexCommand, PrimaryCommand, UniqueCommand } from './Command'

/**
 * Fluent configuration of an index / unique / primary command, returned by
 * `table.index(...)`, `table.unique(...)` and `table.primary(...)`. Allows
 * overriding the auto-generated index name:
 *
 *   table.index(['organizationId', 'discipline']).name('idx_categories_lookup')
 */
export class IndexDefinition {
  constructor(private readonly command: IndexCommand | UniqueCommand | PrimaryCommand) {}

  /** Overrides the generated index/constraint name. */
  public name(name: string): this {
    this.command.index = name

    return this
  }

  /**
   * Sets the index method/access-type (e.g. `.using('gin')` for an INT[] GIN
   * index). PostgreSQL emits `USING <method>`; SQLite and MySQL ignore it.
   * Only meaningful on `table.index(...)` commands.
   */
  public using(method: string): this {
    if (this.command.name === 'index') {
      this.command.using = method
    }

    return this
  }
}
