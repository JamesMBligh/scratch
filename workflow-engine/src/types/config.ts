import type { WorkflowDefinition } from './workflow'
import type { GuardFn } from './guard'
import type { IWorkflowRepository } from '../interfaces/repository'

/**
 * Metadata describing the kind of workflow this engine instance manages.
 */
export interface WorkflowKindDescriptor {
  /** Machine-readable identifier, e.g. 'bank-account-application-review'. */
  name: string
  label: string
  description?: string
}

/**
 * Repository configuration. Currently exposes a single entry because every
 * version of an instance — including its history — is stored through the
 * same interface.
 */
export interface WorkflowRepositoryConfig {
  instances: IWorkflowRepository
}

/**
 * Complete configuration for a WorkflowEngine instance. All behaviour is
 * declared here at construction time; nothing can be mutated afterwards.
 */
export interface WorkflowEngineConfig<
  TContext = unknown,
  TEventData = unknown,
> {
  /** Metadata describing the kind of workflow this engine manages. */
  workflowKind: WorkflowKindDescriptor

  /**
   * All known workflow definitions. Multiple versions per name are allowed
   * so workflows can evolve over time.
   */
  workflows: WorkflowDefinition[]

  /**
   * Named guard functions. Keys must match the `guard` field of any
   * transition that references them.
   */
  guards: Record<string, GuardFn<TContext, TEventData>>

  /** Repository implementation for persistence. */
  repository: WorkflowRepositoryConfig

  /** Optional custom id generator. Defaults to crypto.randomUUID(). */
  generateId?: () => string
}
