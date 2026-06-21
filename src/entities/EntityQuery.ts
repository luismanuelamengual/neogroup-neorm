import { DataTable } from '../database/DataTable'
import { PaginationResult } from '../database/PaginationResult'
import { Field, SelectQuery } from '../database/query'
import { Condition, ConditionGroup, ExistsCondition } from '../database/query/conditions'
import { JoinType } from '../database/query/features/HasJoins'
import { OrderByDirection } from '../database/query/features/HasOrderByFields'
import { EntityRepository, Repository } from './EntityRepository'

/** A single eager-load entry: the dot-notation path and an optional constraint callback. */
export type WithEntry = {
  path: string
  callback?: (query: EntityQuery<any>) => void
}

/**
 * Chainable query builder for Entities. Wraps DataTable and hydrates rows
 * into typed entity instances when a terminal method is called.
 *
 * Constructed by EntityRepository.query() — do not instantiate directly.
 */
export class EntityQuery<T> {
  private _repository: EntityRepository<T>
  private _table: DataTable
  private _withs: WithEntry[] = []

  constructor(repository: EntityRepository<T>, table: DataTable) {
    this._repository = repository
    this._table = table
  }

  // ── Conditional clauses ──────────────────────────────────────────────────────

  public when(condition: any, callback: (query: this) => void): this {
    if (condition) {
      callback(this)
    }

    return this
  }

  // ── Eager loading ────────────────────────────────────────────────────────────

  public with(relations: Record<string, (query: EntityQuery<any>) => void>): this
  public with(relations: string | string[], ...rest: string[]): this
  public with(
    relations: string | string[] | Record<string, (query: EntityQuery<any>) => void>,
    ...rest: string[]
  ): this {
    if (typeof relations === 'string') {
      this._withs.push({ path: relations }, ...rest.map((r) => ({ path: r })))
    } else if (Array.isArray(relations)) {
      this._withs.push(...relations.map((r) => ({ path: r })))
    } else {
      for (const [path, callback] of Object.entries(relations)) {
        this._withs.push({ path, callback })
      }
    }

    return this
  }

  // ── Join relationships ───────────────────────────────────────────────────────

  public joinRelationship(relationName: string): this {
    return this._applyJoin(JoinType.INNER_JOIN, relationName)
  }

  public innerJoinRelationship(relationName: string): this {
    return this._applyJoin(JoinType.INNER_JOIN, relationName)
  }

  public leftJoinRelationship(relationName: string): this {
    return this._applyJoin(JoinType.LEFT_JOIN, relationName)
  }

  // ── Existence checks ─────────────────────────────────────────────────────────

  public whereHas(relationName: string, callback?: (query: EntityQuery<any>) => void): this {
    return this._applyWhereHas('AND', relationName, callback)
  }

  public orWhereHas(relationName: string, callback?: (query: EntityQuery<any>) => void): this {
    return this._applyWhereHas('OR', relationName, callback)
  }

