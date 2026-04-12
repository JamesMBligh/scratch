import type {
  AssessmentResult,
  EntityEngine,
  EntityVersion,
} from 'entity-engine'
import type {
  TransitionDefinition,
  TransitionOutcome,
  WorkflowEngine,
} from 'workflow-engine'

import {
  ApplicationView,
  HistoryEvent,
  buildMergedHistory,
  mergeApplication,
} from './application'
import {
  OriginationContext,
  OriginationEvent,
  ProductDefinition,
  productsById,
} from './products'
import { prefixAssessment } from '../engines/naming'
import { WorkflowInstanceNotFoundError } from 'workflow-engine'
import { EntityNotFoundError } from 'entity-engine'

export interface CreateApplicationInput {
  productId: string
  data: unknown
  note?: string
}

export interface UpdateApplicationInput {
  data: unknown
  note?: string
}

export interface FireTransitionInput {
  name: string
  eventData?: OriginationEvent
  actor?: string
  note?: string
}

export interface ListApplicationsInput {
  productId?: string
  state?: string
  status?: 'active' | 'completed'
  limit?: number
  offset?: number
}

/**
 * Public-facing transition outcome — reshaped so it returns a merged
 * ApplicationView instead of the raw workflow-engine objects.
 */
export interface PublicTransitionOutcome {
  application: ApplicationView
  fromState: string
  toState: string
  transition: string
}

/**
 * The composition layer. Holds one EntityEngine and one WorkflowEngine,
 * plus the product registry. Every method is expressed in terms of
 * application-level concepts (ApplicationView, product ids, unprefixed
 * assessment names) — the engine-specific prefixing is hidden.
 */
export class ApplicationService {
  constructor(
    private readonly entityEngine: EntityEngine,
    private readonly workflowEngine: WorkflowEngine<
      OriginationContext,
      OriginationEvent
    >,
  ) {}

  // ── Product introspection ────────────────────────────────────────────

  listProducts(): ProductDefinition[] {
    return [...productsById.values()]
  }

  getProduct(productId: string): ProductDefinition | null {
    return productsById.get(productId) ?? null
  }

  // ── Application CRUD ─────────────────────────────────────────────────

  async create(input: CreateApplicationInput): Promise<ApplicationView> {
    const product = this.requireProduct(input.productId)

    const entity = await this.entityEngine.create(
      product.schema.id,
      product.schema.version,
      input.data,
      input.note,
    )
    const workflow = await this.workflowEngine.start(
      product.workflow.name,
      { entityId: entity.id, productId: product.id },
      { workflowVersion: product.workflow.version, note: input.note },
    )

    return mergeApplication(workflow, entity)
  }

  async get(applicationId: string): Promise<ApplicationView | null> {
    const workflow = await this.workflowEngine.get(applicationId)
    if (!workflow) return null
    const entity = await this.entityEngine.get(workflow.context.entityId)
    if (!entity) return null
    return mergeApplication(workflow, entity)
  }

  async update(
    applicationId: string,
    input: UpdateApplicationInput,
  ): Promise<ApplicationView> {
    const workflow = await this.workflowEngine.get(applicationId)
    if (!workflow) throw new WorkflowInstanceNotFoundError(applicationId)

    const entity = await this.entityEngine.update(
      workflow.context.entityId,
      input.data,
      input.note,
    )
    // Workflow is untouched — updating data does not advance the state machine.
    return mergeApplication(workflow, entity)
  }

  async delete(applicationId: string): Promise<void> {
    const workflow = await this.workflowEngine.get(applicationId)
    if (!workflow) throw new WorkflowInstanceNotFoundError(applicationId)
    await this.entityEngine.delete(workflow.context.entityId)
    await this.workflowEngine.delete(applicationId)
  }

  async list(input: ListApplicationsInput): Promise<{
    items: ApplicationView[]
    total: number
  }> {
    const criteria = {
      workflowName:
        input.productId !== undefined
          ? this.requireProduct(input.productId).workflow.name
          : undefined,
      currentState: input.state,
      status: input.status,
      pagination:
        input.limit !== undefined
          ? { limit: input.limit, offset: input.offset ?? 0 }
          : undefined,
      sort: { field: 'createdAt', direction: 'desc' as const },
    }
    const [workflows, total] = await Promise.all([
      this.workflowEngine.find(criteria),
      this.workflowEngine.count(criteria),
    ])

    const items: ApplicationView[] = []
    for (const wf of workflows) {
      const entity = await this.entityEngine.get(wf.context.entityId)
      if (entity) items.push(mergeApplication(wf, entity))
    }
    return { items, total }
  }

