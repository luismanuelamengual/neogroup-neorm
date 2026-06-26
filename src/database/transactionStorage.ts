import { AsyncLocalStorage } from 'node:async_hooks'
import { DataConnection } from './DataConnection'
import { DataSource } from './DataSource'

/**
 * Per-source transactional connection registry for the current async context.
 *
 * When a transaction is opened with `DataSource.transaction()` / `DB.transaction()`,
 * the connection that holds the open transaction is stored here, keyed by the
 * data source it belongs to. Every entity / query operation that runs inside the
 * transaction callback (and any async work it awaits) looks the connection up and
 * routes its statements through it, so a whole unit of work shares a single
 * connection and commits or rolls back atomically.
 *
 * The store is keyed by `DataSource` so that simultaneous transactions on
 * different sources do not interfere with each other.
 */
export type TransactionStore = Map<DataSource, DataConnection>

// Kept on globalThis so it survives Next.js hot reloads (same approach as DB's state).
function getStorage(): AsyncLocalStorage<TransactionStore> {
  const g = globalThis as any

  if (!g.__neormTransactionStorage) {
    g.__neormTransactionStorage = new AsyncLocalStorage<TransactionStore>()
  }

  return g.__neormTransactionStorage as AsyncLocalStorage<TransactionStore>
}

/** The transaction store active in the current async context, if any. */
export function getTransactionStore(): TransactionStore | undefined {
  return getStorage().getStore()
}

/** Runs `callback` within the given transaction store scope. */
export function runWithTransactionStore<T>(store: TransactionStore, callback: () => Promise<T>): Promise<T> {
  return getStorage().run(store, callback)
}
