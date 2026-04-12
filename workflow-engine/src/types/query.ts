import type { WorkflowStatus } from './instance'

/**
 * Criteria passed to `find()` and `count()` to select matching instances.
 * All fields are optional; an empty criteria object matches every instance.
 */
export interface WorkflowQueryCriteria {
  workflowName?: string
  workflowVersion?: string
  currentState?: string
  status?: WorkflowStatus
  /** Filters evaluated against fields inside the instance's context. */
  contextFilters?: FieldFilter[]
  pagination?: {
    limit: number
    offset: number
  }
  sort?: {
    /** Dot-notation into instance.context, or literal 'createdAt' / 'updatedAt'. */
    field: string
    direction: 'asc' | 'desc'
  }
}

export interface FieldFilter {
  /** Dot-notation path into instance.context. */
  field: string
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains'
  value: unknown
}
