import { EntityQuery } from './EntityQuery'

/**
 * A reusable global scope that can be applied to an entity's query builder.
 *
 * Implement this interface and pass an instance to addGlobalScope() to
 * encapsulate scope logic in its own class:
 *
 *   class ActiveScope implements Scope {
 *     apply(query: EntityQuery<any>): void {
 *       query.where('status', '=', 'active')
 *     }
 *   }
 *
 *   protected static booted(): void {
 *     static::addGlobalScope(new ActiveScope)
 *   }
 */
export interface Scope<T = any> {
  apply(query: EntityQuery<T>): void
}
