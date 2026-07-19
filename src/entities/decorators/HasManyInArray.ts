import { getOrCreate } from './metadata'

/**
 * Many-to-many resolved through an array column on THIS model.
 *
 * Unlike `HasMany` (where the foreign key lives on the related model), here the
 * owning model holds an array of related primary keys in a single column
 * (e.g. PostgreSQL `INTEGER[]`). The relation loads every related row whose
 * `relatedKey` appears in that array, preserving the order of the array.
 *
 *   @HasManyInArray(() => User, 'playerIds')
 *   players?: User[]
 *
 * `arrayKey`   — the array column on this model (default owner side).
 * `relatedKey` — the key matched on the related model (defaults to 'id').
 */
export function HasManyInArray(related: () => any, arrayKey: string, relatedKey = 'id'): PropertyDecorator {
  return (target, propertyKey) => {
    const m = getOrCreate(target as object)

    m.relationships.push({
      name: String(propertyKey),
      relationship: { type: 'hasManyInArray', related, foreignKey: arrayKey, localKey: relatedKey }
    })
  }
}
