import type { Entity } from '../types/entity'
import type {
  AssessmentDefinition,
  AssessmentFn,
  AssessmentResult,
  Finding,
} from '../types/assessment'
import { FunctionNotRegisteredError } from '../errors'
import { executeBuiltInRule } from './built-in-rules'

/**
 * Executes all rules in an assessment definition against the given entity and
 * builds a fully-populated AssessmentResult.
 *
 * Score formula: round((rulesPassed / totalRules) * 100). A rule is
 * considered passed if it produced zero error-severity findings.
 */
export async function runAssessment<TData>(
  definition: AssessmentDefinition,
  entity: Entity<TData>,
  functions: Record<string, AssessmentFn<TData>>,
): Promise<AssessmentResult> {
  const findings: Finding[] = []
  let rulesPassed = 0

  for (const rule of definition.rules) {
    let ruleFindings: Finding[]
    if (rule.type === 'fn') {
      const fn = functions[rule.fn]
      if (!fn) {
        // Defensive — construction-time validation should prevent this.
        throw new FunctionNotRegisteredError(rule.fn)
      }
      ruleFindings = await Promise.resolve(fn(entity))
    } else {
      ruleFindings = executeBuiltInRule(rule, entity.data)
    }

    findings.push(...ruleFindings)
    const hasError = ruleFindings.some((f) => f.severity === 'error')
    if (!hasError) rulesPassed++
  }

  const totalRules = definition.rules.length
  const score =
    totalRules === 0 ? 100 : Math.round((rulesPassed / totalRules) * 100)
  const passed = !findings.some((f) => f.severity === 'error')

  return {
    assessmentName: definition.name,
    assessmentVersion: definition.version,
    entityId: entity.id,
    entityVersion: entity.version,
    passed,
    score,
    findings,
    ranAt: new Date(),
  }
}
