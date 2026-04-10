export interface QueryCriteria {
  schemaId?: string
  schemaVersion?: string
  filters?: FieldFilter[]
  pagination?: {
    limit: number
    offset: number
  }
  sort?: {
    /** Dot-notation into entity.data, or literal 'createdAt' / 'updatedAt'. */
    field: string
    direction: 'asc' | 'desc'
  }
}

export interface FieldFilter {
  /** Dot-notation path into entity.data. */
  field: string
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains'
  value: unknown
}
