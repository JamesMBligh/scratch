import type {
  AssessmentDefinition,
  AssessmentFn,
  AssessmentResult,
  SchemaDefinition,
} from 'entity-engine'
import type { GuardFn, WorkflowDefinition } from 'workflow-engine'

import { transactionAccountProduct } from './transaction-account'
import { personalLoanProduct } from './personal-loan'

/**
 * Context carried on every workflow instance. This is the soft coupling
 * between the workflow-engine side and the entity-engine side.
 */
export interface OriginationContext {
  entityId: string
  productId: string
}

/**
 * Event payload attached to workflow transitions.
 */
export interface OriginationEvent {
  [k: string]: unknown
}

/**
 * Dependencies handed to a product's guards factory at engine-construction
 * time. `runAssessment` takes an unprefixed (product-local) assessment
 * name and runs it against the product's own configured assessments; the
 * engine builder closes over this for each specific product so guards
 * never need to think about name prefixing.
 */
export interface GuardDependencies {
  runAssessment: (entityId: string, localName: string) => Promise<AssessmentResult>
}

/**
 * A product bundles together everything the origination platform needs to
 * know about a single banking product: the shape of its data, the
 * assessments that evaluate that data, the workflow that governs its
 * lifecycle, and the guards that gate its transitions.
 *
 * Names inside this object are **unprefixed** — the product-local names
 * as the product author wrote them. The engine builders in
 * `src/engines/` apply productId prefixes at engine-construction time so
 * multiple products can coexist in a single EntityEngine / WorkflowEngine.
 */
export interface ProductDefinition {
  id: string
  label: string
  description: string

  /** One schema per product. `id` matches `ProductDefinition.id`. */
  schema: SchemaDefinition

  /** Consumer-supplied functions backing `fn` rules in assessments. */
  functions: Record<string, AssessmentFn<unknown>>

  /** Assessments in their unprefixed form. */
  assessments: AssessmentDefinition[]

  /** Workflow definition. Guards inside transitions use product-local names. */
  workflow: WorkflowDefinition

  /**
   * Factory that produces the product's guards. Called once at engine
   * construction time with dependencies scoped to this product.
   */
  guards: (
    deps: GuardDependencies,
  ) => Record<string, GuardFn<OriginationContext, OriginationEvent>>
}

export const products: ProductDefinition[] = [
  transactionAccountProduct,
  personalLoanProduct,
]

export const productsById: Map<string, ProductDefinition> = new Map(
  products.map((p) => [p.id, p]),
)

export { transactionAccountProduct, personalLoanProduct }
