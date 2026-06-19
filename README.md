[![npm version](https://badge.fury.io/js/@neogroup%2Fneorm.svg)](https://badge.fury.io/js/@neogroup%2Fneorm)
![](https://img.shields.io/github/forks/luismanuelamengual/NeORM.svg?style=social&label=Fork)
![](https://img.shields.io/github/stars/luismanuelamengual/NeORM.svg?style=social&label=Star)
![](https://img.shields.io/github/watchers/luismanuelamengual/NeORM.svg?style=social&label=Watch)
![](https://img.shields.io/github/followers/luismanuelamengual.svg?style=social&label=Follow)

# NeORM

A lightweight, fluent TypeScript library for interacting with relational databases. It provides a chainable query builder, connection/transaction management, and pluggable data sources for **PostgreSQL**, **MySQL**, and **SQLite** — with a clean architecture that makes it easy to add new engines.

## Table of contents

- [Installation](#installation)
- [Data sources](#data-sources)
  - [PostgreSQL](#postgresql)
  - [MySQL](#mysql)
  - [SQLite](#sqlite)
  - [Multiple sources](#multiple-sources)
  - [Configuration via environment variables](#configuration-via-environment-variables)
    - [Connection string (DB\_URL)](#connection-string-recommended)
    - [Individual variables](#individual-variables)
- [Querying with DataTable](#querying-with-datatable)
  - [SELECT — basic](#select--basic)
  - [Filtering — WHERE](#filtering--where)
  - [Conditional clauses — when](#conditional-clauses--when)
  - [Sorting — ORDER BY](#sorting--order-by)
  - [Pagination — LIMIT & OFFSET](#pagination--limit--offset)
  - [Counting — count()](#counting--count)
  - [Paginating — paginate()](#paginating--paginate)
  - [Grouping — GROUP BY & HAVING](#grouping--group-by--having)
  - [Joins](#joins)
  - [Distinct](#distinct)
  - [Field aliases & functions](#field-aliases--functions)
  - [Table alias](#table-alias)
- [INSERT, UPDATE, DELETE](#insert-update-delete)
- [Raw queries](#raw-queries)
- [Advanced queries with SelectQuery](#advanced-queries-with-selectquery)
  - [UNION / UNION ALL](#union--union-all)
  - [Subqueries](#subqueries)
- [Connections & transactions](#connections--transactions)
  - [Explicit connection](#explicit-connection)
  - [DB shorthand methods](#db-shorthand-methods)
- [Entities (Active Record)](#entities-active-record)
  - [Defining an Entity](#defining-an-entity)
  - [Querying](#querying)
  - [Saving & deleting](#saving--deleting)
  - [Casts](#casts)
  - [Relationships](#relationships)
  - [Eager loading — with()](#eager-loading--with)
  - [Joining via relationships](#joining-via-relationships)
  - [Existence checks — whereHas / orWhereHas](#existence-checks--wherehas--orwherehas)
  - [Entities without BaseEntity](#entities-without-baseentity)
- [Debug mode](#debug-mode)
- [Extending the library](#extending-the-library)
- [Contact](#contact)

---

## Installation

```bash
npm install @neogroup/neorm
```

Depending on the database engine you use, install the corresponding driver:

| Engine     | Driver                  |
|------------|-------------------------|
| PostgreSQL | `npm install pg`        |
| MySQL      | `npm install mysql2`    |
| SQLite     | built-in (Node ≥ 22.5)  |

---

## Data sources

A **DataSource** represents a configured connection to a database engine. Register it once at startup with `DB.register()` and use `DB` anywhere in your code from that point on.

### PostgreSQL

```typescript
import { DB, PostgresDataSource } from '@neogroup/neorm'

const source = new PostgresDataSource()
source.setHost('localhost')
source.setPort(5432)               // default: 5432
source.setDatabaseName('mydb')
source.setUsername('admin')
source.setPassword('secret')

DB.register(source)
```

### MySQL

```typescript
import { DB, MysqlDataSource } from '@neogroup/neorm'

const source = new MysqlDataSource()
source.setHost('localhost')
source.setPort(3306)               // default: 3306
source.setDatabaseName('mydb')
source.setUsername('admin')
source.setPassword('secret')

DB.register(source)
```

MySQL identifiers (table names, column names) are automatically quoted with backticks to avoid conflicts with reserved words.

### SQLite

```typescript
import { DB, SqliteDataSource } from '@neogroup/neorm'

const source = new SqliteDataSource()         // in-memory database
// source.setFilename('./data.db')            // or a file path

DB.register(source)
```

SQLite uses Node's built-in `node:sqlite` module — no native compilation required.

### Multiple sources

You can register multiple sources and switch between them by name:

```typescript
DB.register('primary', primarySource)
DB.register('reporting', reportingSource)

// Use a specific source explicitly
const rows = await DB.source('reporting').table('analytics').get()
```

The first registered source becomes the **active source** automatically. `DB.table(...)`, `DB.query(...)`, `DB.execute(...)` and the transaction helpers all target it. You can change it at any time with `setActiveSource()`:

```typescript
DB.setActiveSource('reporting')

// Now all DB.* calls target reportingSource
const rows = await DB.table('analytics').get()
```

### Configuration via environment variables

Instead of calling `DB.register()` in code, you can configure data sources entirely through environment variables. The library auto-detects them the first time a source is needed — no bootstrap code required.

#### Connection string (recommended)

The simplest way is a single `DB_URL` variable. The driver is inferred from the URL scheme:

```bash
# SQLite in-memory
DB_URL=sqlite://:memory:

# SQLite file
DB_URL=sqlite:///path/to/data.db

# PostgreSQL
DB_URL=postgres://admin:secret@localhost:5432/mydb

# MySQL
DB_URL=mysql://admin:secret@localhost:3306/mydb
```

```typescript
// No DB.register() anywhere — just set DB_URL and use DB
const users = await DB.table('users').get()
```

#### Individual variables

Alternatively, set `DB_DRIVER` plus the connection-specific variables:

**Default source** — used by all `DB.*` calls:

| Variable      | Description                                                          |
|---------------|----------------------------------------------------------------------|
| `DB_URL`      | Connection string — takes priority over all other `DB_*` variables  |
| `DB_DRIVER`   | `sqlite` \| `postgres` \| `mysql` (required if `DB_URL` is not set) |
| `DB_FILE`     | SQLite file path (default: `:memory:`)                               |
| `DB_HOST`     | Database host (postgres / mysql)                                     |
| `DB_PORT`     | Database port (postgres / mysql)                                     |
| `DB_NAME`     | Database name (postgres / mysql)                                     |
| `DB_USERNAME` | Login username (postgres / mysql)                                    |
| `DB_PASSWORD` | Login password (postgres / mysql)                                    |

**Named sources** — replace `<NAME>` with the source name in upper-case:

```
DB_<NAME>_URL, DB_<NAME>_DRIVER, DB_<NAME>_HOST, DB_<NAME>_PORT,
DB_<NAME>_NAME, DB_<NAME>_USERNAME, DB_<NAME>_PASSWORD, DB_<NAME>_FILE
```

`DB_<NAME>_URL` takes priority over `DB_<NAME>_DRIVER` for the same source name.

Examples:

```bash
# Single SQLite source via connection string
DB_URL=sqlite:///data.db
```

```bash
# Single SQLite source via individual variables
DB_DRIVER=sqlite
DB_FILE=./data.db
```

```bash
# PostgreSQL default + named SQLite for reporting
DB_URL=postgres://admin:secret@localhost:5432/myapp

DB_REPORTING_URL=sqlite:///reporting.db
```

```typescript
// No DB.register() anywhere — sources are resolved from the environment
const users = await DB.table('users').get()
const report = await DB.source('reporting').table('stats').get()
```

You can also call `DB.configure()` explicitly at startup if you want fail-fast behaviour (e.g. crash early instead of on the first query if a required variable is missing):

```typescript
DB.configure()   // throws immediately if neither DB_URL nor DB_DRIVER is set
```

`DB.configure()` is a no-op if sources have already been registered manually, so it is safe to mix both styles in the same application.

---

## Querying with DataTable

`DB.table('name')` returns a `DataTable` — a chainable query builder scoped to a single table. All methods return the same `DataTable` instance so you can chain them freely.

### SELECT — basic

```typescript
// SELECT * FROM users
const users = await DB.table('users').get()

// SELECT * FROM users LIMIT 1
const user = await DB.table('users').first()   // returns null if no rows match
```

Select specific columns:

```typescript
// SELECT id, name, email FROM users
const users = await DB.table('users')
  .select('id', 'name', 'email')
  .get()
```

---

### Filtering — WHERE

**Simple equality:**

```typescript
// WHERE name = 'Alice'
await DB.table('users').where('name', 'Alice').get()
```

**Comparison operators** (`=`, `<>`, `<`, `>`, `<=`, `>=`):

```typescript
await DB.table('users').where('age', '>', 18).get()
await DB.table('users').where('age', '<>', 30).get()
```

**Multiple conditions (AND by default):**

```typescript
// WHERE active = 1 AND age > 18
await DB.table('users').where('active', 1).where('age', '>', 18).get()
```

**OR conditions:**

```typescript
// WHERE name = 'Alice' OR name = 'Bob'
await DB.table('users').where('name', 'Alice').orWhere('name', 'Bob').get()
```

**IN / NOT IN:**

```typescript
// WHERE role IN ('admin', 'editor')
await DB.table('users').whereIn('role', ['admin', 'editor']).get()

// WHERE id NOT IN (1, 2, 3)
await DB.table('users').whereNotIn('id', [1, 2, 3]).get()
```

Also available as `orWhereIn` / `orWhereNotIn`.

**BETWEEN / NOT BETWEEN:**

```typescript
// WHERE age BETWEEN 18 AND 65
await DB.table('users').whereBetween('age', [18, 65]).get()

// WHERE created_at NOT BETWEEN '2024-01-01' AND '2024-12-31'
await DB.table('orders').whereNotBetween('created_at', ['2024-01-01', '2024-12-31']).get()
```

Also available as `orWhereBetween` / `orWhereNotBetween`.

**LIKE / NOT LIKE:**

```typescript
await DB.table('users').whereLike('email', '%@gmail.com').get()
await DB.table('users').whereNotLike('name', 'A%').get()
```

Also available as `orWhereLike` / `orWhereNotLike`.

**NULL checks:**

```typescript
// WHERE deleted_at IS NULL
await DB.table('users').whereNull('deleted_at').get()

// WHERE deleted_at IS NOT NULL
await DB.table('users').whereNotNull('deleted_at').get()
```

Also available as `orWhereNull` / `orWhereNotNull`.

**Grouped conditions (parentheses):**

Pass a callback to `where()` to create a parenthesized group. Inside the callback the full `where*` / `orWhere*` API is available:

```typescript
// WHERE (name = 'Alice' OR name = 'Bob') AND active = 1
await DB.table('users')
  .where((group) => group.where('name', 'Alice').orWhere('name', 'Bob'))
  .where('active', 1)
  .get()

// WHERE (age IN (25, 30)) AND active = 1
await DB.table('users')
  .where((q) => q.whereIn('age', [25, 30]))
  .where('active', 1)
  .get()

// WHERE (age BETWEEN 18 AND 40 OR nickname IS NULL)
await DB.table('users')
  .where((q) => q.whereBetween('age', [18, 40]).orWhereNull('nickname'))
  .get()
```

Nest groups as deep as needed:

```typescript
// WHERE (role = 'admin' OR (role = 'editor' AND verified = 1))
await DB.table('users')
  .where((group) =>
    group
      .where('role', 'admin')
      .orWhere((inner) => inner.where('role', 'editor').where('verified', 1))
  )
  .get()
```

`orWhere()` also accepts a callback, producing an OR-connected group.

**Column comparisons — `whereColumn` / `orWhereColumn`:**

Compare two columns against each other instead of against a scalar value:

```typescript
// WHERE updated_at > created_at
await DB.table('users').whereColumn('updated_at', '>', 'created_at').get()

// WHERE col_a = col_b  (operator defaults to =)
await DB.table('items').whereColumn('col_a', 'col_b').get()

// OR variant
await DB.table('items').whereColumn('a', 'b').orWhereColumn('a', '>', 'b').get()
```

`whereColumn` / `orWhereColumn` are also available inside grouped-condition callbacks:

```typescript
await DB.table('items')
  .where((q) => q.whereColumn('a', 'b').orWhereColumn('a', '>', 'b'))
  .get()
```

---

### Conditional clauses — `when`

`when(condition, callback)` applies query modifications only when `condition` is truthy. This keeps dynamic query building readable without `if` statements scattered through the chain:

```typescript
const onlyActive = true
const minAge = 18

const users = await DB.table('users')
  .when(onlyActive, (q) => q.where('active', 1))
  .when(minAge != null, (q) => q.where('age', '>=', minAge))
  .get()
```

When `condition` is falsy the callback is skipped and the chain continues unchanged. `when` works on `DataTable`, `SelectQuery` and `EntityQuery` (entity queries).

---

### Sorting — ORDER BY

```typescript
// ORDER BY name ASC
await DB.table('users').orderBy('name').get()

// ORDER BY age DESC
import { OrderByDirection } from '@neogroup/neorm'
await DB.table('users').orderBy('age', OrderByDirection.DESC).get()

// ORDER BY age DESC  (shorthand — no import needed)
await DB.table('users').orderByDesc('age').get()

// Multiple sort fields
await DB.table('users')
  .orderBy('country', OrderByDirection.ASC)
  .orderByDesc('age')
  .get()
```

---

### Pagination — LIMIT & OFFSET

```typescript
// LIMIT 10
await DB.table('users').limit(10).get()

// LIMIT 10 OFFSET 20  (page 3)
await DB.table('users').limit(10).offset(20).get()

// OFFSET only (SQLite emits LIMIT -1 automatically)
await DB.table('users').offset(5).get()
```

---

### Counting — count()

`count()` returns the number of records that match the current query as a plain `number`. It honours `where` conditions, joins, group-by and having, while ignoring any `limit` / `offset` / `orderBy`.

```typescript
// SELECT COUNT(*) AS aggregate FROM users
const total = await DB.table('users').count()

// SELECT COUNT(*) AS aggregate FROM users WHERE active = 1
const active = await DB.table('users').where('active', 1).count()
```

Combine with `distinct()` and a column to count distinct values:

```typescript
// SELECT COUNT(DISTINCT country) AS aggregate FROM users
const countries = await DB.table('users').distinct().count('country')
```

When the query has a `groupBy`, `count()` returns the number of groups.

---

### Paginating — paginate()

`paginate(perPage = 15, page = 1)` runs a `COUNT` for the total plus a windowed `SELECT` for the requested page, and returns both the records and the navigation metadata — modelled after Laravel's length-aware paginator.

```typescript
// Page 2, 15 records per page
const result = await DB.table('users').orderBy('name').paginate(15, 2)
```

The returned object has the shape:

```typescript
{
  data: DataSet[]   // records for this page
  total: number     // total matching records (ignores limit/offset)
  perPage: number   // records requested per page
  currentPage: number
  lastPage: number  // always >= 1
  from: number | null // 1-based index of the first row, null when empty
  to: number | null   // 1-based index of the last row, null when empty
}
```

`where` conditions and ordering are respected for both the total count and the page query:

```typescript
const result = await DB.table('users')
  .where('active', 1)
  .orderBy('age')
  .paginate(10, 1)

console.log(result.total)       // e.g. 42
console.log(result.lastPage)    // e.g. 5
console.log(result.data.length) // up to 10
```

---

### Grouping — GROUP BY & HAVING

```typescript
// SELECT country, COUNT(*) AS total FROM users GROUP BY country
await DB.table('users')
  .select('country', 'COUNT(*) AS total')
  .groupBy('country')
  .get()

// GROUP BY + HAVING
// HAVING COUNT(*) > 5
await DB.table('users')
  .select('country', 'COUNT(*) AS total')
  .groupBy('country')
  .having('COUNT(*)', '>', 5)
  .get()
```

`having()` and `orHaving()` accept the same signatures as `where()`.

---

### Joins

```typescript
// INNER JOIN orders ON users.id = orders.user_id
await DB.table('users')
  .innerJoin('orders', 'users.id', 'orders.user_id')
  .get()

// LEFT JOIN
await DB.table('users')
  .leftJoin('orders', 'users.id', 'orders.user_id')
  .get()
```

Fields follow the `'table.field'` notation — the builder parses and quotes each component according to the engine (e.g. backticks in MySQL). Object form is also accepted for finer control:

```typescript
.innerJoin('orders', { name: 'id', table: 'users' }, { name: 'user_id', table: 'orders' })
```

Available join methods: `join()`, `innerJoin()`, `leftJoin()`, `rightJoin()`, `outerJoin()`, `crossJoin()`.

Join with table alias:

```typescript
await DB.table('users')
  .innerJoin('orders', 'users.id', 'orders.user_id', 'o')
  .select('users.name', 'o.total')
  .get()
```

---

### Distinct

```typescript
// SELECT DISTINCT country FROM users
await DB.table('users').distinct().select('country').get()
```

---

### Field aliases & functions

Raw string fields support `'table.field'` notation and `'FUNC(table.field)'` — the builder parses and quotes each component using the engine's rules:

```typescript
// SELECT users.name, COUNT(orders.id) AS order_count FROM ...
await DB.table('users')
  .select('users.name', 'COUNT(orders.id) AS order_count')
  .innerJoin('orders', 'users.id', 'orders.user_id')
  .groupBy('users.id')
  .get()
```

Object form is also available for precise control:

```typescript
// SELECT COUNT(*) AS total FROM users
await DB.table('users')
  .select({ name: '*', function: 'COUNT', alias: 'total' })
  .get()

// SELECT MAX(age) AS max_age FROM users
await DB.table('users')
  .select({ name: 'age', function: 'MAX', alias: 'max_age' })
  .get()
```

---

### Table alias

```typescript
// FROM users AS u
await DB.table('users').alias('u').get()
```

---

## INSERT, UPDATE, DELETE

**INSERT:**

```typescript
// Using set() — chainable
const rowsAffected = await DB.table('users')
  .set('name', 'Alice')
  .set('email', 'alice@example.com')
  .set('age', 30)
  .insert()

// Passing a fields object directly (Laravel-style)
const rowsAffected = await DB.table('users')
  .insert({ name: 'Alice', email: 'alice@example.com', age: 30 })
```

**UPDATE:**

```typescript
// Using set() — chainable
const rowsAffected = await DB.table('users')
  .where('id', 7)
  .set('active', 0)
  .update()

// Passing a fields object directly
const rowsAffected = await DB.table('users')
  .where('id', 7)
  .update({ active: 0, name: 'Bob' })
```

**DELETE:**

```typescript
// DELETE FROM users WHERE active = 0
const rowsAffected = await DB.table('users').where('active', 0).delete()
```

> ⚠️ Omitting `where()` on `update()` and `delete()` will affect **all rows** in the table.

---

## Raw queries

When you need full control over the SQL string, use `DB.query()` and `DB.execute()` directly on the active source:

```typescript
// Raw SELECT
const rows = await DB.query(
  'SELECT * FROM users WHERE age > ? AND active = ?',
  [18, 1]
)

// Raw execute (INSERT / UPDATE / DELETE / DDL)
const affected = await DB.execute(
  'UPDATE users SET active = ? WHERE last_login < ?',
  [0, '2023-01-01']
)
```

To target a specific source, use `DB.source()`:

```typescript
const rows = await DB.source('reporting').query('SELECT * FROM analytics')
```

---

## Advanced queries with SelectQuery

For queries that go beyond a single table — unions, subqueries, or complex joins — build a `SelectQuery` directly and pass it to `source.query()`.

### UNION / UNION ALL

```typescript
import { DB } from '@neogroup/neorm'

// SELECT name FROM users WHERE active = 1
// UNION
// SELECT name FROM users WHERE age > 50
const query = DB.selectQuery('users')
  .select('name')
  .where('active', 1)
  .union(
    DB.selectQuery('users').select('name').where('age', '>', 50)
  )

const rows = await DB.source('primary').query(query)
```

`union()` removes duplicates (standard SQL `UNION`). Use `unionAll()` to keep them:

```typescript
const query = DB.selectQuery('orders')
  .select('user_id')
  .where('status', 'paid')
  .unionAll(
    DB.selectQuery('orders').select('user_id').where('status', 'refunded')
  )
```

Chain multiple unions:

```typescript
const query = DB.selectQuery('table_a').select('id')
  .union(DB.selectQuery('table_b').select('id'))
  .union(DB.selectQuery('table_c').select('id'))
```

### Subqueries

A `SelectQuery` can be used as a value in a `where()` condition:

```typescript
const activeUserIds = DB.selectQuery('users').select('id').where('active', 1)

const orders = await DB.source('primary').query(
  DB.selectQuery('orders').where('user_id', 'IN', activeUserIds)
)
```

---

## Connections & transactions

### Explicit connection

Obtain a connection explicitly when you need full control over its lifecycle:

```typescript
const conn = await DB.connection()

try {
  await conn.beginTransaction()

  await conn.execute('INSERT INTO accounts (user_id, balance) VALUES (?, ?)', [1, 1000])
  await conn.execute('UPDATE accounts SET balance = balance - ? WHERE user_id = ?', [200, 2])

  await conn.commitTransaction()
} catch (err) {
  await conn.rollbackTransaction()
} finally {
  await conn.close()
}
```

`executeTransaction()` on a connection handles begin/commit/rollback automatically:

```typescript
const conn = await DB.connection()

await conn.executeTransaction(async (tx) => {
  await tx.execute('INSERT INTO logs (event) VALUES (?)', ['login'])
  await tx.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [userId])
  // throws → automatic rollback; resolves → automatic commit
})

await conn.close()
```

### DB shorthand methods

`DB` exposes convenience wrappers that delegate directly to the active source's connection, so you don't need to manage a connection object for simple cases:

```typescript
// One-shot query / execute
const rows    = await DB.query('SELECT * FROM users WHERE active = ?', [1])
const affected = await DB.execute('DELETE FROM logs WHERE created_at < ?', ['2024-01-01'])

// Auto-managed transaction (recommended)
await DB.executeTransaction(async (tx) => {
  await tx.execute('INSERT INTO logs (event) VALUES (?)', ['login'])
  await tx.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [userId])
})

// Manual transaction control
await DB.beginTransaction()
try {
  await DB.execute('INSERT INTO ...')
  await DB.commitTransaction()
} catch (err) {
  await DB.rollbackTransaction()
}
```

---

## Entities (Active Record)

Entities are Eloquent-style Active Record models that map a class to a database table. Every entity extends the abstract **`BaseEntity`** class and is annotated with TypeScript decorators. `BaseEntity` provides all the static query methods (`find`, `where`, `with`, …) — fully typed — plus the `save()` and `delete()` instance methods.

> Enable `"experimentalDecorators": true` and `"useDefineForClassFields": false` in your `tsconfig.json`.

### Defining an Entity

Extend `BaseEntity`, annotate the class with `@Entity` and mark its columns with `@Column`. The decorators register the table metadata; `BaseEntity` supplies querying and persistence.

```typescript
import {
  BaseEntity, Entity, Column,
  HasOne, HasMany, BelongsTo, HasOneThrough, HasManyThrough
} from '@neogroup/neorm'

@Entity()                          // table name defaults to lowercase class name + 's' → 'users'
class User extends BaseEntity {
  @Column({ primaryKey: true, autoGenerated: true })
  id!: number

  @Column()
  name!: string

  @Column()
  email!: string

  @Column({ cast: 'number' })
  age!: number

  @Column({ cast: 'boolean' })
  active!: boolean

  @HasMany(() => Order, 'userId')
  orders?: Order[]

  @HasOne(() => Profile, 'userId')
  profile?: Profile | null

  // Computed attributes work as plain JS getters — no extra decorator needed
  get displayName(): string {
    return `${this.name} (${this.email})`
  }
}

@Entity()
class Order extends BaseEntity {
  @Column({ primaryKey: true, autoGenerated: true })
  id!: number

  @Column()
  userId!: number

  @Column({ cast: 'number' })
  total!: number

  @BelongsTo(() => User, 'userId')
  user?: User
}
```

**`@Column` options:**

| Option          | Type       | Description |
|-----------------|------------|-------------|
| `columnName`    | `string`   | Database column name. Defaults to the property name. |
| `cast`          | `CastType` | Coerce the value when reading from the DB (see [Casts](#casts)). |
| `primaryKey`    | `boolean`  | Marks this column as the primary key. |
| `autoGenerated` | `boolean`  | Column is DB-managed (e.g. `AUTOINCREMENT`). Excluded from INSERT/UPDATE; the generated value is written back to the instance after INSERT. |

When a custom table name or primary key column name is needed, pass options to `@Entity`:

```typescript
@Entity({ table: 'shipping_addresses' })
class ShippingAddress extends BaseEntity {
  @Column({ primaryKey: true, autoGenerated: true })
  id!: number
  // ...
}
```

To target a specific registered data source (by name) instead of the active one:

```typescript
DB.register('archive', archiveSource)

@Entity({ source: 'archive' })   // the entity operates on DB.source('archive')
class ArchiveUser extends BaseEntity {
  // ...
}
```

---

### Querying

All `DataTable` query methods are available as static methods inherited from `BaseEntity`, returning a chainable `EntityQuery<T>`. They are fully typed — `User.get()` returns `Promise<User[]>` with no casts needed:

```typescript
// Fetch all
const users = await User.get()          // User[]

// Find by primary key
const user = await User.find(1)         // User | null

// First match
const admin = await User.where('role', 'admin').first()

// Chained conditions
const adults = await User.where('active', 1)
  .whereNotNull('email')
  .orderBy('name')
  .limit(20)
  .get()
```

The full `where*` / `orWhere*` API, `select()`, `orderBy()`, `orderByDesc()`, `limit()`, `offset()`, `groupBy()`, `distinct()`, and `whereColumn()` are all supported.

**Counting and paginating** work exactly like on `DataTable`, but field names are resolved against the entity's columns and `paginate()` returns hydrated entity instances (loading any `with()` relations):

```typescript
// Count
const total = await User.count()                       // number
const active = await User.where('active', true).count() // number

// Paginate — data is User[]
const page = await User.where('active', true)
  .orderBy('name')
  .with('country')
  .paginate(15, 2)

console.log(page.total, page.lastPage)
console.log(page.data)        // User[] (page 2), each with .country loaded
```

`paginate()` returns the same metadata shape described in [Paginating — paginate()](#paginating--paginate), with `data` typed as `T[]`.

---

### Saving & deleting

Every entity inherits the `save()` and `delete()` instance methods from `BaseEntity`:

```typescript
// INSERT — autoGenerated PK is written back after insert
const user = new User()
user.name   = 'Alice'
user.email  = 'alice@example.com'
user.age    = 30
user.active = true
await user.save()
console.log(user.id)  // populated from lastInsertId

// UPDATE — detected by the presence of a primary key value
user.age = 31
await user.save()

// DELETE — throws if the primary key is not set
await user.delete()
```

---

### Casts

Declare `cast` on `@Column` to automatically convert raw DB values when hydrating a row:

| Cast type   | Description                                            |
|-------------|--------------------------------------------------------|
| `'number'`  | `Number(value)`                                        |
| `'boolean'` | `true` for `1`, `'1'`, `'true'`; `false` otherwise    |
| `'string'`  | `String(value)`                                        |
| `'json'`    | `JSON.parse(value)` on read, `JSON.stringify` on write |
| `'date'`    | `new Date(value)`                                      |

Booleans stored as integers (SQLite, MySQL) are handled transparently.

---

### Relationships

Use relationship decorators to declare associations between entities:

```typescript
// HasOne(related, foreignKey, localKey = 'id')
// HasMany(related, foreignKey, localKey = 'id')
// BelongsTo(related, foreignKey, localKey = 'id')
// HasOneThrough(related, through, foreignKey, throughForeignKey, localKey, throughLocalKey)
// HasManyThrough(related, through, foreignKey, throughForeignKey, localKey, throughLocalKey)

@Entity({ table: 'countries' })
class Country extends BaseEntity {
  @Column({ primaryKey: true, autoGenerated: true })
  id!: number

  @HasMany(() => User, 'countryId')
  users?: User[]

  // Reach Users' Orders through the Users table
  @HasManyThrough(() => Order, () => User, 'userId', 'countryId')
  orders?: Order[]
}
```

The `related` and `through` arguments are lazy callbacks (`() => ClassName`) to avoid circular-dependency issues when models reference each other.

---

### Eager loading — `with()`

Pass relation names to `with()` to load related entities in a single extra query per relation (avoids N+1):

```typescript
// Preload orders for each user
const users = await User.with('orders').get()
users.forEach(u => console.log(u.orders))  // Order[] attached

// Multiple relations
const users = await User.with('orders', 'profile').get()

// Dot-notation for nested eager loading
// Loads orders → users → countries in 3 total queries
const orders = await Order.with('user.country').get()
orders.forEach(o => console.log(o.user.country))
```

`with()` is chainable after any `where*` or ordering method:

```typescript
const users = await User.where('active', 1).with('orders').orderBy('name').get()
```

---

### Joining via relationships

Use `joinRelationship` / `innerJoinRelationship` / `leftJoinRelationship` to add SQL JOINs derived from relationship definitions:

```typescript
// INNER JOIN orders ON users.id = orders.userId
const users = await User.innerJoinRelationship('orders')
  .select('users.*', 'COUNT(orders.id) AS orderCount')
  .groupBy('users.id')
  .get()

// LEFT JOIN
const users = await User.leftJoinRelationship('profile').get()
```

These are available as static methods on every Entity and also on `EntityQuery`:

```typescript
const query = User.where('active', 1).leftJoinRelationship('profile')
```

---

### Existence checks — `whereHas` / `orWhereHas`

`whereHas(relation, callback?)` filters the query to only include records that have at least one matching related record. It generates a correlated `WHERE EXISTS (SELECT 1 FROM …)` subquery — no JOIN duplicates, no extra columns needed.

```typescript
// Users who have at least one order
const users = await User.whereHas('orders').get()

// Users who have at least one order for a specific product
const users = await User.whereHas('orders', (q) => q.where('product', 'Widget')).get()

// Users who have a profile (hasOne)
const users = await User.whereHas('profile').get()

// Countries that have at least one order (hasManyThrough)
const countries = await Country.whereHas('orders').get()
```

The optional callback receives an `EntityQuery` scoped to the **related** entity with full field-name resolution, so property names and the full `where*` API are available:

```typescript
// Users with an order totalling more than $50
const users = await User.whereHas('orders', (q) =>
  q.where('amount', '>', 50)
).get()

// Users with an active order placed this year
const users = await User.whereHas('orders', (q) =>
  q.where('active', 1).where('year', new Date().getFullYear())
).get()
```

`orWhereHas` adds the existence check as an OR condition:

```typescript
// Users who are admins OR have at least one order
const users = await User.where('role', 'admin').orWhereHas('orders').get()

// Users named 'Charlie' OR who have a 'Widget' order
const users = await User
  .where('name', 'Charlie')
  .orWhereHas('orders', (q) => q.where('product', 'Widget'))
  .get()
```

Both methods are available as static methods on every `BaseEntity` subclass and can be chained freely with any other query method:

```typescript
const users = await User
  .where('active', 1)
  .whereHas('orders')
  .orderBy('name')
  .limit(10)
  .get()
```

Supported relationship types: `hasOne`, `hasMany`, `belongsTo`, `hasOneThrough`, `hasManyThrough`.

---

### Entities without BaseEntity

Extending `BaseEntity` is optional. Any plain class decorated with `@Entity` and `@Column` works identically — all query, hydration, and persistence logic lives in `EntityRepository`, not in `BaseEntity`. `BaseEntity` is just a thin convenience layer that delegates to the repository.

To work with a plain entity, obtain its repository via `Repository.get()` and call the same methods on it:

```typescript
import { Entity, Column, BelongsTo, HasMany, Repository } from '@neogroup/neorm'

@Entity()
class Country {
  @Column({ primaryKey: true, autoGenerated: true })
  id!: number

  @Column()
  name!: string

  @Column()
  code!: string

  @HasMany(() => User, 'countryId')
  users?: User[]
}

@Entity()
class User {
  @Column({ primaryKey: true, autoGenerated: true })
  id!: number

  @Column()
  name!: string

  @Column()
  countryId!: number

  @BelongsTo(() => Country, 'countryId')
  country?: Country
}
```

**Querying** — call the same fluent API through the repository:

```typescript
const repo = Repository.get(User)

const users  = await repo.get()                          // User[]
const user   = await repo.find(1)                        // User | null
const admins = await repo.where('role', 'admin').first() // User | null

const sorted = await repo
  .where('active', 1)
  .orderByDesc('name')
  .limit(20)
  .get()

// Eager loading, whereHas, joins — all available
const users = await repo.with('country').whereHas('orders').get()
```

**Saving & deleting** — pass the instance to `save()` and `delete()`:

```typescript
const repo = Repository.get(User)

// INSERT
const user = new User()
user.name      = 'Alice'
user.countryId = 1
await repo.save(user)
console.log(user.id)  // populated from lastInsertId

// UPDATE
user.name = 'Alice Updated'
await repo.save(user)

// DELETE
await repo.delete(user)
```

Both approaches — `BaseEntity` subclasses and plain classes — can coexist in the same application and share the same data sources. Choose whichever fits your architecture: `BaseEntity` for the Active Record style, `Repository.get()` for a more explicit, repository-pattern style.

---

## Debug mode

Enable SQL logging on a data source to print every statement and its bindings to the console:

```typescript
source.setDebugEnabled(true)
```

Example output:

```
SQL: SELECT * FROM users WHERE active = ? AND age > ?;   ["1", 18]
```

Read-only mode prevents any write operations from reaching the database — useful for testing:

```typescript
source.setReadonly(true)
```

---

## Extending the library

### Custom data source

Implement `DataSource` to connect any database engine:

```typescript
import { Connection, DataSource } from '@neogroup/neorm'

class MyConnection implements Connection {
  async query(sql: string, bindings?: any[]): Promise<any[]> { /* ... */ }
  async execute(sql: string, bindings?: any[]): Promise<number> { /* ... */ }
  async lastInsertId(): Promise<number> { /* ... */ }
  async beginTransaction(): Promise<void> { /* ... */ }
  async commitTransaction(): Promise<void> { /* ... */ }
  async rollbackTransaction(): Promise<void> { /* ... */ }
  async close(): Promise<void> { /* ... */ }
}

class MyDataSource extends DataSource {
  protected async requestConnection(): Promise<Connection> {
    return new MyConnection(/* ... */)
  }
  async close(): Promise<void> { /* ... */ }
}
```

### Custom query builder

Override `DefaultQueryBuilder` to adapt SQL generation for your engine:

```typescript
import { DefaultQueryBuilder, Statement, Table } from '@neogroup/neorm'

class MyQueryBuilder extends DefaultQueryBuilder {
  protected buildTable(table: Table, statement: Statement) {
    // e.g. wrap table names in double-brackets for SQL Server
    statement.sql += typeof table === 'string' ? `[${table}]` : `[${table.name}]`
  }
}
```

Pass your custom builder to the data source constructor:

```typescript
class MyDataSource extends DataSource {
  constructor() {
    super(new MyQueryBuilder())
  }
  // ...
}
```

---

## Contact

For bugs or feature requests open an issue on [GitHub](https://github.com/luismanuelamengual/NeORM/issues) or contact the author at luismanuelamengual@gmail.com.
