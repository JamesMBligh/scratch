import {
  EntityEngine,
  MemoryAssessmentRunRepository,
  MemoryEntityRepository,
} from 'entity-engine'
import type {
  AssessmentDefinition,
  AssessmentFn,
  AssessmentRule,
  SchemaDefinition,
} from 'entity-engine'

import type { ProductDefinition } from '../domain/products'
import { prefixAssessment, prefixFunction } from './naming'

/**
 * Build a single EntityEngine containing every product's schema,
 * assessments, and fn-rule functions. All assessment / function names
 * are prefixed with the productId to satisfy the engine's global
 * uniqueness requirement.
 */
export function buildEntityEngine(products: ProductDefinition[]): EntityEngine {
  const schemas: SchemaDefinition[] = products.map((p) => p.schema)

  const assessments: AssessmentDefinition[] = []
  const functions: Record<string, AssessmentFn<unknown>> = {}

  for (const product of products) {
    for (const [localName, fn] of Object.entries(product.functions)) {
      functions[prefixFunction(product.id, localName)] = fn
    }

    for (const assessment of product.assessments) {
      assessments.push(rewriteAssessment(product.id, assessment))
    }
  }

  return new EntityEngine({
    entity: {
      name: 'origination-application',
      label: 'Origination Application',
      description:
        'Unified entity kind for all origination products — individual products are discriminated by schemaId.',
    },
    schemas,
    assessments,
    functions,
    repository: {
      entities: new MemoryEntityRepository(),
      assessmentRuns: new MemoryAssessmentRunRepository(),
    },
  })
}

/**
 * Rewrite an assessment so its `name`, `precondition`, and any `fn` rule
 * references are prefixed with the productId. Leaves built-in rule types
 * untouched.
 */
function rewriteAssessment(
  productId: string,
  assessment: AssessmentDefinition,
): AssessmentDefinition {
  return {
    ...assessment,
    name: prefixAssessment(productId, assessment.name),
    precondition:
      assessment.precondition !== undefined
        ? prefixAssessment(productId, assessment.precondition)
        : undefined,
    rules: assessment.rules.map((rule) => rewriteRule(productId, rule)),
  }
}

function rewriteRule(productId: string, rule: AssessmentRule): AssessmentRule {
  if (rule.type === 'fn') {
    return { type: 'fn', fn: prefixFunction(productId, rule.fn) }
  }
  return rule
}
