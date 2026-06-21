import { getOrCreate } from './metadata'

/**
 * Controls whether a property is included in toJSON serialization.
 *
 * - `@Serializable()` / `@Serializable(true)` — include a getter (virtual/computed field) in serialization.
 * - `@Serializable(false)` — exclude a column or relationship from serialization.
 */
export function Serializable(serialize = true): PropertyDecorator {
  return (target, propertyKey) => {
    const m = getOrCreate(target as object)
    const key = String(propertyKey)

    if (serialize) {
      m.serializableFields.push(key)
    } else {
      m.nonSerializableFields.push(key)
    }
  }
}
