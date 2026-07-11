import { OrderByDirection, SqliteDataSource } from '../src'

describe('SQLite — CRUD completo', () => {
  let source: SqliteDataSource

  // ─── Setup ───────────────────────────────────────────────────────────────

  beforeAll(async () => {
    source = new SqliteDataSource()
    // :memory: por defecto — base de datos limpia en cada ejecución de tests

    await source.execute(`
      CREATE TABLE users (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        name     TEXT    NOT NULL,
        email    TEXT    NOT NULL,
        age      INTEGER NOT NULL,
        active   INTEGER NOT NULL DEFAULT 1,
        nickname TEXT
      )
    `)

    await source.execute(`
      CREATE TABLE orders (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        product TEXT    NOT NULL,
        amount  REAL    NOT NULL
      )
    `)
  })

  afterAll(async () => {
    await source.close()
  })

  // Limpia las tablas antes de cada test para que sean independientes
  beforeEach(async () => {
    await source.execute('DELETE FROM orders')
    await source.execute('DELETE FROM users')
  })

  // ─── Helper ──────────────────────────────────────────────────────────────

  async function seedUsers() {
    await source
      .table('users')
      .setFieldValue('name', 'Alice')
      .setFieldValue('email', 'alice@example.com')
      .setFieldValue('age', 30)
      .setFieldValue('active', 1)
      .insert()
    await source
      .table('users')
      .setFieldValue('name', 'Bob')
      .setFieldValue('email', 'bob@example.com')
      .setFieldValue('age', 25)
      .setFieldValue('active', 1)
      .insert()
    await source
      .table('users')
      .setFieldValue('name', 'Charlie')
      .setFieldValue('email', 'charlie@example.com')
      .setFieldValue('age', 35)
      .setFieldValue('active', 0)
      .insert()
  }

  // Inserta órdenes asociadas a los usuarios ya persistidos
  async function seedOrders() {
    const alice = await source.table('users').where('name', 'Alice').first()
    const bob = await source.table('users').where('name', 'Bob').first()

    await source
      .table('orders')
      .setFieldValue('user_id', alice!.id)
      .setFieldValue('product', 'Widget')
      .setFieldValue('amount', 9.99)
      .insert()
    await source
      .table('orders')
      .setFieldValue('user_id', alice!.id)
      .setFieldValue('product', 'Gadget')
      .setFieldValue('amount', 24.99)
      .insert()
    await source
      .table('orders')
      .setFieldValue('user_id', bob!.id)
      .setFieldValue('product', 'Doohickey')
      .setFieldValue('amount', 4.99)
      .insert()
    // Charlie no tiene órdenes
  }

  // ─── INSERT ──────────────────────────────────────────────────────────────

  describe('INSERT', () => {
    it('inserta un registro y retorna 1 fila afectada', async () => {
      const changes = await source
        .table('users')
        .setFieldValue('name', 'Alice')
        .setFieldValue('email', 'alice@example.com')
        .setFieldValue('age', 30)
        .insert()

      expect(changes).toBe(1)
    })

    it('inserta múltiples registros y los persiste todos', async () => {
      await seedUsers()

      const users = await source.table('users').get()

      expect(users).toHaveLength(3)
    })

    it('insert acepta un objeto de fields como argumento', async () => {
      const changes = await source.table('users').insert({ name: 'Dave', email: 'dave@example.com', age: 28 })

      expect(changes).toBe(1)

      const user = await source.table('users').where('name', 'Dave').first()

      expect(user).not.toBeNull()
      expect(user!.age).toBe(28)
    })
  })

  // ─── SELECT ──────────────────────────────────────────────────────────────

  describe('SELECT', () => {
    beforeEach(async () => {
      await seedUsers()
    })

    // ── Básico ──────────────────────────────────────────────────────────────

    describe('Básico', () => {
      it('retorna todos los registros', async () => {
        const users = await source.table('users').get()

        expect(users).toHaveLength(3)
      })

      it('retorna campos seleccionados con select()', async () => {
        const users = await source.table('users').select('name', 'age').get()

        expect(users).toHaveLength(3)
        expect(Object.keys(users[0])).toEqual(['name', 'age'])
      })

      it('retorna campo con alias', async () => {
        const users = await source.table('users').select({ name: 'name', alias: 'nombre' }).get()

        expect(users[0].nombre).toBeDefined()
        expect(users[0].name).toBeUndefined()
      })

      it('retorna el primer registro con first()', async () => {
        const user = await source.table('users').orderBy('age').first()

        expect(user).not.toBeNull()
        expect(user!.name).toBe('Bob')
      })

      it('retorna null con first() cuando no hay resultados', async () => {
        const user = await source.table('users').where('name', 'Nadie').first()

        expect(user).toBeNull()
      })

      it('retorna resultados distintos con distinct()', async () => {
        // Hay dos valores posibles de active (0 y 1)
        const rows = await source.table('users').select('active').distinct().get()

        expect(rows).toHaveLength(2)
      })
    })

    // ── WHERE ────────────────────────────────────────────────────────────────

    describe('WHERE', () => {
      it('filtra con igualdad simple', async () => {
        const users = await source.table('users').where('active', 1).get()

        expect(users).toHaveLength(2)
      })

      it('filtra con operador de comparación (>)', async () => {
        const users = await source.table('users').where('age', '>', 28).get()

        expect(users).toHaveLength(2)
        expect(users.map((u: any) => u.name).sort()).toEqual(['Alice', 'Charlie'])
      })

      it('filtra con operador de comparación (<)', async () => {
        const users = await source.table('users').where('age', '<', 30).get()

        expect(users).toHaveLength(1)
        expect(users[0].name).toBe('Bob')
      })

      it('filtra con operador de comparación (<>)', async () => {
        const users = await source.table('users').where('active', '<>', 1).get()

        expect(users).toHaveLength(1)
        expect(users[0].name).toBe('Charlie')
      })

      it('filtra con múltiples condiciones AND', async () => {
        const users = await source.table('users').where('active', 1).where('age', '>', 26).get()

        expect(users).toHaveLength(1)
        expect(users[0].name).toBe('Alice')
      })

      it('filtra con OR WHERE', async () => {
        const users = await source.table('users').where('name', 'Alice').orWhere('name', 'Bob').get()

        expect(users).toHaveLength(2)
      })

      it('filtra con IN sobre lista de valores', async () => {
        const users = await source.table('users').where('age', 'in', [25, 35]).orderBy('age').get()

        expect(users).toHaveLength(2)
        expect(users[0].name).toBe('Bob')
        expect(users[1].name).toBe('Charlie')
      })

      it('filtra con IS NULL', async () => {
        // Ningún usuario tiene email null → resultado vacío
        const users = await source.table('users').where('email', null).get()

        expect(users).toHaveLength(0)
      })

      it('filtra con grupo de condiciones (paréntesis) usando ConditionGroup', async () => {
        const { DB } = await import('../src')
        // (name = 'Alice' OR name = 'Bob') AND active = 1
        const users = await source
          .table('users')
          .where(DB.conditionGroup().where('name', 'Alice').orWhere('name', 'Bob'))
          .where('active', 1)
          .get()

        expect(users).toHaveLength(2)
        expect(users.map((u: any) => u.name).sort()).toEqual(['Alice', 'Bob'])
      })

      it('filtra con grupo de condiciones usando callback', async () => {
        // (name = 'Alice' OR name = 'Bob') AND active = 1
        const users = await source
          .table('users')
          .where((group) => group.where('name', 'Alice').orWhere('name', 'Bob'))
          .where('active', 1)
          .get()

        expect(users).toHaveLength(2)
        expect(users.map((u: any) => u.name).sort()).toEqual(['Alice', 'Bob'])
      })

      it('filtra con callbacks anidados (grupos dentro de grupos)', async () => {
        // (active = 1 AND (age < 28 OR age > 33))
        // → activos fuera del rango [28, 33]: solo Bob(25, activo)
        const users = await source
          .table('users')
          .where((group) =>
            group.where('active', 1).where((inner) => inner.where('age', '<', 28).orWhere('age', '>', 33))
          )
          .get()

        expect(users).toHaveLength(1)
        expect(users[0].name).toBe('Bob')
      })

      it('filtra con orWhere recibiendo callback', async () => {
        // name = 'Charlie' OR (active = 1 AND age < 28)
        // → Charlie(35, inactivo) OR Bob(25, activo) → [Charlie, Bob]
        const users = await source
          .table('users')
          .where('name', 'Charlie')
          .orWhere((group) => group.where('active', 1).where('age', '<', 28))
          .get()

        expect(users).toHaveLength(2)
        expect(users.map((u: any) => u.name).sort()).toEqual(['Bob', 'Charlie'])
      })

      it('filtra con BETWEEN (rango inclusivo)', async () => {
        // Bob(25), Alice(30) están en [25, 30]; Charlie(35) queda fuera
        const users = await source.table('users').where('age', 'BETWEEN', [25, 30]).orderBy('age').get()

        expect(users).toHaveLength(2)
        expect(users[0].name).toBe('Bob')
        expect(users[1].name).toBe('Alice')
      })

      it('filtra con NOT BETWEEN', async () => {
        // Solo Charlie(35) queda fuera del rango [25, 30]
        const users = await source.table('users').where('age', 'NOT BETWEEN', [25, 30]).get()

        expect(users).toHaveLength(1)
        expect(users[0].name).toBe('Charlie')
      })

      it('filtra con LIKE', async () => {
        const users = await source.table('users').where('email', 'LIKE', '%example.com').get()

        expect(users).toHaveLength(3)
      })

      it('filtra con NOT LIKE', async () => {
        const users = await source.table('users').where('name', 'NOT LIKE', 'A%').get()

        expect(users).toHaveLength(2)
        expect(users.map((u: any) => u.name).sort()).toEqual(['Bob', 'Charlie'])
      })

      // whereLike / whereNotLike
      it('whereLike filtra con patrón LIKE', async () => {
        const users = await source.table('users').whereLike('email', '%example.com').get()

        expect(users).toHaveLength(3)
      })

      it('whereNotLike excluye registros que coinciden con el patrón', async () => {
        const users = await source.table('users').whereNotLike('name', 'A%').get()

        expect(users).toHaveLength(2)
        expect(users.map((u: any) => u.name).sort()).toEqual(['Bob', 'Charlie'])
      })

      it('orWhereLike combina con OR', async () => {
        // name = 'Charlie' OR email LIKE 'alice%'  → Charlie + Alice
        const users = await source.table('users').where('name', 'Charlie').orWhereLike('email', 'alice%').get()

        expect(users).toHaveLength(2)
        expect(users.map((u: any) => u.name).sort()).toEqual(['Alice', 'Charlie'])
      })

      it('orWhereNotLike combina con OR', async () => {
        // active = 0 OR name NOT LIKE 'A%'  → Charlie (inactivo y no empieza con A) + Bob
        const users = await source.table('users').where('active', 0).orWhereNotLike('name', 'A%').get()

        expect(users).toHaveLength(2)
        expect(users.map((u: any) => u.name).sort()).toEqual(['Bob', 'Charlie'])
      })

      it('filtra con NOT IN', async () => {
        const users = await source.table('users').where('age', 'NOT IN', [25, 35]).get()

        expect(users).toHaveLength(1)
        expect(users[0].name).toBe('Alice')
      })

      // whereIn / whereNotIn
      it('whereIn retorna solo los registros cuyo campo está en la lista', async () => {
        const users = await source.table('users').whereIn('name', ['Alice', 'Bob']).get()

        expect(users).toHaveLength(2)
        expect(users.map((u: any) => u.name).sort()).toEqual(['Alice', 'Bob'])
      })

      it('whereNotIn excluye los registros cuyo campo está en la lista', async () => {
        const users = await source.table('users').whereNotIn('name', ['Alice', 'Bob']).get()

        expect(users).toHaveLength(1)
        expect(users[0].name).toBe('Charlie')
      })

      it('orWhereIn combina con OR', async () => {
        // name = 'Charlie' OR age IN (25, 30)  → los tres
        const users = await source.table('users').where('name', 'Charlie').orWhereIn('age', [25, 30]).get()

        expect(users).toHaveLength(3)
      })

      it('orWhereNotIn combina con OR', async () => {
        // active = 0 OR age NOT IN (25, 30)  → Charlie (inactivo y 35)
        const users = await source.table('users').where('active', 0).orWhereNotIn('age', [25, 30]).get()

        expect(users).toHaveLength(1)
        expect(users[0].name).toBe('Charlie')
      })

      // whereBetween / whereNotBetween
      it('whereBetween retorna registros dentro del rango', async () => {
        const users = await source.table('users').whereBetween('age', [25, 30]).orderBy('age').get()

        expect(users).toHaveLength(2)
        expect(users[0].name).toBe('Bob')
        expect(users[1].name).toBe('Alice')
      })

      it('whereNotBetween retorna registros fuera del rango', async () => {
        const users = await source.table('users').whereNotBetween('age', [25, 30]).get()

        expect(users).toHaveLength(1)
        expect(users[0].name).toBe('Charlie')
      })

      it('orWhereBetween combina con OR', async () => {
        // name = 'Charlie' OR age BETWEEN 25 AND 26  → Charlie + Bob
        const users = await source.table('users').where('name', 'Charlie').orWhereBetween('age', [25, 26]).get()

        expect(users).toHaveLength(2)
        expect(users.map((u: any) => u.name).sort()).toEqual(['Bob', 'Charlie'])
      })

      it('orWhereNotBetween combina con OR', async () => {
        // active = 1 OR age NOT BETWEEN 25 AND 34  → Alice + Bob (activos) + Charlie (35)
        const users = await source.table('users').where('active', 1).orWhereNotBetween('age', [25, 34]).get()

        expect(users).toHaveLength(3)
      })

      // whereNull / whereNotNull
      // La columna `nickname` es nullable; los usuarios seed tienen nickname = NULL.
      // Sólo los que se insertan en cada test con nickname explícito son NOT NULL.
      it('whereNull retorna registros con campo NULL', async () => {
        // Alice, Bob y Charlie tienen nickname NULL; Dave tiene nickname asignado
        await source
          .table('users')
          .setFieldValue('name', 'Dave')
          .setFieldValue('email', 'dave@example.com')
          .setFieldValue('age', 28)
          .setFieldValue('nickname', 'dv')
          .insert()

        const users = await source.table('users').whereNull('nickname').get()

        expect(users).toHaveLength(3)
        expect(users.map((u: any) => u.name).sort()).toEqual(['Alice', 'Bob', 'Charlie'])
      })

      it('whereNotNull retorna registros donde el campo NO es NULL', async () => {
        await source
          .table('users')
          .setFieldValue('name', 'Dave')
          .setFieldValue('email', 'dave@example.com')
          .setFieldValue('age', 28)
          .setFieldValue('nickname', 'dv')
          .insert()

        const users = await source.table('users').whereNotNull('nickname').get()

        expect(users).toHaveLength(1)
        expect(users[0].name).toBe('Dave')
      })

      it('orWhereNull combina con OR', async () => {
        await source
          .table('users')
          .setFieldValue('name', 'Dave')
          .setFieldValue('email', 'dave@example.com')
          .setFieldValue('age', 28)
          .setFieldValue('nickname', 'dv')
          .insert()

        // name = 'Dave' OR nickname IS NULL → Dave + Alice + Bob + Charlie
        const users = await source.table('users').where('name', 'Dave').orWhereNull('nickname').get()

        expect(users).toHaveLength(4)
      })

      it('orWhereNotNull combina con OR', async () => {
        await source
          .table('users')
          .setFieldValue('name', 'Dave')
          .setFieldValue('email', 'dave@example.com')
          .setFieldValue('age', 28)
          .setFieldValue('nickname', 'dv')
          .insert()

        // active = 0 OR nickname IS NOT NULL → Charlie (inactivo) + Dave (nickname asignado)
        const users = await source.table('users').where('active', 0).orWhereNotNull('nickname').get()

        expect(users).toHaveLength(2)
        expect(users.map((u: any) => u.name).sort()).toEqual(['Charlie', 'Dave'])
      })
    })

    // ── UNION ────────────────────────────────────────────────────────────────

    describe('UNION / UNION ALL', () => {
      it('UNION combina dos SELECT eliminando duplicados', async () => {
        const { DB } = await import('../src')
        // active=1 → Alice, Bob | age > 28 → Alice, Charlie
        // UNION: Alice, Bob, Charlie (Alice deduplicada)
        const query = DB.selectQuery('users')
          .select('name')
          .where('active', 1)
          .union(DB.selectQuery('users').select('name').where('age', '>', 28))
        const rows = await source.query(query)

        expect(rows).toHaveLength(3)
        expect(rows.map((r: any) => r.name).sort()).toEqual(['Alice', 'Bob', 'Charlie'])
      })

      it('UNION ALL combina dos SELECT conservando duplicados', async () => {
        const { DB } = await import('../src')
        // active=1 → Alice, Bob | age > 28 → Alice, Charlie
        // UNION ALL: Alice, Bob, Alice, Charlie (Alice aparece dos veces)
        const query = DB.selectQuery('users')
          .select('name')
          .where('active', 1)
          .unionAll(DB.selectQuery('users').select('name').where('age', '>', 28))
        const rows = await source.query(query)

        expect(rows).toHaveLength(4)
        expect(rows.filter((r: any) => r.name === 'Alice')).toHaveLength(2)
      })

      it('UNION de múltiples queries', async () => {
        const { DB } = await import('../src')
        const query = DB.selectQuery('users')
          .select('name')
          .where('name', 'Alice')
          .union(DB.selectQuery('users').select('name').where('name', 'Bob'))
          .union(DB.selectQuery('users').select('name').where('name', 'Charlie'))
        const rows = await source.query(query)

        expect(rows).toHaveLength(3)
      })
    })

    // ── ORDER BY ─────────────────────────────────────────────────────────────

    describe('ORDER BY', () => {
      it('ordena ASC por campo numérico', async () => {
        const users = await source.table('users').orderBy('age', OrderByDirection.ASC).get()

        expect(users[0].name).toBe('Bob')
        expect(users[2].name).toBe('Charlie')
      })

      it('ordena DESC por campo numérico', async () => {
        const users = await source.table('users').orderBy('age', OrderByDirection.DESC).get()

        expect(users[0].name).toBe('Charlie')
        expect(users[2].name).toBe('Bob')
      })

      it('ordena ASC por campo de texto', async () => {
        const users = await source.table('users').orderBy('name', OrderByDirection.ASC).get()

        expect(users[0].name).toBe('Alice')
        expect(users[2].name).toBe('Charlie')
      })

      it('ordena por múltiples campos', async () => {
        // Primero por active DESC, luego por age ASC
        const users = await source
          .table('users')
          .orderBy('active', OrderByDirection.DESC)
          .orderBy('age', OrderByDirection.ASC)
          .get()

        // active=1: Bob(25), Alice(30) → active=0: Charlie(35)
        expect(users[0].name).toBe('Bob')
        expect(users[1].name).toBe('Alice')
        expect(users[2].name).toBe('Charlie')
      })
    })

    // ── LIMIT / OFFSET ───────────────────────────────────────────────────────

    describe('LIMIT / OFFSET', () => {
      it('aplica LIMIT correctamente', async () => {
        const users = await source.table('users').orderBy('age').limit(2).get()

        expect(users).toHaveLength(2)
      })

      it('aplica LIMIT + OFFSET correctamente', async () => {
        // ordenados por age: Bob(25), Alice(30), Charlie(35)
        const users = await source.table('users').orderBy('age').limit(1).offset(1).get()

        expect(users).toHaveLength(1)
        expect(users[0].name).toBe('Alice')
      })

      it('OFFSET sin LIMIT retorna desde la posición indicada', async () => {
        const users = await source.table('users').orderBy('age').offset(2).get()

        expect(users).toHaveLength(1)
        expect(users[0].name).toBe('Charlie')
      })

      it('LIMIT mayor que los registros retorna todos', async () => {
        const users = await source.table('users').limit(100).get()

        expect(users).toHaveLength(3)
      })
    })

    // ── COUNT ───────────────────────────────────────────────────────────────

    describe('COUNT', () => {
      it('cuenta todos los registros', async () => {
        const total = await source.table('users').count()

        expect(total).toBe(3)
      })

      it('cuenta respetando las condiciones WHERE', async () => {
        const total = await source.table('users').where('active', 1).count()

        expect(total).toBe(2)
      })

      it('retorna 0 cuando no hay coincidencias', async () => {
        const total = await source.table('users').where('name', 'Zoe').count()

        expect(total).toBe(0)
      })

      it('cuenta valores distintos con distinct()', async () => {
        // Alice y Bob comparten active=1, Charlie active=0 → 2 valores distintos
        const total = await source.table('users').distinct().count('active')

        expect(total).toBe(2)
      })

      it('cuenta los grupos cuando hay GROUP BY', async () => {
        const total = await source.table('users').groupBy('active').count()

        expect(total).toBe(2)
      })
    })

    // ── PAGINATE ────────────────────────────────────────────────────────────

    describe('PAGINATE', () => {
      it('retorna la primera página con metadata', async () => {
        const page = await source.table('users').orderBy('age').paginate(2, 1)

        expect(page.total).toBe(3)
        expect(page.perPage).toBe(2)
        expect(page.currentPage).toBe(1)
        expect(page.lastPage).toBe(2)
        expect(page.from).toBe(1)
        expect(page.to).toBe(2)
        expect(page.data).toHaveLength(2)
        // ordenados por age: Bob(25), Alice(30)
        expect(page.data.map((u: any) => u.name)).toEqual(['Bob', 'Alice'])
      })

      it('retorna la última página parcial', async () => {
        const page = await source.table('users').orderBy('age').paginate(2, 2)

        expect(page.currentPage).toBe(2)
        expect(page.lastPage).toBe(2)
        expect(page.from).toBe(3)
        expect(page.to).toBe(3)
        expect(page.data).toHaveLength(1)
        expect(page.data[0].name).toBe('Charlie')
      })

      it('respeta las condiciones WHERE en total y datos', async () => {
        const page = await source.table('users').where('active', 1).orderBy('age').paginate(1, 1)

        expect(page.total).toBe(2)
        expect(page.lastPage).toBe(2)
        expect(page.data).toHaveLength(1)
        expect(page.data[0].name).toBe('Bob')
      })

      it('usa 15 por página por defecto', async () => {
        const page = await source.table('users').paginate()

        expect(page.perPage).toBe(15)
        expect(page.currentPage).toBe(1)
        expect(page.lastPage).toBe(1)
        expect(page.data).toHaveLength(3)
      })

      it('retorna metadata vacía cuando no hay registros', async () => {
        const page = await source.table('users').where('name', 'Zoe').paginate(10, 1)

        expect(page.total).toBe(0)
        expect(page.lastPage).toBe(1)
        expect(page.from).toBeNull()
        expect(page.to).toBeNull()
        expect(page.data).toHaveLength(0)
      })
    })

    // ── GROUP BY ────────────────────────────────────────────────────────────

    describe('GROUP BY', () => {
      it('agrupa por campo y cuenta registros', async () => {
        // active=0: Charlie (1 usuario) | active=1: Alice, Bob (2 usuarios)
        const groups = await source
          .table('users')
          .select('active', { name: 'id', function: 'count', alias: 'total' })
          .groupBy('active')
          .orderBy('active')
          .get()

        expect(groups).toHaveLength(2)
        expect(groups[0].active).toBe(0)
        expect(groups[0].total).toBe(1)
        expect(groups[1].active).toBe(1)
        expect(groups[1].total).toBe(2)
      })

      it('agrupa y suma un campo numérico', async () => {
        // Suma de edades por estado activo
        const groups = await source
          .table('users')
          .select('active', { name: 'age', function: 'sum', alias: 'total_age' })
          .groupBy('active')
          .orderBy('active')
          .get()

        expect(groups).toHaveLength(2)
        expect(groups[0].total_age).toBe(35) // Charlie (age=35, active=0)
        expect(groups[1].total_age).toBe(55) // Alice(30) + Bob(25) (active=1)
      })

      it('agrupa y calcula el promedio de un campo numérico', async () => {
        const groups = await source
          .table('users')
          .select('active', { name: 'age', function: 'avg', alias: 'avg_age' })
          .groupBy('active')
          .orderBy('active')
          .get()

        expect(groups).toHaveLength(2)
        expect(groups[0].avg_age).toBe(35) // Charlie
        expect(groups[1].avg_age).toBe(27.5) // (30 + 25) / 2
      })
    })

    // ── HAVING ──────────────────────────────────────────────────────────────

    describe('HAVING', () => {
      it('filtra grupos cuyo conteo supera un umbral', async () => {
        // Solo el grupo active=1 tiene más de 1 usuario
        const groups = await source
          .table('users')
          .select('active', { name: 'id', function: 'count', alias: 'total' })
          .groupBy('active')
          .having('COUNT(id)', '>', 1)
          .get()

        expect(groups).toHaveLength(1)
        expect(groups[0].active).toBe(1)
        expect(groups[0].total).toBe(2)
      })

      it('combina WHERE y HAVING', async () => {
        // Solo usuarios menores de 33 → Bob(25) y Alice(30), ambos active=1
        // WHERE age < 33: descarta a Charlie → quedan Alice y Bob en active=1
        // HAVING COUNT >= 2 → solo ese grupo pasa
        const groups = await source
          .table('users')
          .select('active', { name: 'id', function: 'count', alias: 'total' })
          .where('age', '<', 33)
          .groupBy('active')
          .having('COUNT(id)', '>=', 2)
          .get()

        expect(groups).toHaveLength(1)
        expect(groups[0].active).toBe(1)
        expect(groups[0].total).toBe(2)
      })
    })

    // ── JOINS ───────────────────────────────────────────────────────────────

    describe('JOINS', () => {
      beforeEach(async () => {
        await seedOrders()
      })

      it('INNER JOIN: retorna solo usuarios con órdenes', async () => {
        // Alice (2 órdenes) y Bob (1 orden) → Charlie excluido
        const rows = await source
          .table('users')
          .select({ name: 'name', table: 'users' }, { name: 'product', table: 'orders' })
          .innerJoin('orders', { name: 'id', table: 'users' }, { name: 'user_id', table: 'orders' })
          .orderBy({ name: 'name', table: 'users' })
          .get()

        expect(rows).toHaveLength(3) // Alice×2 + Bob×1
        expect(rows.map((r: any) => r.name).sort()).toEqual(['Alice', 'Alice', 'Bob'])
      })

      it('INNER JOIN con WHERE: filtra filas del resultado combinado', async () => {
        const rows = await source
          .table('users')
          .select({ name: 'name', table: 'users' }, { name: 'amount', table: 'orders' })
          .innerJoin('orders', { name: 'id', table: 'users' }, { name: 'user_id', table: 'orders' })
          .where({ name: 'amount', table: 'orders' }, '>', 10)
          .get()

        // Solo la orden de Alice con amount=24.99 supera 10
        expect(rows).toHaveLength(1)
        expect(rows[0].name).toBe('Alice')
        expect(rows[0].amount).toBe(24.99)
      })

      it('LEFT JOIN: incluye todos los usuarios, con o sin órdenes', async () => {
        const rows = await source
          .table('users')
          .select({ name: 'name', table: 'users' }, { name: 'product', table: 'orders' })
          .leftJoin('orders', { name: 'id', table: 'users' }, { name: 'user_id', table: 'orders' })
          .orderBy({ name: 'name', table: 'users' })
          .get()

        // Alice×2 + Bob×1 + Charlie×1(product=null)
        expect(rows).toHaveLength(4)

        const charlie = rows.find((r: any) => r.name === 'Charlie')

        expect(charlie).toBeDefined()
        expect(charlie!.product).toBeNull()
      })

      it('INNER JOIN con GROUP BY: total de órdenes por usuario', async () => {
        const rows = await source
          .table('users')
          .select(
            { name: 'name', table: 'users' },
            { name: 'id', table: 'orders', function: 'count', alias: 'order_count' }
          )
          .innerJoin('orders', { name: 'id', table: 'users' }, { name: 'user_id', table: 'orders' })
          .groupBy({ name: 'user_id', table: 'orders' })
          .orderBy({ name: 'name', table: 'users' })
          .get()

        expect(rows).toHaveLength(2) // Alice y Bob (Charlie no tiene órdenes)
        expect(rows[0].name).toBe('Alice')
        expect(rows[0].order_count).toBe(2)
        expect(rows[1].name).toBe('Bob')
        expect(rows[1].order_count).toBe(1)
      })

      // ── notación string 'tabla.campo' ────────────────────────────────────────

      it('INNER JOIN con notación string (tabla.campo)', async () => {
        const rows = await source
          .table('users')
          .select('users.name', 'orders.product')
          .innerJoin('orders', 'users.id', 'orders.user_id')
          .orderBy('users.name')
          .get()

        expect(rows).toHaveLength(3)
        expect(rows.map((r: any) => r.name).sort()).toEqual(['Alice', 'Alice', 'Bob'])
      })

      it('LEFT JOIN con notación string y WHERE', async () => {
        const rows = await source
          .table('users')
          .select('users.name', 'orders.amount')
          .leftJoin('orders', 'users.id', 'orders.user_id')
          .where('orders.amount', '>', 10)
          .get()

        expect(rows).toHaveLength(1)
        expect(rows[0].name).toBe('Alice')
      })

      it('buildRawFieldString — función aplicada a campo calificado', async () => {
        // COUNT(orders.id) en notación string
        const rows = await source
          .table('users')
          .select('users.name', 'COUNT(orders.id) AS order_count')
          .innerJoin('orders', 'users.id', 'orders.user_id')
          .groupBy('users.id')
          .orderBy('users.name')
          .get()

        expect(rows).toHaveLength(2)
        expect(rows[0].name).toBe('Alice')
        expect(Number(rows[0].order_count)).toBe(2)
        expect(rows[1].name).toBe('Bob')
        expect(Number(rows[1].order_count)).toBe(1)
      })
    })
  })

  // ─── GROUPED CONDITION CALLBACKS ─────────────────────────────────────────

  describe('Grouped condition callbacks con métodos de conveniencia', () => {
    beforeEach(async () => {
      await seedUsers()
    })

    it('whereIn dentro de un callback de grupo', async () => {
      const users = await source
        .table('users')
        .where((q) => q.whereIn('age', [25, 35]))
        .get()

      expect(users).toHaveLength(2)
      expect(users.map((u: any) => u.name).sort()).toEqual(['Bob', 'Charlie'])
    })

    it('whereBetween dentro de un callback de grupo', async () => {
      const users = await source
        .table('users')
        .where((q) => q.whereBetween('age', [25, 30]))
        .get()

      expect(users).toHaveLength(2)
      expect(users.map((u: any) => u.name).sort()).toEqual(['Alice', 'Bob'])
    })

    it('whereNull dentro de un callback de grupo', async () => {
      await source.table('users').where('name', 'Alice').setFieldValue('nickname', 'Ali').update()
      const users = await source
        .table('users')
        .where((q) => q.whereNull('nickname'))
        .get()

      expect(users).toHaveLength(2)
      expect(users.find((u: any) => u.name === 'Alice')).toBeUndefined()
    })

    it('whereLike dentro de un callback de grupo', async () => {
      const users = await source
        .table('users')
        .where((q) => q.whereLike('email', '%@example.com'))
        .get()

      expect(users).toHaveLength(3)
    })

    it('combina whereIn y orWhere dentro del mismo grupo', async () => {
      // (age IN (25, 30)) OR name = 'Charlie'
      const users = await source
        .table('users')
        .where((q) => q.whereIn('age', [25, 30]).orWhere('name', 'Charlie'))
        .get()

      expect(users).toHaveLength(3)
    })

    it('callbacks anidados con whereBetween y whereNull', async () => {
      // (age BETWEEN 25 AND 30 OR nickname IS NULL) AND active = 1
      const users = await source
        .table('users')
        .where((q) => q.whereBetween('age', [25, 30]).orWhereNull('nickname'))
        .where('active', 1)
        .get()

      // Alice (age=30, active=1) y Bob (age=25, active=1) — Charlie is inactive
      expect(users).toHaveLength(2)
      expect(users.map((u: any) => u.name).sort()).toEqual(['Alice', 'Bob'])
    })
  })

  // ─── WHERE COLUMN ─────────────────────────────────────────────────────────

  describe('whereColumn / orWhereColumn', () => {
    beforeEach(async () => {
      // Seed orders with varying amounts; use amount and user_id to test column comparison
      await seedUsers()
      await seedOrders()
    })

    it('whereColumn compara dos columnas con = implícito', async () => {
      // user_id = id is always true for every row; use a self-join scenario via raw table
      // Simpler: create a helper table where col_a = col_b for some rows
      await source.execute(`
        CREATE TABLE IF NOT EXISTS col_test (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          col_a INTEGER NOT NULL,
          col_b INTEGER NOT NULL
        )
      `)
      await source.execute('DELETE FROM col_test')
      await source.execute('INSERT INTO col_test (col_a, col_b) VALUES (1, 1), (2, 3), (4, 4)')

      const rows = await source.table('col_test').whereColumn('col_a', 'col_b').get()

      expect(rows).toHaveLength(2)
      expect(rows.every((r: any) => r.col_a === r.col_b)).toBe(true)
    })

    it('whereColumn compara dos columnas con operador explícito >', async () => {
      await source.execute('DELETE FROM col_test')
      await source.execute('INSERT INTO col_test (col_a, col_b) VALUES (5, 3), (1, 2), (7, 7)')

      const rows = await source.table('col_test').whereColumn('col_a', '>', 'col_b').get()

      expect(rows).toHaveLength(1)
      expect(rows[0].col_a).toBe(5)
    })

    it('orWhereColumn agrega condición OR de comparación de columnas', async () => {
      await source.execute('DELETE FROM col_test')
      await source.execute('INSERT INTO col_test (col_a, col_b) VALUES (1, 1), (5, 3), (2, 2)')

      // col_a = col_b OR col_a > col_b
      const rows = await source
        .table('col_test')
        .whereColumn('col_a', 'col_b')
        .orWhereColumn('col_a', '>', 'col_b')
        .get()

      expect(rows).toHaveLength(3)
    })

    it('whereColumn dentro de un callback de grupo', async () => {
      await source.execute('DELETE FROM col_test')
      await source.execute('INSERT INTO col_test (col_a, col_b) VALUES (1, 1), (5, 3), (2, 2), (9, 1)')

      // (col_a = col_b OR col_a > col_b) AND col_b >= 1
      const rows = await source
        .table('col_test')
        .where((q) => q.whereColumn('col_a', 'col_b').orWhereColumn('col_a', '>', 'col_b'))
        .get()

      expect(rows).toHaveLength(4)
    })
  })

  // ─── UPDATE ──────────────────────────────────────────────────────────────

  describe('UPDATE', () => {
    beforeEach(async () => {
      await seedUsers()
    })

    it('actualiza un registro específico con WHERE', async () => {
      const changes = await source.table('users').setFieldValue('age', 31).where('name', 'Alice').update()

      expect(changes).toBe(1)

      const user = await source.table('users').where('name', 'Alice').first()

      expect(user!.age).toBe(31)
    })

    it('actualiza múltiples campos a la vez', async () => {
      await source.table('users').setFieldValue('age', 26).setFieldValue('active', 0).where('name', 'Bob').update()

      const user = await source.table('users').where('name', 'Bob').first()

      expect(user!.age).toBe(26)
      expect(user!.active).toBe(0)
    })

    it('actualiza todos los registros cuando no hay WHERE', async () => {
      const changes = await source.table('users').setFieldValue('active', 0).update()

      expect(changes).toBe(3)

      const activeUsers = await source.table('users').where('active', 1).get()

      expect(activeUsers).toHaveLength(0)
    })

    it('update acepta un objeto de fields como argumento', async () => {
      const changes = await source.table('users').where('name', 'Alice').update({ age: 99, active: 0 })

      expect(changes).toBe(1)

      const user = await source.table('users').where('name', 'Alice').first()

      expect(user!.age).toBe(99)
      expect(user!.active).toBe(0)
    })
  })

  // ─── DELETE ──────────────────────────────────────────────────────────────

  describe('DELETE', () => {
    beforeEach(async () => {
      await seedUsers()
    })

    it('elimina un registro con WHERE', async () => {
      const changes = await source.table('users').where('name', 'Bob').delete()

      expect(changes).toBe(1)

      const users = await source.table('users').get()

      expect(users).toHaveLength(2)
      expect(users.find((u: any) => u.name === 'Bob')).toBeUndefined()
    })

    it('elimina múltiples registros con WHERE', async () => {
      const changes = await source.table('users').where('active', 1).delete()

      expect(changes).toBe(2)
    })

    it('elimina todos los registros sin WHERE', async () => {
      const changes = await source.table('users').delete()

      expect(changes).toBe(3)

      const users = await source.table('users').get()

      expect(users).toHaveLength(0)
    })
  })

  // ─── COERCIÓN DE BINDINGS (boolean / Date / undefined) ──────────────────
  //
  // node:sqlite (DatabaseSync) sólo acepta null, number, bigint, string y Buffer
  // como parámetros bindeados: pasarle un boolean, un Date o undefined lanza
  // `TypeError: Provided value cannot be bound to SQLite parameter N`. Postgres
  // y MySQL bindean esos tipos nativamente, así que el resto del query builder
  // / active record los pasa tal cual, sin cast — es responsabilidad exclusiva
  // de SqliteConnection normalizarlos antes de llegar al driver.

  describe('Coerción de bindings (boolean / Date / undefined)', () => {
    beforeEach(async () => {
      await source.execute(`
        CREATE TABLE IF NOT EXISTS events (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          name        TEXT    NOT NULL,
          featured    INTEGER NOT NULL DEFAULT 0,
          happened_at TEXT,
          notes       TEXT
        )
      `)
      await source.execute('DELETE FROM events')
    })

    it('setFieldValue con un boolean real no lanza y se persiste como 0/1', async () => {
      await source.table('events').setFieldValue('name', 'Launch').setFieldValue('featured', true).insert()
      await source.table('events').setFieldValue('name', 'Retro').setFieldValue('featured', false).insert()

      const featured = await source.table('events').where('featured', true).get()
      const notFeatured = await source.table('events').where('featured', false).get()

      expect(featured).toHaveLength(1)
      expect(featured[0].name).toBe('Launch')
      expect(featured[0].featured).toBe(1)
      expect(notFeatured).toHaveLength(1)
      expect(notFeatured[0].featured).toBe(0)
    })

    it('setFieldValue con un Date real no lanza y se persiste como ISO string', async () => {
      const when = new Date('2026-01-15T10:30:00.000Z')

      await source.table('events').setFieldValue('name', 'Kickoff').setFieldValue('happened_at', when).insert()

      const event = await source.table('events').where('name', 'Kickoff').first()

      expect(event!.happened_at).toBe(when.toISOString())
    })

    it('where(...) comparando contra un Date real no lanza', async () => {
      const when = new Date('2026-02-01T00:00:00.000Z')

      await source.table('events').setFieldValue('name', 'Anniversary').setFieldValue('happened_at', when).insert()

      const events = await source.table('events').where('happened_at', when).get()

      expect(events).toHaveLength(1)
      expect(events[0].name).toBe('Anniversary')
    })

    it('setFieldValue con undefined no lanza y se persiste como NULL', async () => {
      await source.table('events').setFieldValue('name', 'No notes').setFieldValue('notes', undefined).insert()

      const event = await source.table('events').where('name', 'No notes').first()

      expect(event!.notes).toBeNull()
    })

    it('update(...) con boolean y Date reales no lanza', async () => {
      await source.table('events').setFieldValue('name', 'Draft').setFieldValue('featured', false).insert()

      const when = new Date('2026-03-01T00:00:00.000Z')
      const changes = await source
        .table('events')
        .where('name', 'Draft')
        .setFieldValue('featured', true)
        .setFieldValue('happened_at', when)
        .update()

      expect(changes).toBe(1)

      const event = await source.table('events').where('name', 'Draft').first()

      expect(event!.featured).toBe(1)
      expect(event!.happened_at).toBe(when.toISOString())
    })

    it('execute(...) crudo con boolean/Date/undefined en las bindings no lanza', async () => {
      const changes = await source.execute(
        'INSERT INTO events (name, featured, happened_at, notes) VALUES (?, ?, ?, ?)',
        ['Raw', true, new Date('2026-04-01T00:00:00.000Z'), undefined]
      )

      expect(changes).toBe(1)

      const rows = await source.query('SELECT * FROM events WHERE name = ?', ['Raw'])

      expect(rows).toHaveLength(1)
      expect(rows[0].featured).toBe(1)
      expect(rows[0].happened_at).toBe('2026-04-01T00:00:00.000Z')
      expect(rows[0].notes).toBeNull()
    })
  })

  // ─── TRANSACTIONS ────────────────────────────────────────────────────────

  describe('TRANSACTIONS', () => {
    beforeEach(async () => {
      await source
        .table('users')
        .setFieldValue('name', 'Alice')
        .setFieldValue('email', 'alice@example.com')
        .setFieldValue('age', 30)
        .insert()
    })

    it('commit: los cambios persisten después de confirmar', async () => {
      const conn = await source.getConnection()

      try {
        await conn.beginTransaction()
        await conn.execute('INSERT INTO users (name, email, age) VALUES (?, ?, ?)', ['Bob', 'bob@example.com', 25])
        await conn.commitTransaction()
      } finally {
        await conn.close()
      }

      const users = await source.table('users').get()

      expect(users).toHaveLength(2)
    })

    it('rollback: los cambios se revierten al hacer rollback', async () => {
      const conn = await source.getConnection()

      try {
        await conn.beginTransaction()
        await conn.execute('INSERT INTO users (name, email, age) VALUES (?, ?, ?)', [
          'Charlie',
          'charlie@example.com',
          35
        ])
        await conn.rollbackTransaction()
      } finally {
        await conn.close()
      }

      const users = await source.table('users').get()

      expect(users).toHaveLength(1)
    })

    it('executeTransaction: commit automático al completar sin errores', async () => {
      const conn = await source.getConnection()

      await conn.executeTransaction(async (c) => {
        await c.execute('INSERT INTO users (name, email, age) VALUES (?, ?, ?)', ['Bob', 'bob@example.com', 25])
        await c.execute('INSERT INTO users (name, email, age) VALUES (?, ?, ?)', ['Charlie', 'charlie@example.com', 35])
      })

      await conn.close()

      const users = await source.table('users').get()

      expect(users).toHaveLength(3)
    })

    it('executeTransaction: rollback automático al lanzar un error', async () => {
      const conn = await source.getConnection()

      try {
        await conn.executeTransaction(async (c) => {
          await c.execute('INSERT INTO users (name, email, age) VALUES (?, ?, ?)', ['Bob', 'bob@example.com', 25])
          throw new Error('Error simulado')
        })
      } catch {
        // error esperado
      } finally {
        await conn.close()
      }

      const users = await source.table('users').get()

      // Solo Alice (la de beforeEach) debe existir
      expect(users).toHaveLength(1)
    })
  })
})
