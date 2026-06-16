/**
 * Result of a paginated query, modelled after Laravel's LengthAwarePaginator.
 *
 * - `data`        the records for the current page
 * - `total`       total number of records matching the query (ignoring limit/offset)
 * - `perPage`     number of records requested per page
 * - `currentPage` the page that was fetched (1-based)
 * - `lastPage`    the number of the last available page (always >= 1)
 * - `from`        1-based index of the first record on this page, or null when empty
 * - `to`          1-based index of the last record on this page, or null when empty
 */
export interface PaginationResult<T> {
  data: T[]
  total: number
  perPage: number
  currentPage: number
  lastPage: number
  from: number | null
  to: number | null
}