  private _applyWhereHas(
    connector: 'AND' | 'OR',
    relationName: string,
    callback?: (query: EntityQuery<any>) => void
  ): this {
    const rel = this._repository.relationships[relationName]

    if (!rel) {
      throw new Error(`Relationship "${relationName}" is not defined on ${this._repository.table}`)
    }

    const RelatedClass = rel.related()
    const relatedRepo = Repository.get(RelatedClass)
    const relatedTable = relatedRepo.table
    const source = this._repository.getSource()
    // Build a sub-DataTable and sub-EntityQuery so the callback can constrain
    // the related entity with proper field-name resolution.
    const subTable = source.table(relatedTable)
    const subEntityQuery = new EntityQuery(relatedRepo, subTable)

    if (callback) {
      callback(subEntityQuery)
    }

    // Build the top-level condition group for the subquery.
    // If the user callback added conditions, wrap them in a nested group so that
    // the correlated column condition is always AND-ed with the entire user expression
    // (prevents SQL precedence bugs when the callback uses orWhere).
    const subConditions = new ConditionGroup()
    const userConditions = subTable.getWhereConditions()

    if (userConditions.getConditions().length > 0) {
      subConditions.where(userConditions)
    }

    // Add the correlated join condition at the top level (always AND).
    if (rel.type === 'hasOne' || rel.type === 'hasMany') {
      subConditions.whereColumn(`${relatedTable}.${rel.foreignKey}`, `${this._repository.table}.${rel.localKey}`)
    } else if (rel.type === 'belongsTo') {
      subConditions.whereColumn(`${relatedTable}.${rel.localKey}`, `${this._repository.table}.${rel.foreignKey}`)
    } else if (rel.type === 'hasOneThrough' || rel.type === 'hasManyThrough') {
      const ThroughClass = rel.through!()
      const throughRepo = Repository.get(ThroughClass)
      const throughTable = throughRepo.table

      // JOIN through table: related.foreign_key = through.through_local_key
      subTable.join(
        JoinType.INNER_JOIN,
        throughTable,
        `${relatedTable}.${rel.foreignKey}`,
        `${throughTable}.${rel.throughLocalKey}`
      )
      // Correlated condition: through.through_foreign_key = parent.local_key
      subConditions.whereColumn(`${throughTable}.${rel.throughForeignKey}`, `${this._repository.table}.${rel.localKey}`)
    } else if (rel.type === 'belongsToThrough') {
      const ThroughClass = rel.through!()
      const throughRepo = Repository.get(ThroughClass)
      const throughTable = throughRepo.table

      // JOIN through table: related.through_local_key = through.through_foreign_key
      subTable.join(
        JoinType.INNER_JOIN,
        throughTable,
        `${relatedTable}.${rel.throughLocalKey}`,
        `${throughTable}.${rel.throughForeignKey}`
      )
      // Correlated condition: through.local_key = self.foreign_key
      subConditions.whereColumn(`${throughTable}.${rel.localKey}`, `${this._repository.table}.${rel.foreignKey}`)
    }

    // Build EXISTS (SELECT 1 FROM related_table [...] WHERE [...]).
    // Use a lazy ExistsCondition so the subquery is compiled in the context of the
    // outer statement — this ensures Postgres $N positions are correct and avoids
    // pre-baked placeholders clashing with outer bindings.
    const subSelectQuery = new SelectQuery(relatedTable)

    subSelectQuery.setSelectFields(['1'])
    subSelectQuery.setWhereConditions(subConditions)
    subSelectQuery.setJoins(subTable.getJoins())

    const existsCondition: ExistsCondition = { exists: subSelectQuery }

    if (connector === 'AND') {
      this._table.where(existsCondition as any)
    } else {
      this._table.orWhere(existsCondition as any)
    }

    return this
  }

  private _applyJoin(joinType: JoinType, relationName: string): this {
    const rel = this._repository.relationships[relationName]

    if (!rel) {
      throw new Error(`Relationship "${relationName}" is not defined on ${this._repository.table}`)
    }

    const RelatedClass = rel.related()
    const relatedRepo = Repository.get(RelatedClass)
    const relatedTable = relatedRepo.table

    if (rel.type === 'hasOne' || rel.type === 'hasMany') {
      const sourceField = `${this._repository.table}.${rel.localKey}`
      const remoteField = `${relatedTable}.${rel.foreignKey}`

      this._table.join(joinType, relatedTable, sourceField, remoteField)
    } else if (rel.type === 'belongsTo') {
      const sourceField = `${this._repository.table}.${rel.foreignKey}`
      const remoteField = `${relatedTable}.${rel.localKey}`

      this._table.join(joinType, relatedTable, sourceField, remoteField)
    } else if (rel.type === 'hasOneThrough' || rel.type === 'hasManyThrough') {
      const ThroughClass = rel.through!()
      const throughRepo = Repository.get(ThroughClass)
      const throughTable = throughRepo.table

      this._table.join(
        joinType,
        throughTable,
        `${this._repository.table}.${rel.localKey}`,
        `${throughTable}.${rel.throughForeignKey}`
      )
      this._table.join(
        joinType,
        relatedTable,
        `${throughTable}.${rel.throughLocalKey}`,
        `${relatedTable}.${rel.foreignKey}`
      )
    } else if (rel.type === 'belongsToThrough') {
      const ThroughClass = rel.through!()
      const throughRepo = Repository.get(ThroughClass)
      const throughTable = throughRepo.table

      // self.foreignKey → through.localKey
      this._table.join(
        joinType,
        throughTable,
        `${this._repository.table}.${rel.foreignKey}`,
        `${throughTable}.${rel.localKey}`
      )
      // through.throughForeignKey → related.throughLocalKey
      this._table.join(
        joinType,
        relatedTable,
        `${throughTable}.${rel.throughForeignKey}`,
        `${relatedTable}.${rel.throughLocalKey}`
      )
    }

    return this
  }

  // ── Terminal methods ─────────────────────────────────────────────────────────

  public async get(): Promise<T[]> {
    const rows = await this._table.get()
    const entities = rows.map((row) => this._repository.fromRow(row))

    if (this._withs.length > 0) {
      await this._loadRelations(entities as any[], this._withs, this._repository)
    }

    return entities
  }

