import {
  MemoryWorkflowRepository,
  WorkflowEngine,
} from 'workflow-engine'
import type {
  GuardFn,
  TransitionDefinition,
  WorkflowDefinition,
} from 'workflow-engine'
import type { AssessmentResult, EntityEngine } from 'entity-engine'

import type {
  GuardDependencies,
  OriginationContext,
  OriginationEvent,
  ProductDefinition,
} from '../domain/products'
import { prefixAssessment, prefixGuard } from './naming'

/**
 * Build a single WorkflowEngine containing every product's workflow
 * definition. Guard keys are prefixed with the productId so multiple
 * products can declare guards of the same local name without collision.
 *
 * Requires the already-constructed EntityEngine so guards can run
 * assessments as part of their decision logic.
 */
export function buildWorkflowEngine(
  products: ProductDefinition[],
  entityEngine: EntityEngine,
): WorkflowEngine<OriginationContext, OriginationEvent> {
  const workflows: WorkflowDefinition[] = products.map((p) =>
    rewriteWorkflowGuards(p),
  )

  const guards: Record<string, GuardFn<OriginationContext, OriginationEvent>> =
    {}

  for (const product of products) {
    const deps: GuardDependencies = {
      runAssessment: async (
        entityId: string,
        localName: string,
      ): Promise<AssessmentResult> =>
        entityEngine.assess(entityId, prefixAssessment(product.id, localName)),
    }
    const productGuards = product.guards(deps)
    for (const [localName, guard] of Object.entries(productGuards)) {
      guards[prefixGuard(product.id, localName)] = guard
    }
  }

  return new WorkflowEngine<OriginationContext, OriginationEvent>({
    workflowKind: {
      name: 'origination-workflow',
      label: 'Origination Workflow',
    },
    workflows,
    guards,
    repository: {
      instances: new MemoryWorkflowRepository(),
    },
  })
}

/**
 * Rewrite every guard reference inside a workflow's transitions so it
 * points at the prefixed guard key. The workflow's own name is left
 * unchanged since workflow names are naturally product-distinct.
 */
function rewriteWorkflowGuards(product: ProductDefinition): WorkflowDefinition {
  return {
    ...product.workflow,
    transitions: product.workflow.transitions.map((t) =>
      rewriteTransitionGuard(product.id, t),
    ),
  }
}

function rewriteTransitionGuard(
  productId: string,
  transition: TransitionDefinition,
): TransitionDefinition {
  if (transition.guard === undefined) return transition
  return {
    ...transition,
    guard: prefixGuard(productId, transition.guard),
  }
}
