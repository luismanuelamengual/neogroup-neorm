import { Connection } from '../../Connection'
import { DataSource } from '../../DataSource'
import { SqliteConnection } from './SqliteConnection'
import { SqliteQueryBuilder } from './SqliteQueryBuilder'
import { SqliteSchemaGrammar } from './SqliteSchemaGrammar'

export class SqliteDataSource extends DataSource {
  private db: any
  private filename: string

  constructor() {
    super(new SqliteQueryBuilder(), new SqliteSchemaGrammar())
    this.filename = ':memory:'
  }

  public setFilename(filename: string) {
    this.filename = filename
  }

  public getFilename(): string {
    return this.filename
  }

  public async close(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  protected async requestConnection(): Promise<Connection> {
    if (!this.db || !this.isDatabaseOpen(this.db)) {
      // node:sqlite viene incorporado en Node.js >= 22.5 — sin dependencias externas
      const { DatabaseSync } = require('node:sqlite')

      this.db = new DatabaseSync(this.filename)
    }

    return new SqliteConnection(this.db)
  }

  private isDatabaseOpen(db: any): boolean {
    // Node >= 23.10 expone db.isOpen; en Node 22 se verifica intentando preparar una sentencia
    if (typeof db.isOpen === 'boolean') {
      return db.isOpen
    }

    try {
      db.prepare('SELECT 1')

      return true
    } catch {
      return false
    }
  }
}
