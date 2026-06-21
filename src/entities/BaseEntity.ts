import { DataTable } from '../database/DataTable'
import { PaginationResult } from '../database/PaginationResult'
import { Field } from '../database/query'
import { Condition, ConditionGroup } from '../database/query/conditions'
import { OrderByDirection } from '../database/query/features/HasOrderByFields'
import { EntityQuery } from './EntityQuery'
import { EntityRepository, Repository } from './EntityRepository'

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

  static limit<T extends BaseEntity>(this: EntityClass<T>, value: number): EntityQuery<T> {
    return this._repo().limit(value)
  }

  static offset<T extends BaseEntity>(this: EntityClass<T>, value: number): EntityQuery<T> {
    return this._repo().offset(value)
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

  async save(): Promise<void> {
    await Repository.get(this.constructor as any).save(this)
  }

  async delete(): Promise<void> {
    await Repository.get(this.constructor as any).delete(this)
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
