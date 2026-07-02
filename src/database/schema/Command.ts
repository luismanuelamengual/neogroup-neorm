/**
 * Structural commands collected by a Blueprint alongside its columns. They map
 * one-to-one to the `compile<Name>` handling in the schema grammar. Fluent
 * wrappers (ForeignKeyDefinition, IndexDefinition) mutate these objects in
 * place so chained calls keep configuring the same command.
 */
export type SchemaCommand =
  | PrimaryCommand
  | UniqueCommand
  | IndexCommand
  | ForeignCommand
  | DropColumnCommand
  | RenameColumnCommand
  | DropIndexCommand
  | DropUniqueCommand
  | DropPrimaryCommand
  | DropForeignCommand

export interface PrimaryCommand {
  name: 'primary'
  columns: string[]
  index?: string
}

export interface UniqueCommand {
  name: 'unique'
  columns: string[]
  index?: string
}

export interface IndexCommand {
  name: 'index'
  columns: string[]
  index?: string
}

export interface ForeignCommand {
  name: 'foreign'
  columns: string[]
  references?: string[]
  on?: string
  onDelete?: string
  onUpdate?: string
  index?: string
}

export interface DropColumnCommand {
  name: 'dropColumn'
  columns: string[]
}

export interface RenameColumnCommand {
  name: 'renameColumn'
  from: string
  to: string
}

export interface DropIndexCommand {
  name: 'dropIndex'
  index: string
}

export interface DropUniqueCommand {
  name: 'dropUnique'
  index: string
}

export interface DropPrimaryCommand {
  name: 'dropPrimary'
  index?: string
}

export interface DropForeignCommand {
  name: 'dropForeign'
  index: string
}
