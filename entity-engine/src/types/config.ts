import type { SchemaDefinition } from './schema'
import type { AssessmentDefinition, AssessmentFn } from './assessment'
import type {
  IEntityRepository,
  IAssessmentRunRepository,
} from '../interfaces/repository'

/**
 * Metadata describing the kind of entity this engine instance manages.
 */
export interface EntityDescriptor {
  /** Machine-readable identifier, e.g. 'bank-account-application'. */
  name: string
  /** Human-readable label. */
  label: string
  /** Optional description. */
  description?: string
}

/**
 * The repository object supplied by the consumer. The engine itself has no
 * persistence logic and delegates every read/write to these interfaces.
 */
export interface RepositoryConfig {
  /** Required: handles entity and version storage. */
  entities: IEntityRepository
  /**
   * Optional: handles assessment run persistence. If omitted, assessment
   * results are still returned from `assess()` but are not stored.
   */
  assessmentRuns?: IAssessmentRunRepository
}

/**
 * Complete configuration for an EntityEngine instance. All behaviour is
 * declared here at construction time; nothing can be mutated afterwards.
 */
export interface EntityEngineConfig<TData = unknown> {
  /** Metadata about the entity type this engine instance manages. */
  entity: EntityDescriptor

  /**
   * One or more JSON Schema definitions. Multiple versions per id are
   * allowed so schemas can evolve over time.
   */
  schemas: SchemaDefinition[]

  /** Named assessment definitions. */
  assessments: AssessmentDefinition[]

  /**
   * Named functions that back `{ type: 'fn' }` rules in assessments.
   * Keys must match the `fn` field of the corresponding rule.
   */
  functions: Record<string, AssessmentFn<TData>>

  /** Repository implementation for persistence. */
  repository: RepositoryConfig

  /** Optional custom id generator. Defaults to crypto.randomUUID(). */
  generateId?: () => string
}
