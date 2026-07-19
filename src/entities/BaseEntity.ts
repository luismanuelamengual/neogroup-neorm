import { DataTable } from '../database/DataTable'
import { PaginationResult } from '../database/PaginationResult'
import { Field } from '../database/query'
import { Condition, ConditionGroup, ExistsSubquery } from '../database/query/conditions'
import { OrderByDirection } from '../database/query/features/HasOrderByFields'
import { EntityQuery } from './EntityQuery'
import { addGlobalScopeToStore, EntityRepository, Repository } from './EntityRepository'
import { Scope } from './Scope'

/** A concrete entity class: constructible and carrying the BaseEntity statics. */
export type EntityClass<T extends BaseEntity = BaseEntity> = typeof BaseEntity & (new () => T)

/**
 * Optional Active Record base class. Entities that extend BaseEntity get
 * instance-level save()/delete() and class-level query methods as convenience
 * delegates. All real logic lives in EntityRepository — BaseEntity is a
 * thin shell that calls Repository.get(this) and forwards.
 *
 * Entities that do NOT extend BaseEntity work identically through the
 * Repository directly: Repository.get(Country).where(...).find()
 *
 * Note: BaseEntity holds NO metadata. All metadata is stored inside
 * EntityRepository's internal store, populated exclusively by @Entity.
 */
export abstract class BaseEntity {
  // ── Repository accessor ───────────────────────────────────────────────────────

  private static _repo<T extends BaseEntity>(this: EntityClass<T>): EntityRepository<T> {
    return Repository.get(this) as EntityRepository<T>
  }

  // ── Booted hook ───────────────────────────────────────────────────────────────

  /**
   * Called once per entity class the first time its repository is accessed.
   * Override to register global scopes:
   *
   *   protected static booted(): void {
   *     static.addGlobalScope('active', query => query.where('status', 'active'))
   *   }
   */
  protected static booted(): void {}

  // ── Global scopes ─────────────────────────────────────────────────────────────

  /**
   * Registers a named global scope applied to every query for this entity.
   *
   *   // Inline callback:
   *   static::addGlobalScope('active', query => query.where('status', 'active'))
   *
   *   // Reusable Scope object (key = class name):
   *   static::addGlobalScope(new ActiveScope)
   */
  static addGlobalScope<T extends BaseEntity>(
    this: EntityClass<T>,
    nameOrScope: string | Scope<T>,
    callback?: (query: EntityQuery<T>) => void | Promise<void>
  ): void {
    let name: string
    let fn: (query: EntityQuery<T>) => void

    if (typeof nameOrScope === 'string') {
      name = nameOrScope
      fn = callback!
    } else {
      name = nameOrScope.constructor.name
      fn = (query) => (nameOrScope as Scope<T>).apply(query)
    }

    addGlobalScopeToStore(this, name, fn as (query: any) => void)
  }

  /**
   * Returns an EntityQuery with the given named global scope(s) disabled.
   *
   *   Product.withoutGlobalScope('active').get()
   */
  static withoutGlobalScope<T extends BaseEntity>(this: EntityClass<T>, ...names: string[]): EntityQuery<T> {
    return this._repo()
      .query()
      .withoutGlobalScope(...names)
  }

  /**
   * Returns an EntityQuery with ALL global scopes disabled.
   *
   *   Product.withoutGlobalScopes().get()
   */
  static withoutGlobalScopes<T extends BaseEntity>(this: EntityClass<T>): EntityQuery<T> {
    return this._repo().query().withoutGlobalScopes()
  }

  // ── Static query methods (delegates) ─────────────────────────────────────────

  static query<T extends BaseEntity>(this: EntityClass<T>): DataTable {
    const repo = this._repo()

    return repo.getSource().table(repo.table)
  }

  static fromRow<T extends BaseEntity>(this: EntityClass<T>, row: Record<string, any>): T {
    return this._repo().fromRow(row)
  }

  /**
   * Re-hydrates a plain object (typically the output of toJSON, or JSON.parse
   * of a serialized entity) back into a typed entity instance. Date fields and
   * related entities are restored recursively.
   */
  static fromJSON<T extends BaseEntity>(this: EntityClass<T>, json: Record<string, any>): T {
    return this._repo().fromJSON(json)
  }

  static async find<T extends BaseEntity>(this: EntityClass<T>, id: any): Promise<T | null> {
    return this._repo().find(id)
  }

  static async get<T extends BaseEntity>(this: EntityClass<T>): Promise<T[]> {
    return this._repo().get()
  }

  static async first<T extends BaseEntity>(this: EntityClass<T>): Promise<T | null> {
    return this._repo().first()
  }

