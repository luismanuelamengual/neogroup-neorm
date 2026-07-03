import {
  Blueprint,
  DB,
  MysqlSchemaGrammar,
  PostgresSchemaGrammar,
  Schema,
  SqliteDataSource,
  SqliteSchemaGrammar
} from '../src'

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildCreate(
  grammar: PostgresSchemaGrammar | MysqlSchemaGrammar | SqliteSchemaGrammar,
  table: string,
  cb: (t: Blueprint) => void
): string[] {
  const blueprint = new Blueprint(table, 'create')

  cb(blueprint)

  return grammar.compileCreate(blueprint)
}

// ─── SQL generation (no database) ─────────────────────────────────────────────

describe('Schema — compilación DDL agnóstica', () => {
  const postgres = new PostgresSchemaGrammar()
  const mysql = new MysqlSchemaGrammar()
  const sqlite = new SqliteSchemaGrammar()

  // The oauth example from the feature request, one blueprint compiled per engine.
  const oauth = (t: Blueprint) => {
    t.string('id', 100).primary()
    t.unsignedBigInteger('userId').index()
    t.integer('clientId')
    t.text('scopes').nullable()
    t.boolean('revoked').default(false)
    t.dateTime('expiresAt').nullable()
  }

  it('genera CREATE TABLE para PostgreSQL', () => {
    const [create, index] = buildCreate(postgres, 'oauth_access_tokens', oauth)

    expect(create).toBe(
      'CREATE TABLE oauth_access_tokens (' +
        'id VARCHAR(100) NOT NULL, ' +
        'userId BIGINT NOT NULL, ' +
        'clientId INTEGER NOT NULL, ' +
        'scopes TEXT, ' +
        'revoked BOOLEAN NOT NULL DEFAULT false, ' +
        'expiresAt TIMESTAMP, ' +
        'PRIMARY KEY (id))'
    )
    expect(index).toBe('CREATE INDEX oauth_access_tokens_userid_index ON oauth_access_tokens (userId)')
  })

  it('genera CREATE TABLE para MySQL (backticks, TINYINT, UNSIGNED)', () => {
    const [create] = buildCreate(mysql, 'oauth_access_tokens', oauth)

    expect(create).toBe(
      'CREATE TABLE `oauth_access_tokens` (' +
        '`id` VARCHAR(100) NOT NULL, ' +
        '`userId` BIGINT UNSIGNED NOT NULL, ' +
        '`clientId` INT NOT NULL, ' +
        '`scopes` TEXT, ' +
        '`revoked` TINYINT(1) NOT NULL DEFAULT 0, ' +
        '`expiresAt` DATETIME, ' +
        'PRIMARY KEY (`id`))'
    )
  })

  it('genera CREATE TABLE para SQLite (INTEGER booleans, TIMESTAMP)', () => {
    const [create] = buildCreate(sqlite, 'oauth_access_tokens', oauth)

    expect(create).toBe(
      'CREATE TABLE oauth_access_tokens (' +
        'id VARCHAR(100) NOT NULL, ' +
        'userId INTEGER NOT NULL, ' +
        'clientId INTEGER NOT NULL, ' +
        'scopes TEXT, ' +
        'revoked INTEGER NOT NULL DEFAULT 0, ' +
        'expiresAt TIMESTAMP, ' +
        'PRIMARY KEY (id))'
    )
  })

  // Engine-aware features: auto-increment, arrays, jsonb, useCurrent, FK, unique.
  const richTable = (t: Blueprint) => {
    t.increments('id')
    t.integer('organizationId')
    t.string('email', 255)
    t.integerArray('roles').default([])
    t.jsonb('settings').nullable()
    t.timestamp('createdAt').useCurrent()
    t.unique(['organizationId', 'email'])
    t.foreign('organizationId').references('id').on('organizations').onDelete('cascade')
    t.index('organizationId', 'idx_users_org')
  }

  it('PostgreSQL: SERIAL, INTEGER[], JSONB, CURRENT_TIMESTAMP, FK y UNIQUE', () => {
    const [create, index] = buildCreate(postgres, 'users', richTable)

    expect(create).toContain('id SERIAL PRIMARY KEY')
    expect(create).toContain("roles INTEGER[] NOT NULL DEFAULT '{}'")
    expect(create).toContain('settings JSONB')
    expect(create).toContain('createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP')
    expect(create).toContain('UNIQUE (organizationId, email)')
    expect(create).toContain('FOREIGN KEY (organizationId) REFERENCES organizations (id) ON DELETE CASCADE')
    expect(index).toBe('CREATE INDEX idx_users_org ON users (organizationId)')
  })

  it('SQLite: INTEGER PRIMARY KEY AUTOINCREMENT, TEXT arrays y JSON', () => {
    const [create] = buildCreate(sqlite, 'users', richTable)

    expect(create).toContain('id INTEGER PRIMARY KEY AUTOINCREMENT')
    expect(create).toContain("roles TEXT NOT NULL DEFAULT '[]'")
    expect(create).toContain('settings TEXT')
    expect(create).toContain('createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP')
  })

  it('MySQL: INT UNSIGNED AUTO_INCREMENT y JSON', () => {
    const [create] = buildCreate(mysql, 'users', richTable)

    expect(create).toContain('`id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY')
    expect(create).toContain('`roles` JSON NOT NULL')
    expect(create).toContain('`settings` JSON')
  })

  it('compila DROP, ALTER (add/drop column) y foreign en ALTER', () => {
    expect(postgres.compileDrop('t')).toBe('DROP TABLE t')
    expect(postgres.compileDropIfExists('t')).toBe('DROP TABLE IF EXISTS t')

    const alter = new Blueprint('posts', 'alter')

    alter.integer('views').default(0)
    alter.dropColumn('legacy')
    alter.foreign('authorId').references('id').on('users').cascadeOnDelete()

    const statements = postgres.compileAlter(alter)

    expect(statements).toContain('ALTER TABLE posts ADD COLUMN views INTEGER NOT NULL DEFAULT 0')
    expect(statements).toContain('ALTER TABLE posts DROP COLUMN legacy')
    expect(statements.some((s) => s.includes('ADD CONSTRAINT') && s.includes('FOREIGN KEY (authorId)'))).toBe(true)
  })

  it('SQLite rechaza operaciones no soportadas (FK en ALTER, change de columna)', () => {
    const fk = new Blueprint('posts', 'alter')

    fk.foreign('authorId').references('id').on('users')
    expect(() => sqlite.compileAlter(fk)).toThrow(/foreign key/i)

    const change = new Blueprint('posts', 'alter')

    change.string('title', 50).change()
    expect(() => sqlite.compileAlter(change)).toThrow(/modify column/i)
  })

  // Regression: a createIfNotExists() blueprint must be safe to compile more
  // than once against a database where the table (and its index) already
  // exist — that is the whole point of "if not exists". Before this fix, the
  // CREATE TABLE got the IF NOT EXISTS guard but the trailing CREATE INDEX
  // did not, so a second migration run blew up with "index already exists"
  // even though nothing needed to change.
  it('createIfNotExists agrega IF NOT EXISTS también a los índices en Postgres y SQLite', () => {
    const withIndex = (t: Blueprint) => {
      t.increments('id')
      t.integer('userId').index()
      t.index(['userId'], 'idx_tokens_user')
    }

    const buildIfNotExists = (grammar: PostgresSchemaGrammar | SqliteSchemaGrammar, table: string): string[] => {
      const blueprint = new Blueprint(table, 'create', true)

      withIndex(blueprint)

      return grammar.compileCreate(blueprint)
    }

    for (const grammar of [postgres, sqlite]) {
      const statements = buildIfNotExists(grammar, 'tokens')

      expect(statements[0]).toContain('CREATE TABLE IF NOT EXISTS tokens')
      expect(statements.slice(1).every((s) => /^CREATE (UNIQUE )?INDEX IF NOT EXISTS /.test(s))).toBe(true)
    }

    // A plain create() (no ifNotExists) keeps emitting bare CREATE INDEX, so
    // existing migrations/tests relying on that exact SQL are unaffected.
    const plain = new Blueprint('tokens', 'create')

    withIndex(plain)
    const plainStatements = postgres.compileCreate(plain)

    expect(plainStatements.slice(1).every((s) => /^CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/.test(s))).toBe(true)
  })

  it('MySQL ignora el flag ifNotExists en los índices (sin soporte nativo)', () => {
    const blueprint = new Blueprint('tokens', 'create', true)

    blueprint.increments('id')
    blueprint.integer('userId').index()

    const statements = mysql.compileCreate(blueprint)

    expect(statements[0]).toContain('CREATE TABLE IF NOT EXISTS')
    expect(statements[1]).not.toContain('IF NOT EXISTS')
    expect(statements[1]).toMatch(/^CREATE INDEX `tokens_userid_index` ON `tokens`/)
  })
})