  // ── Transitions ──────────────────────────────────────────────────────

  async fire(
    applicationId: string,
    input: FireTransitionInput,
  ): Promise<PublicTransitionOutcome> {
    const outcome: TransitionOutcome<OriginationContext> =
      await this.workflowEngine.fire(
        applicationId,
        input.name,
        input.eventData,
        { actor: input.actor, note: input.note },
      )
    const entity = await this.entityEngine.get(
      outcome.instance.context.entityId,
    )
    if (!entity) throw new EntityNotFoundError(outcome.instance.context.entityId)
    return {
      application: mergeApplication(outcome.instance, entity),
      fromState: outcome.fromState,
      toState: outcome.toState,
      transition: outcome.transition,
    }
  }

  async availableTransitions(
    applicationId: string,
  ): Promise<TransitionDefinition[]> {
    const transitions =
      await this.workflowEngine.availableTransitions(applicationId)
    // Strip the product prefix off guard names before returning so
    // external callers see product-local names.
    return transitions.map((t) => ({
      ...t,
      guard: t.guard !== undefined ? stripProductPrefix(t.guard) : undefined,
    }))
  }

  // ── History ──────────────────────────────────────────────────────────

  async history(applicationId: string): Promise<HistoryEvent[]> {
    const workflow = await this.workflowEngine.get(applicationId)
    if (!workflow) throw new WorkflowInstanceNotFoundError(applicationId)

    const [entityVersions, workflowVersions] = await Promise.all([
      this.entityEngine.getVersionHistory(
        workflow.context.entityId,
      ) as Promise<EntityVersion<unknown>[]>,
      this.workflowEngine.getHistory(applicationId),
    ])

    return buildMergedHistory(entityVersions, workflowVersions)
  }

  // ── Assessments ──────────────────────────────────────────────────────

  async runAssessment(
    applicationId: string,
    localAssessmentName: string,
  ): Promise<AssessmentResult> {
    const workflow = await this.workflowEngine.get(applicationId)
    if (!workflow) throw new WorkflowInstanceNotFoundError(applicationId)
    const prefixed = prefixAssessment(
      workflow.context.productId,
      localAssessmentName,
    )
    return this.entityEngine.assess(workflow.context.entityId, prefixed)
  }

  async latestAssessment(
    applicationId: string,
    localAssessmentName: string,
  ): Promise<AssessmentResult | null> {
    const workflow = await this.workflowEngine.get(applicationId)
    if (!workflow) throw new WorkflowInstanceNotFoundError(applicationId)
    const prefixed = prefixAssessment(
      workflow.context.productId,
      localAssessmentName,
    )
    return this.entityEngine.getLatestAssessment(
      workflow.context.entityId,
      prefixed,
    )
  }

  async assessmentHistory(applicationId: string): Promise<AssessmentResult[]> {
    const workflow = await this.workflowEngine.get(applicationId)
    if (!workflow) throw new WorkflowInstanceNotFoundError(applicationId)
    return this.entityEngine.getAssessmentHistory(workflow.context.entityId)
  }

  // ── Internals ────────────────────────────────────────────────────────

  private requireProduct(productId: string): ProductDefinition {
    const product = productsById.get(productId)
    if (!product) {
      throw new UnknownProductError(productId)
    }
    return product
  }
}

/**
 * Thrown when a caller references a product id we don't have in the
 * registry. This is an application-level error, not a library error,
 * so it lives here rather than in either engine's error module.
 */
export class UnknownProductError extends Error {
  readonly code = 'UNKNOWN_PRODUCT'
  constructor(public readonly productId: string) {
    super(`Unknown product: ${productId}`)
    this.name = 'UnknownProductError'
  }
}

/**
 * Strip the leading `<productId>.` prefix from a guard name. Idempotent
 * if the input does not carry a recognised prefix.
 */
function stripProductPrefix(name: string): string {
  const dotIndex = name.indexOf('.')
  if (dotIndex === -1) return name
  const candidate = name.slice(0, dotIndex)
  return productsById.has(candidate) ? name.slice(dotIndex + 1) : name
}
