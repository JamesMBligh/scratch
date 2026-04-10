import type { Entity } from './entity'

/**
 * A named definition of an assessment that can be executed against an entity.
 */
export interface AssessmentDefinition {
  name: string
  version: string
  /** Assessments are scoped to a particular schema id. */
  schemaId: string
  /**
   * Optional name of another assessment that must have passed (latest run)
   * before this assessment will execute. This provides soft ordering without
   * a full state machine.
   */
  precondition?: string
  rules: AssessmentRule[]
}

export type AssessmentRule =
  | { type: 'required'; field: string }
  | { type: 'regex'; field: string; pattern: string; flags?: string }
  | { type: 'range'; field: string; min?: number; max?: number }
  | { type: 'minLength'; field: string; min: number }
  | { type: 'maxLength'; field: string; max: number }
  | { type: 'enum'; field: string; values: unknown[] }
  | { type: 'fn'; fn: string }

/**
 * Result of running a single assessment against an entity.
 */
export interface AssessmentResult {
  assessmentName: string
  assessmentVersion: string
  entityId: string
  entityVersion: number
  passed: boolean
  /** 0–100. Calculated as round((rulesPassed / totalRules) * 100). */
  score: number
  findings: Finding[]
  ranAt: Date
}

export interface Finding {
  /** Dot-notation path into entity.data, e.g. 'applicant.address.state' */
  field?: string
  /** Machine-readable code, e.g. 'FIELD_REQUIRED' */
  code: string
  /** Human-readable message */
  message: string
  severity: 'error' | 'warning' | 'info'
}

/**
 * Consumer-supplied assessment function signature.
 * Functions may return findings synchronously or asynchronously.
 */
export type AssessmentFn<TData = unknown> = (
  entity: Entity<TData>,
) => Finding[] | Promise<Finding[]>