  static async count<T extends BaseEntity>(this: EntityClass<T>, column: Field = '*'): Promise<number> {
    return this._repo().count(column)
  }

  static async paginate<T extends BaseEntity>(
    this: EntityClass<T>,
    perPage = 15,
    page = 1
  ): Promise<PaginationResult<T>> {
    return this._repo().paginate(perPage, page)
  }

  static where<T extends BaseEntity>(this: EntityClass<T>, callback: (group: ConditionGroup) => void): EntityQuery<T>
  static where<T extends BaseEntity>(this: EntityClass<T>, condition: Condition): EntityQuery<T>
  static where<T extends BaseEntity>(this: EntityClass<T>, field: Field, value: any): EntityQuery<T>
  static where<T extends BaseEntity>(this: EntityClass<T>, field: Field, operator: string, value: any): EntityQuery<T>
  static where(this: any, ...args: any[]): EntityQuery<any> {
    return this._repo().where(...args)
  }

  static whereIn<T extends BaseEntity>(this: EntityClass<T>, field: Field, values: any[]): EntityQuery<T> {
    return this._repo().whereIn(field, values)
  }

  static whereNotIn<T extends BaseEntity>(this: EntityClass<T>, field: Field, values: any[]): EntityQuery<T> {
    return this._repo().whereNotIn(field, values)
  }

  static whereBetween<T extends BaseEntity>(this: EntityClass<T>, field: Field, range: [any, any]): EntityQuery<T> {
    return this._repo().whereBetween(field, range)
  }

  static whereNotBetween<T extends BaseEntity>(this: EntityClass<T>, field: Field, range: [any, any]): EntityQuery<T> {
    return this._repo().whereNotBetween(field, range)
  }

  static whereNull<T extends BaseEntity>(this: EntityClass<T>, field: Field): EntityQuery<T> {
    return this._repo().whereNull(field)
  }

  static whereNotNull<T extends BaseEntity>(this: EntityClass<T>, field: Field): EntityQuery<T> {
    return this._repo().whereNotNull(field)
  }

  static whereLike<T extends BaseEntity>(this: EntityClass<T>, field: Field, pattern: string): EntityQuery<T> {
    return this._repo().whereLike(field, pattern)
  }

  static whereNotLike<T extends BaseEntity>(this: EntityClass<T>, field: Field, pattern: string): EntityQuery<T> {
    return this._repo().whereNotLike(field, pattern)
  }

  static whereColumn<T extends BaseEntity>(this: EntityClass<T>, field: Field, column: Field): EntityQuery<T>
  static whereColumn<T extends BaseEntity>(
    this: EntityClass<T>,
    field: Field,
    operator: string,
    column: Field
  ): EntityQuery<T>
  static whereColumn(this: any, ...args: any[]): EntityQuery<any> {
    return this._repo().whereColumn(...args)
  }

  static whereExists<T extends BaseEntity>(this: EntityClass<T>, subquery: ExistsSubquery): EntityQuery<T> {
    return this._repo().whereExists(subquery)
  }

  static whereArrayContains<T extends BaseEntity>(this: EntityClass<T>, field: Field, value: any): EntityQuery<T> {
    return this._repo().whereArrayContains(field, value)
  }

  static whereNotExists<T extends BaseEntity>(this: EntityClass<T>, subquery: ExistsSubquery): EntityQuery<T> {
    return this._repo().whereNotExists(subquery)
  }

  static orderBy<T extends BaseEntity>(
    this: EntityClass<T>,
    field: Field,
    direction?: OrderByDirection
  ): EntityQuery<T> {
    return this._repo().orderBy(field, direction)
  }

  static orderByDesc<T extends BaseEntity>(this: EntityClass<T>, field: Field): EntityQuery<T> {
    return this._repo().orderByDesc(field)
  }

  static groupBy<T extends BaseEntity>(this: EntityClass<T>, ...fields: Field[]): EntityQuery<T> {
    return this._repo().groupBy(...fields)
  }

  static limit<T extends BaseEntity>(this: EntityClass<T>, value: number): EntityQuery<T> {
    return this._repo().limit(value)
  }

  static offset<T extends BaseEntity>(this: EntityClass<T>, value: number): EntityQuery<T> {
    return this._repo().offset(value)
  }

  static select<T extends BaseEntity>(this: EntityClass<T>, ...fields: (Field | Field[])[]): EntityQuery<T> {
    return this._repo().select(...fields)
  }

  static when<T extends BaseEntity>(
    this: EntityClass<T>,
    condition: any,
    callback: (query: EntityQuery<T>) => void
  ): EntityQuery<T> {
    return this._repo().when(condition, callback)
  }