  public async first(): Promise<T | null> {
    const row = await this._table.first()

    if (!row) {
      return null
    }

    const entity = this._repository.fromRow(row)

    if (this._withs.length > 0) {
      await this._loadRelations([entity as any], this._withs, this._repository)
    }

    return entity
  }

  public async count(column: Field = '*'): Promise<number> {
    const resolved = column === '*' ? '*' : this._resolveField(column)

    return this._table.count(resolved)
  }

  public async paginate(perPage = 15, page = 1): Promise<PaginationResult<T>> {
    const currentPage = Math.max(page, 1)
    const total = await this._table.count()
    const lastPage = Math.max(Math.ceil(total / perPage), 1)

    this._table.setOffset((currentPage - 1) * perPage).setLimit(perPage)
    // Reuse get() so entities are hydrated and any with() relations are loaded.
    const data = await this.get()
    const from = total === 0 ? null : (currentPage - 1) * perPage + 1
    const to = from === null ? null : from + data.length - 1

    return { data, total, perPage, currentPage, lastPage, from, to }
  }

  public async find(id: any): Promise<T | null> {
    const row = await this._table.where(this._repository.primaryKey, id).first()

    if (!row) {
      return null
    }

    const entity = this._repository.fromRow(row)

    if (this._withs.length > 0) {
      await this._loadRelations([entity as any], this._withs, this._repository)
    }

    return entity
  }

  // ── Eager-load implementation ────────────────────────────────────────────────

  private async _loadRelations(entities: any[], withs: WithEntry[], parentRepo: EntityRepository<any>): Promise<void> {
    // Group by top-level relation name; carry along callback and nested paths
    const groups = new Map<string, { callback?: (query: EntityQuery<any>) => void; nested: WithEntry[] }>()

    for (const { path, callback } of withs) {
      const dot = path.indexOf('.')
      const head = dot === -1 ? path : path.substring(0, dot)
      const tail = dot === -1 ? null : path.substring(dot + 1)

      if (!groups.has(head)) {
        groups.set(head, { nested: [] })
      }

      const group = groups.get(head)!

      if (tail) {
        group.nested.push({ path: tail, callback })
      } else {
        group.callback = callback
      }
    }

    for (const [head, { callback, nested }] of groups) {
      const rel = parentRepo.relationships[head]

      if (!rel) {
        continue
      }

      const RelatedClass = rel.related()
      const relatedRepo = Repository.get(RelatedClass)
      let relatedItems: any[] = []

      if (rel.type === 'hasOne' || rel.type === 'hasMany') {
        const keys = [...new Set(entities.map((r) => r[rel.localKey]).filter((v) => v != null))]

        if (keys.length === 0) {
          continue
        }

        const q = relatedRepo.whereIn(rel.foreignKey, keys)

        if (callback) {
          callback(q)
        }

        relatedItems = await q.get()

        const lookup = new Map<any, any[]>()

        relatedItems.forEach((item: any) => {
          const k = item[rel.foreignKey]

          if (!lookup.has(k)) {
            lookup.set(k, [])
          }

          lookup.get(k)!.push(item)
        })

        entities.forEach((r) => {
          const matched = lookup.get(r[rel.localKey]) ?? []

          r[head] = rel.type === 'hasOne' ? matched[0] ?? null : matched
        })
      } else if (rel.type === 'belongsTo') {
        const keys = [...new Set(entities.map((r) => r[rel.foreignKey]).filter((v) => v != null))]

        if (keys.length === 0) {
          continue
        }

        const q = relatedRepo.whereIn(rel.localKey, keys)

        if (callback) {
          callback(q)
        }

        relatedItems = await q.get()

        const lookup = new Map<any, any>()

        relatedItems.forEach((item: any) => lookup.set(item[rel.localKey], item))

        entities.forEach((r) => {
          r[head] = lookup.get(r[rel.foreignKey]) ?? null
        })
      } else if (rel.type === 'hasOneThrough' || rel.type === 'hasManyThrough') {
        const ThroughClass = rel.through!()
        const throughRepo = Repository.get(ThroughClass)
        const localKeys = [...new Set(entities.map((r) => r[rel.localKey]).filter((v) => v != null))]

        if (localKeys.length === 0) {
          continue
        }

        const throughItems = await throughRepo.whereIn(rel.throughForeignKey!, localKeys).get()
        const throughKeys = [
          ...new Set(throughItems.map((t: any) => t[rel.throughLocalKey!]).filter((v: any) => v != null))
        ]

        if (throughKeys.length === 0) {
          continue
        }

        const throughByParent = new Map<any, any[]>()

        throughItems.forEach((t: any) => {
          const k = t[rel.throughForeignKey!]

          if (!throughByParent.has(k)) {
            throughByParent.set(k, [])
          }

          throughByParent.get(k)!.push(t)
        })

        const q = relatedRepo.whereIn(rel.foreignKey, throughKeys)

        if (callback) {
          callback(q)
        }

        relatedItems = await q.get()

        const relatedByThrough = new Map<any, any[]>()

        relatedItems.forEach((item: any) => {
          const k = item[rel.foreignKey]

          if (!relatedByThrough.has(k)) {
            relatedByThrough.set(k, [])
          }

          relatedByThrough.get(k)!.push(item)
        })

        entities.forEach((r) => {
          const throughs = throughByParent.get(r[rel.localKey]) ?? []
          const matched: any[] = []

          throughs.forEach((t: any) => {
            const items = relatedByThrough.get(t[rel.throughLocalKey!]) ?? []

            matched.push(...items)
          })
          r[head] = rel.type === 'hasOneThrough' ? matched[0] ?? null : matched
        })
      } else if (rel.type === 'belongsToThrough') {
        const ThroughClass = rel.through!()
        const throughRepo = Repository.get(ThroughClass)
        // Step 1: load through items matching self.foreignKey → through.localKey
        const foreignKeys = [...new Set(entities.map((r) => r[rel.foreignKey]).filter((v) => v != null))]

        if (foreignKeys.length === 0) {
          continue
        }

        const throughItems = await throughRepo.whereIn(rel.localKey, foreignKeys).get()
        // Step 2: load related items matching through.throughForeignKey → related.throughLocalKey
        const throughFKValues = [
          ...new Set(throughItems.map((t: any) => t[rel.throughForeignKey!]).filter((v: any) => v != null))
        ]

        if (throughFKValues.length === 0) {
          continue
        }

        const q = relatedRepo.whereIn(rel.throughLocalKey, throughFKValues)

        if (callback) {
          callback(q)
        }

        relatedItems = await q.get()

        // Build lookup: through.localKey → through item
        const throughByLocalKey = new Map<any, any>()

        throughItems.forEach((t: any) => throughByLocalKey.set(t[rel.localKey], t))

        // Build lookup: related.throughLocalKey → related item
        const relatedByThroughLocalKey = new Map<any, any>()

        relatedItems.forEach((item: any) => relatedByThroughLocalKey.set(item[rel.throughLocalKey!], item))

        // Assign: entity → through → related
        entities.forEach((r) => {
          const throughItem = throughByLocalKey.get(r[rel.foreignKey])
          const relatedItem = throughItem ? relatedByThroughLocalKey.get(throughItem[rel.throughForeignKey!]) : null

          r[head] = relatedItem ?? null
        })
      }

      // Recurse for nested dot-notation paths
      if (nested.length > 0 && relatedItems.length > 0) {
        await this._loadRelations(relatedItems, nested, relatedRepo)
      }
    }
  }

