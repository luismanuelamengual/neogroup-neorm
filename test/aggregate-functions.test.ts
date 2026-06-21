import { OrderByDirection, SqliteDataSource } from '../src'

/**
 * Suite completa de aggregate functions (COUNT, SUM, AVG, MIN, MAX).
 *
 * Escenarios cubiertos:
 *   1. COUNT — todos los registros, con WHERE, con columna específica, DISTINCT,
 *              con GROUP BY, con HAVING
 *   2. SUM   — simple, con WHERE, con GROUP BY, con HAVING, con JOIN
 *   3. AVG   — simple, con WHERE, con GROUP BY, con HAVING, con JOIN
 *   4. MIN   — simple, con WHERE, con GROUP BY, con JOIN
 *   5. MAX   — simple, con WHERE, con GROUP BY, con JOIN
 *   6. Múltiples agregados en un solo SELECT
 *   7. Raw-string syntax  (e.g. 'SUM(amount) AS total')
 *   8. Agregados con campo calificado (tabla.campo)
 */

describe('Aggregate Functions', () => {
  let source: SqliteDataSource

  // ─── Schema ──────────────────────────────────────────────────────────────

  beforeAll(async () => {
    source = new SqliteDataSource()

    await source.execute(`
      CREATE TABLE departments (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT    NOT NULL
      )
    `)

    await source.execute(`
      CREATE TABLE employees (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT    NOT NULL,
        department_id INTEGER NOT NULL,
        salary        REAL    NOT NULL,
        active        INTEGER NOT NULL DEFAULT 1
      )
    `)

    await source.execute(`
      CREATE TABLE sales (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        amount      REAL    NOT NULL,
        region      TEXT    NOT NULL
      )
    `)
  })

  afterAll(async () => {
    await source.close()
  })

  beforeEach(async () => {
    await source.execute('DELETE FROM sales')
    await source.execute('DELETE FROM employees')
    await source.execute('DELETE FROM departments')
    // Resetea los contadores AUTOINCREMENT para que los IDs sean siempre 1..N
    await source.execute("DELETE FROM sqlite_sequence WHERE name IN ('sales','employees','departments')")

    // Departments: 1=Engineering, 2=Sales, 3=HR
    await source.execute("INSERT INTO departments (name) VALUES ('Engineering'), ('Sales'), ('HR')")

    // Employees (IDs predecibles: Alice=1, Bob=2, Charlie=3, Dave=4, Eve=5, Frank=6)
    // Engineering: Alice(90k,active), Bob(80k,active), Charlie(70k,inactive)
    // Sales      : Dave(60k,active),  Eve(55k,active)
    // HR         : Frank(50k,inactive)
    await source.execute(`
      INSERT INTO employees (name, department_id, salary, active) VALUES
        ('Alice',   1, 90000, 1),
        ('Bob',     1, 80000, 1),
        ('Charlie', 1, 70000, 0),
        ('Dave',    2, 60000, 1),
        ('Eve',     2, 55000, 1),
        ('Frank',   3, 50000, 0)
    `)

    // Sales (employee_id basado en IDs predecibles)
    await source.execute(`
      INSERT INTO sales (employee_id, amount, region) VALUES
        (1, 5000, 'North'),
        (1, 3000, 'South'),
        (2, 4000, 'North'),
        (4, 2000, 'East'),
        (4, 6000, 'East'),
        (5, 1000, 'West')
    `)
  })

  // ─── 1. COUNT ─────────────────────────────────────────────────────────────

  describe('COUNT', () => {
    it('cuenta todos los registros de la tabla', async () => {
      const total = await source.table('employees').count()

      expect(total).toBe(6)
    })

    it('cuenta respetando condición WHERE', async () => {
      const total = await source.table('employees').where('active', 1).count()

      expect(total).toBe(4)
    })

    it('cuenta con columna específica (no *)', async () => {
      const total = await source.table('employees').count('salary')

      expect(total).toBe(6)
    })

    it('COUNT(DISTINCT campo) con distinct()', async () => {
      // 3 departamentos distintos en employees
      const total = await source.table('employees').distinct().count('department_id')

      expect(total).toBe(3)
    })

    it('COUNT DISTINCT con WHERE reduce el universo antes de contar', async () => {
      // Solo activos (Engineering y Sales) → 2 departamentos distintos
      const total = await source.table('employees').where('active', 1).distinct().count('department_id')

      expect(total).toBe(2)
    })

    it('retorna 0 cuando ningún registro cumple el filtro', async () => {
      const total = await source.table('employees').where('salary', '>', 999999).count()

      expect(total).toBe(0)
    })

    it('cuenta los grupos con GROUP BY', async () => {
      // 3 grupos: uno por departamento
      const total = await source.table('employees').groupBy('department_id').count()

      expect(total).toBe(3)
    })

    it('COUNT en SELECT con GROUP BY muestra el conteo por grupo', async () => {
      const rows = await source
        .table('employees')
        .select('department_id', { name: 'id', function: 'count', alias: 'headcount' })
        .groupBy('department_id')
        .orderBy('department_id')
        .get()

      expect(rows).toHaveLength(3)
      expect(rows[0].headcount).toBe(3) // Engineering: Alice, Bob, Charlie
      expect(rows[1].headcount).toBe(2) // Sales: Dave, Eve
      expect(rows[2].headcount).toBe(1) // HR: Frank
    })

    it('COUNT con HAVING filtra grupos con pocos miembros', async () => {
      // Solo departamentos con más de 1 empleado
      const rows = await source
        .table('employees')
        .select('department_id', { name: 'id', function: 'count', alias: 'headcount' })
        .groupBy('department_id')
        .having('COUNT(id)', '>', 1)
        .orderBy('department_id')
        .get()

      expect(rows).toHaveLength(2) // Engineering(3) y Sales(2); HR(1) queda fuera
      expect(rows[0].headcount).toBe(3)
      expect(rows[1].headcount).toBe(2)
    })

    it('COUNT con JOIN cuenta filas del producto cartesiano', async () => {
      // Cada fila de employees×sales donde employee_id coincide
      const rows = await source
        .table('employees')
        .select(
          { name: 'name', table: 'employees' },
          { name: 'id', table: 'sales', function: 'count', alias: 'sale_count' }
        )
        .innerJoin('sales', 'employees.id', 'sales.employee_id')
        .groupBy('employees.id')
        .orderBy('employees.name')
        .get()

      // Alice: 2 ventas, Bob: 1, Dave: 2, Eve: 1 (Charlie y Frank sin ventas)
      expect(rows).toHaveLength(4)
      const alice = rows.find((r: any) => r.name === 'Alice')
      const bob = rows.find((r: any) => r.name === 'Bob')
      const dave = rows.find((r: any) => r.name === 'Dave')

      expect(alice!.sale_count).toBe(2)
      expect(bob!.sale_count).toBe(1)
      expect(dave!.sale_count).toBe(2)
    })
  })

  // ─── 2. SUM ───────────────────────────────────────────────────────────────

  describe('SUM', () => {
    it('suma un campo usando raw-string en select()', async () => {
      const rows = await source.table('employees').select('SUM(salary) AS total').get()

      expect(Number(rows[0].total)).toBe(405000)
    })

    it('suma respetando condición WHERE', async () => {
      const rows = await source.table('employees').select('SUM(salary) AS total').where('active', 1).get()

      expect(Number(rows[0].total)).toBe(285000) // Alice+Bob+Dave+Eve = 90k+80k+60k+55k
    })

    it('suma con GROUP BY vía objeto { function }', async () => {
      const rows = await source
        .table('employees')
        .select('department_id', { name: 'salary', function: 'sum', alias: 'total_salary' })
        .groupBy('department_id')
        .orderBy('department_id')
        .get()

      expect(rows).toHaveLength(3)
      expect(rows[0].total_salary).toBe(240000) // Engineering: 90k+80k+70k
      expect(rows[1].total_salary).toBe(115000) // Sales: 60k+55k
      expect(rows[2].total_salary).toBe(50000) // HR: 50k
    })

    it('suma con HAVING filtra departamentos con nómina alta', async () => {
      const rows = await source
        .table('employees')
        .select('department_id', { name: 'salary', function: 'sum', alias: 'total_salary' })
        .groupBy('department_id')
        .having('SUM(salary)', '>=', 115000)
        .orderBy('department_id')
        .get()

      expect(rows).toHaveLength(2) // Engineering(240k) y Sales(115k); HR(50k) queda fuera
    })

    it('suma monto de ventas con JOIN', async () => {
      const rows = await source
        .table('employees')
        .select(
          { name: 'name', table: 'employees' },
          { name: 'amount', table: 'sales', function: 'sum', alias: 'total_sales' }
        )
        .innerJoin('sales', 'employees.id', 'sales.employee_id')
        .groupBy('employees.id')
        .orderBy('employees.name')
        .get()
      const alice = rows.find((r: any) => r.name === 'Alice')
      const dave = rows.find((r: any) => r.name === 'Dave')

      expect(alice!.total_sales).toBe(8000) // 5000+3000
      expect(dave!.total_sales).toBe(8000) // 2000+6000
    })

    it('suma con campo calificado tabla.campo en raw string', async () => {
      const rows = await source
        .table('employees')
        .select('employees.department_id', 'SUM(employees.salary) AS dept_sum')
        .groupBy('employees.department_id')
        .orderBy('employees.department_id')
        .get()

      expect(Number(rows[0].dept_sum)).toBe(240000)
    })
  })

  // ─── 3. AVG ───────────────────────────────────────────────────────────────

  describe('AVG', () => {
    it('calcula el promedio global via raw string', async () => {
      const rows = await source.table('employees').select('AVG(salary) AS avg_salary').get()

      // (90k+80k+70k+60k+55k+50k)/6 = 405000/6 = 67500
      expect(Number(rows[0].avg_salary)).toBe(67500)
    })

    it('calcula el promedio con WHERE (solo activos)', async () => {
      const rows = await source.table('employees').select('AVG(salary) AS avg_salary').where('active', 1).get()

      // (90k+80k+60k+55k)/4 = 285000/4 = 71250
      expect(Number(rows[0].avg_salary)).toBe(71250)
    })

    it('promedio con GROUP BY vía objeto { function }', async () => {
      const rows = await source
        .table('employees')
        .select('department_id', { name: 'salary', function: 'avg', alias: 'avg_salary' })
        .groupBy('department_id')
        .orderBy('department_id')
        .get()

      expect(rows).toHaveLength(3)
      expect(rows[0].avg_salary).toBeCloseTo(80000) // Engineering: (90k+80k+70k)/3
      expect(rows[1].avg_salary).toBeCloseTo(57500) // Sales: (60k+55k)/2
      expect(rows[2].avg_salary).toBeCloseTo(50000) // HR: 50k
    })

    it('promedio con HAVING excluye grupos con media baja', async () => {
      const rows = await source
        .table('employees')
        .select('department_id', { name: 'salary', function: 'avg', alias: 'avg_salary' })
        .groupBy('department_id')
        .having('AVG(salary)', '>=', 57500)
        .orderBy('department_id')
        .get()

      // Engineering(80k) y Sales(57.5k) pasan; HR(50k) no
      expect(rows).toHaveLength(2)
    })

    it('promedio de ventas por región con JOIN', async () => {
      const rows = await source
        .table('sales')
        .select('region', { name: 'amount', function: 'avg', alias: 'avg_amount' })
        .groupBy('region')
        .orderBy('region')
        .get()
      const north = rows.find((r: any) => r.region === 'North')
      const east = rows.find((r: any) => r.region === 'East')

      // North: (5000+4000)/2 = 4500
      expect(north!.avg_amount).toBe(4500)
      // East: (2000+6000)/2 = 4000
      expect(east!.avg_amount).toBe(4000)
    })
  })

  // ─── 4. MIN ───────────────────────────────────────────────────────────────

  describe('MIN', () => {
    it('obtiene el mínimo global via raw string', async () => {
      const rows = await source.table('employees').select('MIN(salary) AS min_salary').get()

      expect(Number(rows[0].min_salary)).toBe(50000)
    })

    it('obtiene el mínimo con WHERE (solo activos)', async () => {
      const rows = await source.table('employees').select('MIN(salary) AS min_salary').where('active', 1).get()

      expect(Number(rows[0].min_salary)).toBe(55000) // Eve
    })

    it('mínimo con GROUP BY vía objeto { function }', async () => {
      const rows = await source
        .table('employees')
        .select('department_id', { name: 'salary', function: 'min', alias: 'min_salary' })
        .groupBy('department_id')
        .orderBy('department_id')
        .get()

      expect(rows[0].min_salary).toBe(70000) // Engineering: Charlie
      expect(rows[1].min_salary).toBe(55000) // Sales: Eve
      expect(rows[2].min_salary).toBe(50000) // HR: Frank
    })

    it('mínimo con HAVING filtra departamentos cuyo mínimo supera umbral', async () => {
      const rows = await source
        .table('employees')
        .select('department_id', { name: 'salary', function: 'min', alias: 'min_salary' })
        .groupBy('department_id')
        .having('MIN(salary)', '>=', 55000)
        .orderBy('department_id')
        .get()

      // Engineering(min=70k) y Sales(min=55k) pasan; HR(min=50k) no
      expect(rows).toHaveLength(2)
    })

    it('mínimo de ventas por empleado con JOIN', async () => {
      const rows = await source
        .table('employees')
        .select(
          { name: 'name', table: 'employees' },
          { name: 'amount', table: 'sales', function: 'min', alias: 'min_sale' }
        )
        .innerJoin('sales', 'employees.id', 'sales.employee_id')
        .groupBy('employees.id')
        .orderBy('employees.name')
        .get()
      const alice = rows.find((r: any) => r.name === 'Alice')
      const dave = rows.find((r: any) => r.name === 'Dave')

      expect(alice!.min_sale).toBe(3000)
      expect(dave!.min_sale).toBe(2000)
    })

    it('mínimo via raw string con campo calificado', async () => {
      const rows = await source
        .table('sales')
        .select('region', 'MIN(sales.amount) AS min_amount')
        .groupBy('region')
        .orderBy('region')
        .get()
      const west = rows.find((r: any) => r.region === 'West')

      expect(Number(west!.min_amount)).toBe(1000)
    })
  })

  // ─── 5. MAX ───────────────────────────────────────────────────────────────

  describe('MAX', () => {
    it('obtiene el máximo global via raw string', async () => {
      const rows = await source.table('employees').select('MAX(salary) AS max_salary').get()

      expect(Number(rows[0].max_salary)).toBe(90000)
    })

    it('obtiene el máximo con WHERE (solo inactivos)', async () => {
      const rows = await source.table('employees').select('MAX(salary) AS max_salary').where('active', 0).get()

      // Inactivos: Charlie(70k) y Frank(50k) → máximo 70k
      expect(Number(rows[0].max_salary)).toBe(70000)
    })

    it('máximo con GROUP BY vía objeto { function }', async () => {
      const rows = await source
        .table('employees')
        .select('department_id', { name: 'salary', function: 'max', alias: 'max_salary' })
        .groupBy('department_id')
        .orderBy('department_id')
        .get()

      expect(rows[0].max_salary).toBe(90000) // Engineering: Alice
      expect(rows[1].max_salary).toBe(60000) // Sales: Dave
      expect(rows[2].max_salary).toBe(50000) // HR: Frank
    })

    it('máximo con HAVING filtra departamentos con tope alto', async () => {
      const rows = await source
        .table('employees')
        .select('department_id', { name: 'salary', function: 'max', alias: 'max_salary' })
        .groupBy('department_id')
        .having('MAX(salary)', '>', 60000)
        .get()

      // Solo Engineering (max=90k) supera 60k; Sales(60k) no pasa estricto; HR no pasa
      expect(rows).toHaveLength(1)
      expect(rows[0].max_salary).toBe(90000)
    })

    it('máximo de ventas por empleado con JOIN', async () => {
      const rows = await source
        .table('employees')
        .select(
          { name: 'name', table: 'employees' },
          { name: 'amount', table: 'sales', function: 'max', alias: 'max_sale' }
        )
        .innerJoin('sales', 'employees.id', 'sales.employee_id')
        .groupBy('employees.id')
        .orderBy('employees.name')
        .get()
      const alice = rows.find((r: any) => r.name === 'Alice')
      const dave = rows.find((r: any) => r.name === 'Dave')

      expect(alice!.max_sale).toBe(5000)
      expect(dave!.max_sale).toBe(6000)
    })
  })

  // ─── 6. Múltiples agregados en un solo SELECT ─────────────────────────────

  describe('Múltiples agregados en un SELECT', () => {
    it('COUNT, SUM, AVG, MIN, MAX en la misma consulta', async () => {
      const rows = await source
        .table('employees')
        .select(
          'COUNT(*) AS headcount',
          'SUM(salary) AS total',
          'AVG(salary) AS avg',
          'MIN(salary) AS min',
          'MAX(salary) AS max'
        )
        .get()

      expect(Number(rows[0].headcount)).toBe(6)
      expect(Number(rows[0].total)).toBe(405000)
      expect(Number(rows[0].avg)).toBe(67500)
      expect(Number(rows[0].min)).toBe(50000)
      expect(Number(rows[0].max)).toBe(90000)
    })

    it('COUNT, SUM, MIN, MAX por departamento con GROUP BY', async () => {
      const rows = await source
        .table('employees')
        .select(
          'department_id',
          { name: 'id', function: 'count', alias: 'headcount' },
          { name: 'salary', function: 'sum', alias: 'total' },
          { name: 'salary', function: 'min', alias: 'min_sal' },
          { name: 'salary', function: 'max', alias: 'max_sal' }
        )
        .groupBy('department_id')
        .orderBy('department_id')
        .get()

      // Engineering
      expect(rows[0].headcount).toBe(3)
      expect(rows[0].total).toBe(240000)
      expect(rows[0].min_sal).toBe(70000)
      expect(rows[0].max_sal).toBe(90000)
      // Sales
      expect(rows[1].headcount).toBe(2)
      expect(rows[1].total).toBe(115000)
    })

    it('múltiples agregados con WHERE + GROUP BY + HAVING', async () => {
      // Solo empleados activos, agrupados por departamento,
      // solo departamentos con más de 1 activo
      const rows = await source
        .table('employees')
        .select(
          'department_id',
          { name: 'id', function: 'count', alias: 'headcount' },
          { name: 'salary', function: 'avg', alias: 'avg_sal' }
        )
        .where('active', 1)
        .groupBy('department_id')
        .having('COUNT(id)', '>', 1)
        .orderBy('department_id')
        .get()

      // Engineering activos: Alice(90k), Bob(80k) → avg=85k
      // Sales activos: Dave(60k), Eve(55k) → avg=57.5k
      // HR activos: ninguno → excluido por WHERE antes de GROUP BY
      expect(rows).toHaveLength(2)
      expect(rows[0].avg_sal).toBe(85000)
      expect(rows[1].avg_sal).toBe(57500)
    })
  })

  // ─── 7. Raw-string syntax ─────────────────────────────────────────────────

  describe('Raw-string syntax', () => {
    it('raw string con función y alias en select()', async () => {
      const rows = await source.table('sales').select('SUM(amount) AS revenue').get()

      // 5000+3000+4000+2000+6000+1000 = 21000
      expect(Number(rows[0].revenue)).toBe(21000)
    })

    it('raw string COUNT(*) AS alias', async () => {
      const rows = await source.table('employees').select('COUNT(*) AS total').where('active', 0).get()

      expect(Number(rows[0].total)).toBe(2) // Charlie + Frank
    })

    it('raw string con campo calificado tabla.campo', async () => {
      const rows = await source
        .table('sales')
        .select('region', 'SUM(sales.amount) AS total')
        .groupBy('region')
        .orderBy('total', OrderByDirection.DESC)
        .get()

      // East: 8000, North: 9000, South: 3000, West: 1000
      expect(rows[0].region).toBe('North') // 5000+4000=9000 es el mayor
    })

    it('raw string anidado: función sobre campo calificado con join', async () => {
      const rows = await source
        .table('employees')
        .select('employees.department_id', 'SUM(sales.amount) AS dept_revenue')
        .innerJoin('sales', 'employees.id', 'sales.employee_id')
        .groupBy('employees.department_id')
        .orderBy('employees.department_id')
        .get()

      // Engineering (dept=1): Alice(8000) + Bob(4000) = 12000
      // Sales (dept=2): Dave(8000) + Eve(1000) = 9000
      expect(Number(rows[0].dept_revenue)).toBe(12000)
      expect(Number(rows[1].dept_revenue)).toBe(9000)
    })
  })

  // ─── 8. Agregados con campo calificado (tabla.campo) ──────────────────────

  describe('Campos calificados con tabla.campo', () => {
    it('SUM con campo calificado en objeto { table, name, function }', async () => {
      const rows = await source
        .table('employees')
        .select(
          { name: 'department_id', table: 'employees' },
          { name: 'amount', table: 'sales', function: 'sum', alias: 'total_sales' }
        )
        .innerJoin('sales', 'employees.id', 'sales.employee_id')
        .groupBy({ name: 'department_id', table: 'employees' })
        .orderBy({ name: 'department_id', table: 'employees' })
        .get()

      expect(rows[0].total_sales).toBe(12000) // Engineering
      expect(rows[1].total_sales).toBe(9000) // Sales
    })

    it('MIN y MAX con campo calificado en objeto { table, name, function }', async () => {
      const rows = await source
        .table('employees')
        .select(
          { name: 'department_id', table: 'employees' },
          { name: 'amount', table: 'sales', function: 'min', alias: 'min_sale' },
          { name: 'amount', table: 'sales', function: 'max', alias: 'max_sale' }
        )
        .innerJoin('sales', 'employees.id', 'sales.employee_id')
        .groupBy({ name: 'department_id', table: 'employees' })
        .orderBy({ name: 'department_id', table: 'employees' })
        .get()

      // Engineering: Alice(min=3000, max=5000) + Bob(4000) → min=3000, max=5000
      expect(rows[0].min_sale).toBe(3000)
      expect(rows[0].max_sale).toBe(5000)
    })
  })
})