  static with<T extends BaseEntity>(
    this: EntityClass<T>,
    relations: Record<string, (query: EntityQuery<T>) => void>
  ): EntityQuery<T>
  static with<T extends BaseEntity>(
    this: EntityClass<T>,
    relations: string | string[],
    ...rest: string[]
  ): EntityQuery<T>
  static with(this: any, relations: any, ...rest: string[]): EntityQuery<any> {
    return (this._repo() as any).with(relations, ...rest)
  }

  static whereHas<T extends BaseEntity>(
    this: EntityClass<T>,
    relationName: string,
    callback?: (query: EntityQuery<T>) => void
  ): EntityQuery<T> {
    return this._repo().whereHas(relationName, callback)
  }

  static orWhereHas<T extends BaseEntity>(
    this: EntityClass<T>,
    relationName: string,
    callback?: (query: EntityQuery<T>) => void
  ): EntityQuery<T> {
    return this._repo().orWhereHas(relationName, callback)
  }

  static joinRelationship<T extends BaseEntity>(this: EntityClass<T>, relationName: string): EntityQuery<T> {
    return this._repo().joinRelationship(relationName)
  }

  static innerJoinRelationship<T extends BaseEntity>(this: EntityClass<T>, relationName: string): EntityQuery<T> {
    return this._repo().innerJoinRelationship(relationName)
  }

  static leftJoinRelationship<T extends BaseEntity>(this: EntityClass<T>, relationName: string): EntityQuery<T> {
    return this._repo().leftJoinRelationship(relationName)
  }

  // ── Instance persistence (delegates) ─────────────────────────────────────────

  /**
   * Inserts the given records in a single batch statement. Mirrors Eloquent's
   * `Model::insert($values)`:
   *
   *   await Match.insert([
   *     { roundId: 4, position: 0, homeCompetitorIds: [1], status: 0 },
   *     { roundId: 4, position: 1, homeCompetitorIds: [2], status: 0 }
   *   ])
   *
   * Values are expressed as entity properties and mapped to columns with their
   * declared casts. Auto-generated columns are never written and generated keys
   * are not read back. Returns the number of affected rows.
   */
  static async insert<T extends BaseEntity>(this: EntityClass<T>, values: Record<string, any>[]): Promise<number> {
    return this._repo().insert(values)
  }

  /**
   * Inserts the given records, updating the conflicting columns when a row
   * already exists. Mirrors Eloquent's `Model::upsert($values, $uniqueBy, $update)`:
   *
   *   await PlayerStatistics.upsert(
   *     [{ playerId: 7, points: 120, updatedAt: new Date() }],
   *     'playerId',                 // unique-by property (or properties)
   *     ['points', 'updatedAt']     // properties to overwrite on conflict (optional)
   *   )
   *
   * When `update` is omitted, every provided column that is not part of
   * `uniqueBy` is updated. Returns the number of affected rows.
   */
  static async upsert<T extends BaseEntity>(
    this: EntityClass<T>,
    values: Record<string, any>[],
    uniqueBy: string | string[],
    update?: string[]
  ): Promise<number> {
    return this._repo().upsert(values, uniqueBy, update)
  }

  async save(): Promise<void> {
    await Repository.get(this.constructor as any).save(this)
  }

  async delete(): Promise<void> {
    await Repository.get(this.constructor as any).delete(this)
  }

  // ── Dirty tracking (delegates) ───────────────────────────────────────────────

  /**
   * True if this entity (or, when given, a specific property) has unsaved
   * changes relative to its last hydration/save.
   *
   *   user.email = 'new@x.com'
   *   user.isDirty()          // true
   *   user.isDirty('name')    // false
   */
  isDirty(field?: string): boolean {
    return Repository.get(this.constructor as any).isDirty(this, field)
  }

  /**
   * Returns a `{ property: value }` map of only the properties that changed
   * since this entity's last hydration/save.
   */
  getDirty(): Record<string, any> {
    return Repository.get(this.constructor as any).getDirty(this)
  }

  // ── Serialization ────────────────────────────────────────────────────────────

  toDto(): Record<string, any> {
    return this.toJSON()
  }

  /**
   * Serializes this entity into a plain, JSON-safe object: Date values become
   * ISO-8601 strings and loaded relationships are serialized recursively.
   * Delegates to the EntityRepository so behaviour matches
   * Repository.get(EntityClass).toJSON(instance).
   */
  toJSON(): Record<string, any> {
    return Repository.get(this.constructor as any).toJSON(this)
  }
}
