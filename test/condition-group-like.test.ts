import { DB, SqliteDataSource } from '../src'
import { PostgresQueryBuilder } from '../src/database/sources/postgres/PostgresQueryBuilder'

/**
 * Regresión: `whereLike` / `orWhereLike` / `whereNotLike` / `orWhereNotLike`
 * dentro de un callback de agrupamiento (`where((group) => ...)`) usaban
 * siempre `LIKE` (case-sensitive), mientras que las mismas llamadas a nivel
 * del query builder principal usan `ILIKE` (case-insensitive) por defecto.
 *
 * El callback recibe una instancia de `ConditionGroup`, no el query builder
 * (`HasWhereConditions`), así que ambas implementaciones deben mantenerse
 * en paridad.
 *
 * Estos tests verifican el SQL generado directamente con `PostgresQueryBuilder`,
 * que no reescribe `ILIKE` → `LIKE` (a diferencia de MySQL/SQLite, cuyas
 * colaciones por defecto ya son case-insensitive y por eso no exponen el bug
 * en tiempo de ejecución).
 */
describe('ConditionGroup — paridad de whereLike/orWhereLike con HasWhereConditions', () => {
  const builder = new PostgresQueryBuilder()

  it('whereLike a nivel del query builder principal usa ILIKE por defecto', () => {
    const query = DB.selectQuery('players').whereLike('firstName', 'lu%')
    const stmt = builder.buildQuery(query)

    expect(stmt.sql).toContain('ILIKE')
  })

  it('whereLike dentro de un callback de grupo también usa ILIKE por defecto', () => {
    const query = DB.selectQuery('players').where((group) => {
      group.whereLike('firstName', 'lu%').orWhereLike('lastName', 'lu%')
    })
    const stmt = builder.buildQuery(query)

    const ilikeOccurrences = (stmt.sql.match(/ILIKE/g) || []).length
    const likeOccurrences = (stmt.sql.match(/(?:^|[^I])LIKE/g) || []).length

    expect(ilikeOccurrences).toBe(2)
    expect(likeOccurrences).toBe(0)
  })

  it('whereNotLike / orWhereNotLike dentro de un grupo usan NOT ILIKE por defecto', () => {
    const query = DB.selectQuery('players').where((group) => {
      group.whereNotLike('firstName', 'lu%').orWhereNotLike('lastName', 'lu%')
    })
    const stmt = builder.buildQuery(query)

    const notIlikeOccurrences = (stmt.sql.match(/NOT ILIKE/g) || []).length

    expect(notIlikeOccurrences).toBe(2)
    expect(stmt.sql).not.toContain('NOT LIKE')
  })

  it('whereLike(..., true) dentro de un grupo fuerza LIKE case-sensitive', () => {
    const query = DB.selectQuery('players').where((group) => {
      group.whereLike('firstName', 'lu%', true)
    })
    const stmt = builder.buildQuery(query)

    expect(stmt.sql).toContain('LIKE')
    expect(stmt.sql).not.toContain('ILIKE')
  })

  it('grupos anidados heredan la misma semántica de case-insensitivity', () => {
    const query = DB.selectQuery('players').where((group) => {
      group.where('active', 1).where((inner) => {
        inner.whereLike('firstName', 'lu%').orWhereLike('lastName', 'lu%')
      })
    })
    const stmt = builder.buildQuery(query)

    const ilikeOccurrences = (stmt.sql.match(/ILIKE/g) || []).length

    expect(ilikeOccurrences).toBe(2)
  })
})

describe('ConditionGroup — comportamiento funcional case-insensitive (SQLite)', () => {
  let source: SqliteDataSource

  beforeAll(async () => {
    source = new SqliteDataSource()

    await source.execute(`
      CREATE TABLE players (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        firstName TEXT NOT NULL,
        lastName  TEXT NOT NULL
      )
    `)

    await source
      .table('players')
      .setFieldValue('firstName', 'Luis')
      .setFieldValue('lastName', 'Perez')
      .insert()
    await source
      .table('players')
      .setFieldValue('firstName', 'Ana')
      .setFieldValue('lastName', 'DeLuca')
      .insert()
    await source
      .table('players')
      .setFieldValue('firstName', 'Carlos')
      .setFieldValue('lastName', 'Gomez')
      .insert()
  })

  afterAll(async () => {
    await source.close()
  })

  it('whereLike/orWhereLike dentro de un grupo matchean sin importar mayúsculas/minúsculas', async () => {
    // 'Luis' matchea por firstName, 'DeLuca' matchea por lastName; 'Carlos'/'Gomez' no matchean.
    const pattern = '%LU%'

    const players = await source
      .table('players')
      .where((group) => {
        group.whereLike('firstName', pattern).orWhereLike('lastName', pattern)
      })
      .get()

    expect(players.map((p: any) => p.firstName).sort()).toEqual(['Ana', 'Luis'])
    expect(players.some((p: any) => p.firstName === 'Carlos')).toBe(false)
  })
})