  // ── Field-name resolution ────────────────────────────────────────────────────

  private _resolveFieldName(name: string): string {
    const columnsMap = this._repository.columnsMap

    return columnsMap[name] ?? name
  }

  private _resolveField<F extends Field>(field: F): F {
    if (typeof field === 'string') {
      const dot = field.lastIndexOf('.')

      if (dot === -1) {
        return this._resolveFieldName(field) as F
      }

      const tablePart = field.substring(0, dot)

      if (tablePart !== this._repository.table) {
        return field
      }

      return `${tablePart}.${this._resolveFieldName(field.substring(dot + 1))}` as F
    }

    if (field && typeof field === 'object' && typeof (field as any).name === 'string') {
      const table = (field as any).table
      const tableName = typeof table === 'string' ? table : table?.name

      if (tableName != null && tableName !== this._repository.table) {
        return field
      }

      return { ...(field as any), name: this._resolveFieldName((field as any).name) }
    }

    return field
  }

  private _resolveCondition(condition: any): any {
    if (typeof condition === 'function') {
      return (group: ConditionGroup) => {
        condition(group)
        this._resolveConditionGroup(group)
      }
    }

    if (condition instanceof ConditionGroup) {
      this._resolveConditionGroup(condition)

      return condition
    }

    if (condition && typeof condition === 'object' && 'field' in condition) {
      const resolved: any = { ...condition, field: this._resolveField(condition.field) }

      if ('column' in condition) {
        resolved.column = this._resolveField(condition.column)
      }

      return resolved
    }

    return condition
  }