// ─── Live execution on SQLite ─────────────────────────────────────────────────

describe('Schema — ejecución real en SQLite', () => {
  let source: SqliteDataSource

  beforeAll(() => {
    source = new SqliteDataSource()
    DB.register(source)
  })

  afterAll(async () => {
    await source.close()
  })

  it('crea, consulta, altera y elimina una tabla vía el facade Schema', async () => {
    await Schema.create('accounts', (t) => {
      t.increments('id')
      t.string('name', 100)
      t.boolean('active').default(true)
      t.integerArray('tags').nullable()
      t.timestamp('createdAt').useCurrent()
    })

    expect(await Schema.hasTable('accounts')).toBe(true)

    await source.table('accounts').insert({ name: 'Ada', active: 1, tags: [1, 2, 3] })
    const row = await source.table('accounts').where('name', 'Ada').first()

    expect(row).not.toBeNull()
    expect(Number(row!.id)).toBe(1)
    expect(row!.name).toBe('Ada')

    // ALTER TABLE — add a column and use it.
    await Schema.table('accounts', (t) => {
      t.integer('score').default(0)
    })
    await source.table('accounts').where('name', 'Ada').update({ score: 5 })
    const updated = await source.table('accounts').where('name', 'Ada').first()

    expect(Number(updated!.score)).toBe(5)

    await Schema.dropIfExists('accounts')
    expect(await Schema.hasTable('accounts')).toBe(false)
  })

  it('createIfNotExists puede correrse dos veces sin romper por el índice (regresión)', async () => {
    const migrate = () =>
      Schema.createIfNotExists('password_reset_tokens', (t) => {
        t.increments('id')
        t.integer('userId')
        t.index('userId', 'idx_password_reset_tokens_user')
      })

    await migrate()
    // Second run simulates re-applying a migration against a DB that already
    // has the table: this used to throw "index idx_password_reset_tokens_user
    // already exists" even though the table itself was correctly skipped.
    await expect(migrate()).resolves.not.toThrow()

    await Schema.dropIfExists('password_reset_tokens')
  })
})
