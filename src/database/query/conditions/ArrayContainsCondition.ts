import { Field } from '../fields'

/**
 * Membership test of a scalar (or correlated column) inside an array column.
 *
 * Compiled per dialect by the query builders:
 *   - PostgreSQL → `"arrayField" @> ARRAY[value]` (uses a GIN index on the column)
 *   - SQLite     → `EXISTS (SELECT 1 FROM json_each("arrayField") WHERE value = value)`
 *   - MySQL      → `JSON_CONTAINS("arrayField", value)`
 *
 * `value` is normally a scalar (bound placeholder), but a `{ name, table }`
 * field descriptor may be passed for correlated subqueries (e.g. whereHas over
 * a `hasManyInArray` relation), in which case it is rendered as a column
 * reference instead of a binding.
 */
export type ArrayContainsCondition = { arrayField: Field; containsValue: any; not?: boolean }
