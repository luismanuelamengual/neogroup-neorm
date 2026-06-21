import { getOrCreate } from './metadata'

/** Marks a getter as a virtual (computed) column to be included in toJSON serialization. */
export function VirtualColumn(): PropertyDecorator {
  return (target, propertyKey) => {
    const m = getOrCreate(target as object)

    m.virtualColumns.push(String(propertyKey))
  }
}
