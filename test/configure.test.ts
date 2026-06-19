import { DB, SqliteDataSource } from '../src'

// Reset DB static state between tests so each case starts clean.
function resetDB() {
  ;(DB as any)._sources.clear()
  ;(DB as any)._activeSourceName = undefined
}

// Manipulate process.env safely.
function withEnv(vars: Record<string, string>, fn: () => void) {
  const saved: Record<string, string | undefined> = {}

  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k]
    process.env[k] = v
  }

  try {
    fn()
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) {
        delete process.env[k]
      } else {
        process.env[k] = v
      }
    }
  }
}

describe('DB.configure() — env var auto-bootstrap', () => {
  beforeEach(resetDB)
  afterEach(resetDB)

  // ── DB.configure() called explicitly ────────────────────────────────────────

  describe('DB.configure() explicit call', () => {
    it('registra un source SQLite en memoria con DB_DRIVER=sqlite', () => {
      withEnv({ DB_DRIVER: 'sqlite' }, () => {
        DB['configure']()

        expect(DB.getActiveSource()).toBeInstanceOf(SqliteDataSource)
      })
    })

    it('respeta DB_FILE para SQLite', () => {
      withEnv({ DB_DRIVER: 'sqlite', DB_FILE: './test.db' }, () => {
        DB['configure']()

        const src = DB.getActiveSource() as SqliteDataSource

        expect(src.getFilename()).toBe('./test.db')
      })
    })

    it('es no-op si ya hay sources registrados manualmente', () => {
      const manual = new SqliteDataSource()

      DB.register(manual)

      withEnv({ DB_DRIVER: 'sqlite', DB_FILE: './should-not-be-used.db' }, () => {
        DB['configure']()

        // The active source must still be the one registered manually
        expect(DB.getActiveSource()).toBe(manual)
      })
    })

    it('lanza error si no hay vars de DB_DRIVER ni sources manuales', () => {
      expect(() => DB['configure']()).toThrow(/DB_DRIVER/)
    })

    it('lanza error si el driver es desconocido', () => {
      withEnv({ DB_DRIVER: 'oracle' }, () => {
        expect(() => DB['configure']()).toThrow(/Unknown DB driver/)
      })
    })
  })

  // ── Named sources ────────────────────────────────────────────────────────────

  describe('named sources via DB_<NAME>_DRIVER', () => {
    it('registra un source nombrado y lo hace accesible via DB.source()', () => {
      withEnv({ DB_REPORTING_DRIVER: 'sqlite', DB_REPORTING_FILE: './reporting.db' }, () => {
        DB['configure']()

        const reporting = DB.source('reporting') as SqliteDataSource

        expect(reporting).toBeInstanceOf(SqliteDataSource)
        expect(reporting.getFilename()).toBe('./reporting.db')
      })
    })

    it('el source por defecto (DB_DRIVER) queda como activo', () => {
      withEnv(
        {
          DB_DRIVER: 'sqlite',
          DB_REPORTING_DRIVER: 'sqlite',
          DB_REPORTING_FILE: './reporting.db'
        },
        () => {
          DB['configure']()

          // Active source is the unnamed default
          const active = DB.getActiveSource() as SqliteDataSource

          expect(active.getFilename()).toBe(':memory:')

          // Named source accessible separately
          const reporting = DB.source('reporting') as SqliteDataSource

          expect(reporting.getFilename()).toBe('./reporting.db')
        }
      )
    })

    it('sin DB_DRIVER, el primer source nombrado (alfabético) queda como activo', () => {
      withEnv({ DB_REPORTING_DRIVER: 'sqlite', DB_REPORTING_FILE: './r.db' }, () => {
        DB['configure']()

        const active = DB.getActiveSource() as SqliteDataSource

        expect(active.getFilename()).toBe('./r.db')
      })
    })
  })

  // ── Debug / Readonly via env vars ────────────────────────────────────────────

  describe('DB_DEBUG y DB_READONLY', () => {
    it('habilita debugMode y readonly en el source por defecto', () => {
      withEnv({ DB_DRIVER: 'sqlite', DB_DEBUG: 'true', DB_READONLY: '1' }, () => {
        DB['configure']()

        const src = DB.getActiveSource()

        expect(src.isDebugEnabled()).toBe(true)
        expect(src.isReadonly()).toBe(true)
      })
    })

    it('quedan deshabilitados con valores falsos', () => {
      withEnv({ DB_DRIVER: 'sqlite', DB_DEBUG: 'false', DB_READONLY: 'off' }, () => {
        DB['configure']()

        const src = DB.getActiveSource()

        expect(src.isDebugEnabled()).toBe(false)
        expect(src.isReadonly()).toBe(false)
      })
    })

    it('soporta DB_<NAME>_DEBUG y DB_<NAME>_READONLY en sources nombrados', () => {
      withEnv(
        {
          DB_DRIVER: 'sqlite',
          DB_REPORTING_DRIVER: 'sqlite',
          DB_REPORTING_DEBUG: 'yes',
          DB_REPORTING_READONLY: 'on'
        },
        () => {
          DB['configure']()

          expect(DB.getActiveSource().isDebugEnabled()).toBe(false)
          expect(DB.getActiveSource().isReadonly()).toBe(false)
          expect(DB.source('reporting').isDebugEnabled()).toBe(true)
          expect(DB.source('reporting').isReadonly()).toBe(true)
        }
      )
    })
  })

  // ── DB_URL connection string ─────────────────────────────────────────────────

  describe('DB_URL connection string', () => {
    it('configura SQLite en memoria con sqlite://:memory:', () => {
      withEnv({ DB_URL: 'sqlite://:memory:' }, () => {
        DB['configure']()

        const src = DB.getActiveSource() as SqliteDataSource

        expect(src).toBeInstanceOf(SqliteDataSource)
        expect(src.getFilename()).toBe(':memory:')
      })
    })

    it('configura SQLite con ruta absoluta: sqlite:///path/to/db.sqlite', () => {
      withEnv({ DB_URL: 'sqlite:///tmp/test.db' }, () => {
        DB['configure']()

        const src = DB.getActiveSource() as SqliteDataSource

        expect(src).toBeInstanceOf(SqliteDataSource)
        expect(src.getFilename()).toBe('/tmp/test.db')
      })
    })

    it('configura SQLite con ruta relativa: sqlite://relative/path.db', () => {
      withEnv({ DB_URL: 'sqlite://relative/path.db' }, () => {
        DB['configure']()

        const src = DB.getActiveSource() as SqliteDataSource

        expect(src).toBeInstanceOf(SqliteDataSource)
        expect(src.getFilename()).toBe('relative/path.db')
      })
    })

    it('DB_URL toma prioridad sobre DB_DRIVER para el source por defecto', () => {
      withEnv({ DB_URL: 'sqlite://:memory:', DB_DRIVER: 'sqlite', DB_FILE: './should-not-be-used.db' }, () => {
        DB['configure']()

        const src = DB.getActiveSource() as SqliteDataSource

        expect(src.getFilename()).toBe(':memory:')
      })
    })

    it('soporta DB_<NAME>_URL para sources nombrados', () => {
      withEnv({ DB_DRIVER: 'sqlite', DB_REPORTING_URL: 'sqlite:///reporting.db' }, () => {
        DB['configure']()

        const active = DB.getActiveSource() as SqliteDataSource

        expect(active.getFilename()).toBe(':memory:')

        const reporting = DB.source('reporting') as SqliteDataSource

        expect(reporting).toBeInstanceOf(SqliteDataSource)
        expect(reporting.getFilename()).toBe('/reporting.db')
      })
    })

    it('DB_<NAME>_URL tiene prioridad sobre DB_<NAME>_DRIVER para el mismo source', () => {
      withEnv(
        {
          DB_URL: 'sqlite://:memory:',
          DB_REPORTING_URL: 'sqlite:///reporting.db',
          DB_REPORTING_DRIVER: 'sqlite',
          DB_REPORTING_FILE: './should-not-be-used.db'
        },
        () => {
          DB['configure']()

          const reporting = DB.source('reporting') as SqliteDataSource

          expect(reporting.getFilename()).toBe('/reporting.db')
        }
      )
    })

    it('lanza error si DB_URL es un string inválido', () => {
      withEnv({ DB_URL: 'not-a-valid-url' }, () => {
        expect(() => DB['configure']()).toThrow(/Invalid connection string/)
      })
    })

    it('lanza error si el scheme del DB_URL es desconocido', () => {
      withEnv({ DB_URL: 'oracle://localhost/mydb' }, () => {
        expect(() => DB['configure']()).toThrow(/Unknown DB driver/)
      })
    })

    it('el error de "no source configurado" menciona DB_URL', () => {
      expect(() => DB['configure']()).toThrow(/DB_URL/)
    })
  })

  // ── Auto-bootstrap ───────────────────────────────────────────────────────────

  describe('auto-bootstrap (implicit configure on first use)', () => {
    it('DB.table() arranca sin register() si DB_DRIVER está en el entorno', async () => {
      await withEnvAsync({ DB_DRIVER: 'sqlite' }, async () => {
        const source = DB.getActiveSource()

        expect(source).toBeInstanceOf(SqliteDataSource)

        // Actually execute a query to confirm the source works
        await source.execute('CREATE TABLE IF NOT EXISTS _autotest (id INTEGER PRIMARY KEY)')
        const rows = await source.query('SELECT 1 AS n')

        expect(rows[0].n).toBe(1)
        await source.close()
      })
    })

    it('lanza error descriptivo si no hay DB_DRIVER y no hay sources registrados', () => {
      expect(() => DB.getActiveSource()).toThrow(/DB_DRIVER/)
    })
  })
})

// Async variant of withEnv for async test bodies
async function withEnvAsync(vars: Record<string, string>, fn: () => Promise<void>) {
  const saved: Record<string, string | undefined> = {}

  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k]
    process.env[k] = v
  }

  try {
    await fn()
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) {
        delete process.env[k]
      } else {
        process.env[k] = v
      }
    }
  }
}
