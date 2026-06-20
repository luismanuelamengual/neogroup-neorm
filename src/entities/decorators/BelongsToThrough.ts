import { getOrCreate } from './metadata'

/**
 * Inverse of HasOneThrough/HasManyThrough: this model holds a foreignKey that points
 * to an intermediate (through) model, which in turn holds a throughForeignKey that
 * points to the related model.
 *
 * Example: Profile → BelongsToThrough → Country through User
 *   - Profile.foreignKey      (userId)    → User.localKey        (id)
 *   - User.throughForeignKey  (countryId) → Country.throughLocalKey (id)
 *
 * @param related          - Lazy getter for the final related entity class
 * @param through          - Lazy getter for the intermediate entity class
 * @param foreignKey       - FK on this model pointing to through's localKey
 * @param throughForeignKey - FK on the through model pointing to related's throughLocalKey
 * @param localKey         - PK on the through model that foreignKey references (default 'id')
 * @param throughLocalKey  - PK on the related model that throughForeignKey references (default 'id')
 */
export function BelongsToThrough(
  related: () => any,
  through: () => any,
  foreignKey: string,
  throughForeignKey: string,
  localKey = 'id',
  throughLocalKey = 'id'
): PropertyDecorator {
  return (target, propertyKey) => {
    const m = getOrCreate(target as object)

    m.relationships.push({
      name: String(propertyKey),
      relationship: {
        type: 'belongsToThrough',
        related,
        through,
        foreignKey,
        throughForeignKey,
        localKey,
        throughLocalKey
      }
    })
  }
}
