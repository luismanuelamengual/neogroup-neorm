import type { SelectQuery } from '../SelectQuery'

/** `not: true` compiles to `NOT EXISTS (...)` instead of `EXISTS (...)`. */
export type ExistsCondition = { exists: SelectQuery; not?: boolean }

/**
 * A subquery for an EXISTS/NOT EXISTS check: either a ready-made SelectQuery
 * or a callback that receives a fresh one to configure (mirrors the grouped
 * condition callback style used by `where((group) => ...)`).
 */
export type ExistsSubquery = SelectQuery | ((query: SelectQuery) => void)

/**
 * Builds an `ExistsCondition` from an `ExistsSubquery`. Shared by
 * `HasWhereConditions` (SelectQuery/UpdateQuery/DeleteQuery/DataTable) and
 * `ConditionGroup`, so `whereExists`/`whereNotExists`/`orWhereExists`/
 * `orWhereNotExists` behave identically at the top level and inside a grouped
 * condition callback.
 *
 * `SelectQuery` is required lazily (instead of imported eagerly) because both
 * call sites are themselves dependencies of `SelectQuery` — an eager import
 * here would create a circular load-order deadlock where `SelectQuery`'s own
 * top-level mixin setup runs before this module (and therefore `SelectQuery`
 * itself) finished loading.
 */
export function buildExistsCondition(subquery: ExistsSubquery, not = false): ExistsCondition {
  let query: SelectQuery

  if (typeof subquery === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { SelectQuery: SelectQueryCtor } = require('../SelectQuery') as { SelectQuery: new () => SelectQuery }

    query = new SelectQueryCtor()
    subquery(query)
  } else {
    query = subquery
  }

  return not ? { exists: query, not: true } : { exists: query }
}