  private _resolveConditionGroup(group: ConditionGroup): void {
    for (const entry of group.getConditions()) {
      entry.condition = this._resolveCondition(entry.condition)
    }
  }

  // ── DataTable method proxies ─────────────────────────────────────────────────

  public where(callback: (group: ConditionGroup) => void): this
  public where(condition: Condition): this
  public where(field: Field, value: any): this
  public where(field: Field, operator: string, value: any): this
  public where(...args: any[]): this {
    if (args.length >= 2) {
      args[0] = this._resolveField(args[0])
    } else if (args.length === 1) {
      args[0] = this._resolveCondition(args[0])
    }

    ;(this._table as any).where(...args)

    return this
  }

  public whereIn(field: Field, values: any[]): this {
    this._table.whereIn(this._resolveField(field), values)

    return this
  }

  public whereNotIn(field: Field, values: any[]): this {
    this._table.whereNotIn(this._resolveField(field), values)

    return this
  }

  public whereBetween(field: Field, range: [any, any]): this {
    this._table.whereBetween(this._resolveField(field), range)

    return this
  }

  public whereNotBetween(field: Field, range: [any, any]): this {
    this._table.whereNotBetween(this._resolveField(field), range)

    return this
  }

  public whereNull(field: Field): this {
    this._table.whereNull(this._resolveField(field))

    return this
  }

  public whereNotNull(field: Field): this {
    this._table.whereNotNull(this._resolveField(field))

    return this
  }

  public whereLike(field: Field, pattern: string, caseSensitive = false): this {
    this._table.whereLike(this._resolveField(field), pattern, caseSensitive)

    return this
  }

  public whereNotLike(field: Field, pattern: string, caseSensitive = false): this {
    this._table.whereNotLike(this._resolveField(field), pattern, caseSensitive)

    return this
  }

  public whereColumn(field: Field, column: Field): this
  public whereColumn(field: Field, operator: string, column: Field): this
  public whereColumn(...args: any[]): this {
    args[0] = this._resolveField(args[0])
    args[args.length - 1] = this._resolveField(args[args.length - 1])
    ;(this._table as any).whereColumn(...args)

    return this
  }

  public orWhere(...args: any[]): this {
    if (args.length >= 2) {
      args[0] = this._resolveField(args[0])
    } else if (args.length === 1) {
      args[0] = this._resolveCondition(args[0])
    }

    ;(this._table as any).orWhere(...args)

    return this
  }

  public orWhereIn(field: Field, values: any[]): this {
    this._table.orWhereIn(this._resolveField(field), values)

    return this
  }

  public orWhereNotIn(field: Field, values: any[]): this {
    this._table.orWhereNotIn(this._resolveField(field), values)

    return this
  }

  public orWhereBetween(field: Field, range: [any, any]): this {
    this._table.orWhereBetween(this._resolveField(field), range)

    return this
  }

  public orWhereNotBetween(field: Field, range: [any, any]): this {
    this._table.orWhereNotBetween(this._resolveField(field), range)

    return this
  }

  public orWhereNull(field: Field): this {
    this._table.orWhereNull(this._resolveField(field))

    return this
  }

  public orWhereNotNull(field: Field): this {
    this._table.orWhereNotNull(this._resolveField(field))

    return this
  }

  public orWhereLike(field: Field, pattern: string, caseSensitive = false): this {
    this._table.orWhereLike(this._resolveField(field), pattern, caseSensitive)

    return this
  }

  public orWhereNotLike(field: Field, pattern: string, caseSensitive = false): this {
    this._table.orWhereNotLike(this._resolveField(field), pattern, caseSensitive)

    return this
  }

  public select(...fields: (Field | Field[])[]): this {
    const resolved = fields.map((f) =>
      Array.isArray(f) ? f.map((inner) => this._resolveField(inner)) : this._resolveField(f)
    )

    ;(this._table as any).select(...resolved)

    return this
  }

  public orderBy(field: Field, direction?: OrderByDirection): this {
    this._table.orderBy(this._resolveField(field), direction as any)

    return this
  }

  public orderByDesc(field: Field): this {
    return this.orderBy(field, OrderByDirection.DESC)
  }

  public groupBy(...fields: Field[]): this {
    ;(this._table as any).groupBy(...fields.map((f) => this._resolveField(f)))

    return this
  }

  public limit(value: number): this {
    this._table.setLimit(value)

    return this
  }

  public offset(value: number): this {
    this._table.setOffset(value)

    return this
  }

  public distinct(): this {
    this._table.setDistinct(true)

    return this
  }
}
