import { DefaultQueryBuilder, QueryTable, Statement, UpsertQuery } from '../../query'

export class MysqlQueryBuilder extends DefaultQueryBuilder {
  private static readonly BACKTICK = '`'
  private static readonly ON_DUPLICATE_KEY_UPDATE = 'ON DUPLICATE KEY UPDATE'
  private static readonly VALUES_FUNCTION = 'VALUES'

  // MySQL usa backticks para escapar identifiers (tablas, campos)
  // evitando colisiones con palabras reservadas.
  // buildTable y buildFieldName son suficientes — buildRawFieldString los invoca
  // automáticamente al parsear notaciones 'tabla.campo' y 'FUNC(tabla.campo)'.

  protected buildTable(table: QueryTable, statement: Statement) {
    if (typeof table === 'string' || table instanceof String) {
      statement.sql += MysqlQueryBuilder.BACKTICK + table + MysqlQueryBuilder.BACKTICK
    } else {
      if (table.schema) {
        statement.sql += MysqlQueryBuilder.BACKTICK + table.schema + MysqlQueryBuilder.BACKTICK
        statement.sql += DefaultQueryBuilder.POINT
      }

      statement.sql += MysqlQueryBuilder.BACKTICK + table.name + MysqlQueryBuilder.BACKTICK
    }
  }

  protected buildFieldName(name: string, statement: Statement) {
    statement.sql += MysqlQueryBuilder.BACKTICK + name + MysqlQueryBuilder.BACKTICK
  }

  protected buildOperator(operator: string, statement: Statement) {
    // MySQL LIKE is case-insensitive for default collations; translate ILIKE (default) → LIKE
    const upper = operator.toUpperCase()

    statement.sql += upper === 'ILIKE' ? 'LIKE' : upper === 'NOT ILIKE' ? 'NOT LIKE' : upper
  }

  // MySQL has no ON CONFLICT; it resolves conflicts against any unique/primary
  // key via ON DUPLICATE KEY UPDATE, so the conflict columns are not emitted.
  protected buildUpsertConflictClause(query: UpsertQuery, columns: string[], statement: Statement) {
    const updateColumns = this.resolveUpsertUpdateColumns(query, columns)

    statement.sql += DefaultQueryBuilder.SPACE
    statement.sql += MysqlQueryBuilder.ON_DUPLICATE_KEY_UPDATE
    statement.sql += DefaultQueryBuilder.SPACE

    // Nothing to update → keep the existing row unchanged (no-op assignment).
    if (updateColumns.length === 0) {
      const conflictColumns = query.getConflictColumns()
      const column = conflictColumns[0] ?? columns[0]

      this.buildFieldName(column, statement)
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += DefaultQueryBuilder.EQUALS
      statement.sql += DefaultQueryBuilder.SPACE
      this.buildFieldName(column, statement)

      return
    }

    updateColumns.forEach((column, index) => {
      if (index > 0) {
        statement.sql += DefaultQueryBuilder.COMMA
        statement.sql += DefaultQueryBuilder.SPACE
      }

      this.buildFieldName(column, statement)
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += DefaultQueryBuilder.EQUALS
      statement.sql += DefaultQueryBuilder.SPACE
      statement.sql += MysqlQueryBuilder.VALUES_FUNCTION
      statement.sql += DefaultQueryBuilder.PARENTHESIS_START
      this.buildFieldName(column, statement)
      statement.sql += DefaultQueryBuilder.PARENTHESIS_END
    })
  }
}
