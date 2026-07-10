import { BaseEntity, Column, DB, Entity, HasMany, SqliteDataSource } from '../src'
import { PostgresQueryBuilder } from '../src/database/sources/postgres/PostgresQueryBuilder'

/**
 * Tests for `whereExists` / `whereNotExists` / `orWhereExists` /
 * `orWhereNotExists`. These live on `HasWhereConditions` (so every query
 * builder that mixes it in — SelectQuery, UpdateQuery, DeleteQuery, DataTable —
 * gets them for free) and are mirrored as plain methods on `ConditionGroup`
 * itself, so they also work inside grouped condition callbacks
 * (`.where((group) => group.whereExists(...))`). Both call the shared
 * `buildExistsCondition` helper in `conditions/ExistsCondition.ts`.
 *
 * `EntityQuery.whereHas`/`orWhereHas` were refactored to build their EXISTS
 * subquery through `whereExists`/`orWhereExists` instead of hand-rolling an
 * `ExistsCondition` — the existing whereHas/orWhereHas suite (entities.test.ts)
 * doubles as a regression test for that refactor.
 */
describe('whereExists / whereNotExists / orWhereExists / orWhereNotExists (HasWhereConditions + ConditionGroup)', () => {
  // ─── SQL generation (Postgres does not rewrite EXISTS/NOT EXISTS) ─────────

  describe('Generación de SQL (PostgresQueryBuilder)', () => {
    const builder = new PostgresQueryBuilder()

    it('whereExists con callback genera EXISTS (subquery)', () => {
      const query = DB.selectQuery('users').whereExists((q) => {
        q.table('orders').select('1').whereColumn('orders.user_id', 'users.id')
      })
      const stmt = builder.buildQuery(query)

      expect(stmt.sql).toContain('EXISTS (SELECT 1 FROM orders WHERE orders.user_id = users.id)')
      expect(stmt.sql).not.toContain('NOT EXISTS')
    })

    it('whereNotExists antepone NOT a EXISTS', () => {
      const query = DB.selectQuery('users').whereNotExists((q) => {
        q.table('orders').select('1').whereColumn('orders.user_id', 'users.id')
      })
      const stmt = builder.buildQuery(query)

      expect(stmt.sql).toContain('NOT EXISTS (SELECT 1 FROM orders WHERE orders.user_id = users.id)')
    })

    it('orWhereExists / orWhereNotExists se combinan con OR', () => {
      const query = DB.selectQuery('users')
        .where('active', 1)
        .orWhereExists((q) => q.table('orders').select('1').whereColumn('orders.user_id', 'users.id'))
      const stmt = builder.buildQuery(query)

      expect(stmt.sql).toContain('OR EXISTS')
    })

    it('acepta una SelectQuery ya construida en lugar de un callback', () => {
      const sub = DB.selectQuery('orders').select('1').whereColumn('orders.user_id', 'users.id')
      const query = DB.selectQuery('users').whereExists(sub)
      const stmt = builder.buildQuery(query)

      expect(stmt.sql).toContain('EXISTS (SELECT 1 FROM orders WHERE orders.user_id = users.id)')
    })

    it('whereExists dentro de un callback de grupo (ConditionGroup)', () => {
      const query = DB.selectQuery('users').where((group) => {
        group.where('active', 1).whereExists((q) => q.table('orders').select('1').whereColumn('orders.user_id', 'users.id'))
      })
      const stmt = builder.buildQuery(query)

      expect(stmt.sql).toContain('EXISTS (SELECT 1 FROM orders WHERE orders.user_id = users.id)')
    })

    it('whereNotExists dentro de un callback de grupo antepone NOT', () => {
      const query = DB.selectQuery('users').where((group) => {
        group.whereNotExists((q) => q.table('orders').select('1').whereColumn('orders.user_id', 'users.id'))
      })
      const stmt = builder.buildQuery(query)

      expect(stmt.sql).toContain('NOT EXISTS (SELECT 1 FROM orders WHERE orders.user_id = users.id)')
    })
  })

  // ─── Comportamiento funcional (SQLite) ────────────────────────────────────

  describe('Comportamiento funcional (SQLite)', () => {
    let source: SqliteDataSource

    beforeAll(async () => {
      source = new SqliteDataSource()

      await source.execute(`
        CREATE TABLE customers (
          id     INTEGER PRIMARY KEY AUTOINCREMENT,
          name   TEXT    NOT NULL,
          active INTEGER NOT NULL DEFAULT 1
        )
      `)
      await source.execute(`
        CREATE TABLE purchases (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id INTEGER NOT NULL,
          amount      REAL    NOT NULL
        )
      `)
    })

    afterAll(async () => {
      await source.close()
    })

    beforeEach(async () => {
      await source.execute('DELETE FROM purchases')
      await source.execute('DELETE FROM customers')

      await source.table('customers').setFieldValue('name', 'Alice').setFieldValue('active', 1).insert()
      await source.table('customers').setFieldValue('name', 'Bob').setFieldValue('active', 1).insert()
      await source.table('customers').setFieldValue('name', 'Charlie').setFieldValue('active', 0).insert()

      const alice = await source.table('customers').where('name', 'Alice').first()
      const bob = await source.table('customers').where('name', 'Bob').first()

      // Alice: una compra grande. Bob: una compra chica. Charlie: ninguna.
      await source.table('purchases').setFieldValue('customer_id', alice!.id).setFieldValue('amount', 50).insert()
      await source.table('purchases').setFieldValue('customer_id', bob!.id).setFieldValue('amount', 5).insert()
    })

    it('whereExists (callback) filtra solo los que tienen relacionados', async () => {
      const customers = await source
        .table('customers')
        .whereExists((q) => q.table('purchases').select('1').whereColumn('purchases.customer_id', 'customers.id'))
        .orderBy('name')
        .get()

      expect(customers.map((c: any) => c.name)).toEqual(['Alice', 'Bob'])
    })

    it('whereNotExists filtra solo los que NO tienen relacionados', async () => {
      const customers = await source
        .table('customers')
        .whereNotExists((q) => q.table('purchases').select('1').whereColumn('purchases.customer_id', 'customers.id'))
        .get()

      expect(customers.map((c: any) => c.name)).toEqual(['Charlie'])
    })

    it('whereExists acepta una SelectQuery ya construida', async () => {
      const sub = DB.selectQuery('purchases')
        .select('1')
        .whereColumn('purchases.customer_id', 'customers.id')
        .where('amount', '>', 10)

      const customers = await source.table('customers').whereExists(sub).get()

      expect(customers.map((c: any) => c.name)).toEqual(['Alice'])
    })

    it('orWhereExists combina con OR', async () => {
      // active = 0 (Charlie) OR tiene una compra > 10 (Alice)
      const customers = await source
        .table('customers')
        .where('active', 0)
        .orWhereExists((q) =>
          q.table('purchases').select('1').whereColumn('purchases.customer_id', 'customers.id').where('amount', '>', 10)
        )
        .orderBy('name')
        .get()

      expect(customers.map((c: any) => c.name)).toEqual(['Alice', 'Charlie'])
    })

    it('orWhereNotExists combina con OR', async () => {
      // name inexistente (falso) OR no tiene compras → solo Charlie
      const customers = await source
        .table('customers')
        .where('name', '__nope__')
        .orWhereNotExists((q) => q.table('purchases').select('1').whereColumn('purchases.customer_id', 'customers.id'))
        .get()

      expect(customers.map((c: any) => c.name)).toEqual(['Charlie'])
    })

    it('whereExists dentro de un callback de grupo (ConditionGroup)', async () => {
      const customers = await source
        .table('customers')
        .where((group) => {
          group
            .where('active', 1)
            .whereExists((q) => q.table('purchases').select('1').whereColumn('purchases.customer_id', 'customers.id'))
        })
        .orderBy('name')
        .get()

      expect(customers.map((c: any) => c.name)).toEqual(['Alice', 'Bob'])
    })
  })

  // ─── Entities (BaseEntity / EntityRepository / EntityQuery) ───────────────

  describe('Entidades — whereExists/whereNotExists estáticos', () => {
    let source: SqliteDataSource

    @Entity({ table: 'he_customers' })
    class Customer extends BaseEntity {
      @Column({ primaryKey: true, autoGenerated: true })
      id!: number

      @Column()
      name!: string

      @HasMany(() => Purchase, 'customerId')
      purchases?: Purchase[]
    }

    @Entity({ table: 'he_purchases' })
    class Purchase extends BaseEntity {
      @Column({ primaryKey: true, autoGenerated: true })
      id!: number

      @Column()
      customerId!: number

      @Column()
      amount!: number
    }

    beforeAll(async () => {
      source = new SqliteDataSource()

      await source.execute(`
        CREATE TABLE he_customers (
          id   INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT    NOT NULL
        )
      `)
      await source.execute(`
        CREATE TABLE he_purchases (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          customerId INTEGER NOT NULL,
          amount     REAL    NOT NULL
        )
      `)

      DB.register(source)
    })

    afterAll(async () => {
      await source.close()
    })

    beforeEach(async () => {
      await source.execute('DELETE FROM he_purchases')
      await source.execute('DELETE FROM he_customers')

      await Customer.insert([{ name: 'Alice' }, { name: 'Bob' }])

      const alice = await Customer.where('name', 'Alice').first()

      await Purchase.insert([{ customerId: (alice as any).id, amount: 20 }])
    })

    it('Customer.whereExists(...) equivale a whereHas("purchases")', async () => {
      const withExists = await Customer.whereExists((q) =>
        q.table('he_purchases').select('1').whereColumn('he_purchases.customerId', 'he_customers.id')
      ).get()
      const withHas = await Customer.whereHas('purchases').get()

      expect(withExists.map((c: any) => c.name)).toEqual(['Alice'])
      expect(withHas.map((c: any) => c.name)).toEqual(['Alice'])
    })

    it('Customer.whereNotExists(...) devuelve los que no tienen compras', async () => {
      const customers = await Customer.whereNotExists((q) =>
        q.table('he_purchases').select('1').whereColumn('he_purchases.customerId', 'he_customers.id')
      ).get()

      expect(customers.map((c: any) => c.name)).toEqual(['Bob'])
    })
  })
})
