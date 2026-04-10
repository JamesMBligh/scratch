/**
 * The current state of a stored entity.
 */
export interface Entity<TData = unknown> {
  id: string
  schemaId: string
  schemaVersion: string
  /** Monotonically increasing integer, starts at 1 */
  version: number
  data: TData
  createdAt: Date
  updatedAt: Date
}

/**
 * A historical version record, stored for every mutation.
 */
export interface EntityVersion<TData = unknown> extends Entity<TData> {
  previousVersion: number | null
  changeNote?: string
}
