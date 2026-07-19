import { Blueprint, DB, PostgresSchemaGrammar, Schema, SqliteDataSource, SqliteSchemaGrammar } from '../src'

/**
 * Schema features supporting the array migration: GIN indexes (`.using('gin')`),
 * Schema.hasColumn introspection, and the SQLite table-rebuild that `dropColumn`
 * falls back to for indexed / foreign-key columns.
 */

describe('GIN index DDL', () => {
  const postgres = new PostgresSchemaGrammar()
  const sqlite = new SqliteSchemaGrammar()

  const withGinIndex = (t: Blueprint) => {
    t.increments('id')
    t.integerArray('playerIds').default([])
    t.index('playerIds', 'idx_competitors_players').using('gin')
  }

  it('PostgreSQL emits USING GIN', () => {
    const blueprint = new Blueprint('competitors', 'create')

    withGinIndex(blueprint)

    const statements = postgres.compileCreate(blueprint)

    expect(statements).toContain('CREATE INDEX idx_competitors_players ON competitors USING GIN (playerIds)')
  })

  it('PostgreSQL emits USING GIN in ALTER mode too', () => {
    const blueprint = new Blueprint('competitors', 'alter')

    blueprint.index('playerIds', 'idx_competitors_players').using('gin')

    expect(postgres.compileAlter(blueprint)).toEqual([
      'CREATE INDEX idx_competitors_players ON competitors USING GIN (playerIds)'
    ])
  })

  it('SQLite ignores the index method and creates a plain index', () => {
    const blueprint = new Blueprint('competitors', 'create')

    withGinIndex(blueprint)

    const statements = sqlite.compileCreate(blueprint)

    expect(statements).toContain('CREATE INDEX idx_competitors_players ON competitors (playerIds)')
    expect(statements.some((s) => /GIN/i.test(s))).toBe(false)
  })
})

describe('Schema introspection & SQLite dropColumn rebuild', () => {
  let source: SqliteDataSource

  beforeEach(async () => {
    source = new SqliteDataSource()
    DB.register(source)

    await Schema.dropIfExists('items')
    await Schema.dropIfExists('owners')

    await Schema.createIfNotExists('owners', (t) => {
      t.increments('id')
      t.string('name', 100)
    })

    await Schema.createIfNotExists('items', (t) => {
      t.increments('id')
      t.integer('ownerId').nullable()
      t.string('code', 50)
      t.integer('legacy').nullable()
      t.index('code', 'idx_items_code')
      t.index('legacy', 'idx_items_legacy')
      t.foreign('ownerId').references('id').on('owners').onDelete('cascade')
    })

    await DB.table('owners').insert({ name: 'Acme' })
    await DB.table('items').insert({ ownerId: 1, code: 'A1', legacy: 7 })
    await DB.table('items').insert({ ownerId: 1, code: 'B2', legacy: 8 })
  })

  afterEach(async () => {
    await source.close()
  })

  it('hasColumn reports existing and missing columns', async () => {
    expect(await Schema.hasColumn('items', 'legacy')).toBe(true)
    expect(await Schema.hasColumn('items', 'nope')).toBe(false)
  })

  it('hasColumn matches case-insensitively (PostgreSQL folds unquoted identifiers)', async () => {
    // On PostgreSQL a column declared `userId` is stored as `userid`; the probe
    // must still find it when asked with the original camelCase name.
    expect(await Schema.hasColumn('items', 'LEGACY')).toBe(true)
    expect(await Schema.hasColumn('ITEMS', 'legacy')).toBe(true)
  })

  it('drops an indexed foreign-key column by rebuilding the table', async () => {
    await Schema.table('items', (t) => {
      t.dropColumn('ownerId')
      t.dropColumn('legacy')
    })

    // Columns are gone.
    expect(await Schema.hasColumn('items', 'ownerId')).toBe(false)
    expect(await Schema.hasColumn('items', 'legacy')).toBe(false)
    expect(await Schema.hasColumn('items', 'code')).toBe(true)

    // Data survived, in order.
    const rows = await DB.table('items').orderBy('id').get()
    expect(rows.map((r) => `${r.id}:${r.code}`)).toEqual(['1:A1', '2:B2'])

    // The foreign key on the dropped column is gone; none remain.
    const fks = await DB.query('SELECT * FROM pragma_foreign_key_list(?)', ['items'])
    expect(fks).toHaveLength(0)

    // The index on a surviving column is kept; the one on a dropped column is gone.
    const indexes = (await DB.query('SELECT name FROM pragma_index_list(?)', ['items'])).map((r) => String(r.name))
    expect(indexes).toContain('idx_items_code')
    expect(indexes).not.toContain('idx_items_legacy')

    // AUTOINCREMENT is preserved: a new row keeps counting up.
    await DB.table('items').insert({ code: 'C3' })
    const last = await DB.table('items').orderByDesc('id').first()
    expect(last?.id).toBe(3)
  })
})
