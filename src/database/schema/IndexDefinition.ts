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
}
