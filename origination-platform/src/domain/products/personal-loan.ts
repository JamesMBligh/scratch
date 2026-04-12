import type { AssessmentFn, Entity, Finding } from 'entity-engine'
import type { GuardFn } from 'workflow-engine'

import type {
  GuardDependencies,
  OriginationContext,
  OriginationEvent,
  ProductDefinition,
} from './index'

// ── Shape of personal loan data (used by fn rules) ────────────────────

interface PersonalLoanData {
  applicant?: {
    fullName?: string
    dateOfBirth?: string
    email?: string
    employmentStatus?: string
    annualIncome?: number
  }
  identity?: {
    documentType?: string
    documentNumber?: string
  }
  loan?: {
    amount?: number
    termMonths?: number
    purpose?: string
  }
  creditCheck?: {
    score?: number
    checkedAt?: string
  }
}

// ── Functions backing `fn` rules in assessments ───────────────────────

/**
 * Credit score must be present and at least 600. Absence of the credit
 * check block at all produces a finding — the rule is "we need a credit
 * check result and it must be passing".
 */
const checkCreditScore: AssessmentFn<unknown> = (
  entity: Entity<unknown>,
): Finding[] => {
  const data = entity.data as PersonalLoanData
  const score = data.creditCheck?.score
  if (score === undefined || score === null) {
    return [
      {
        field: 'creditCheck.score',
        code: 'CREDIT_CHECK_MISSING',
        message: 'Credit check score is required',
        severity: 'error',
      },
    ]
  }
  if (score < 600) {
    return [
      {
        field: 'creditCheck.score',
        code: 'CREDIT_SCORE_TOO_LOW',
        message: `Credit score ${score} is below the required minimum of 600`,
        severity: 'error',
      },
    ]
  }
  return []
}

/**
 * Very rough affordability check: monthly repayment at 8% APR must be at
 * most 40% of monthly gross income. This is deliberately simple — the
 * point is to demonstrate an fn rule that reasons across several fields.
 */
const checkAffordability: AssessmentFn<unknown> = (
  entity: Entity<unknown>,
): Finding[] => {
  const data = entity.data as PersonalLoanData
  const amount = data.loan?.amount
  const termMonths = data.loan?.termMonths
  const income = data.applicant?.annualIncome

  if (amount === undefined || termMonths === undefined || income === undefined) {
    return [
      {
        code: 'AFFORDABILITY_INPUTS_MISSING',
        message: 'Loan amount, term, and annual income are all required for affordability check',
        severity: 'error',
      },
    ]
  }
  if (amount <= 0 || termMonths <= 0 || income <= 0) {
    return [
      {
        code: 'AFFORDABILITY_INPUTS_INVALID',
        message: 'Loan amount, term, and annual income must all be positive',
        severity: 'error',
      },
    ]
  }

  const monthlyRate = 0.08 / 12
  // Standard amortisation: M = P * r * (1+r)^n / ((1+r)^n - 1)
  const pow = Math.pow(1 + monthlyRate, termMonths)
  const monthlyRepayment = (amount * monthlyRate * pow) / (pow - 1)
  const monthlyIncome = income / 12
  const ratio = monthlyRepayment / monthlyIncome

  if (ratio > 0.4) {
    return [
      {
        code: 'DTI_TOO_HIGH',
        message: `Monthly repayment of ${monthlyRepayment.toFixed(2)} exceeds 40% of monthly income (${monthlyIncome.toFixed(2)})`,
        severity: 'error',
      },
    ]
  }
  return []
}

// ── Guard factory ─────────────────────────────────────────────────────

function makeGate(
  deps: GuardDependencies,
  assessmentName: string,
  code: string,
): GuardFn<OriginationContext, OriginationEvent> {
  return async ({ instance }) => {
    const result = await deps.runAssessment(
      instance.context.entityId,
      assessmentName,
    )
    if (result.passed) return { allowed: true }
    const reason =
      result.findings
        .filter((f) => f.severity === 'error')
        .map((f) => f.message)
        .join('; ') || 'assessment failed'
    return { allowed: false, reason, code }
  }
}

/**
 * A guard that composes two assessments — the transition is only allowed
 * if both pass. Demonstrates a guard that runs multiple assessments.
 */
function makeCompositeGate(
  deps: GuardDependencies,
  assessmentNames: string[],
  code: string,
): GuardFn<OriginationContext, OriginationEvent> {
  return async ({ instance }) => {
    const results = await Promise.all(
      assessmentNames.map((name) =>
        deps.runAssessment(instance.context.entityId, name),
      ),
    )
    const allPassed = results.every((r) => r.passed)
    if (allPassed) return { allowed: true }
    const reason = results
      .flatMap((r) => r.findings)
      .filter((f) => f.severity === 'error')
      .map((f) => f.message)
      .join('; ')
    return {
      allowed: false,
      reason: reason || 'composite assessment failed',
      code,
    }
  }
}

function buildGuards(
  deps: GuardDependencies,
): Record<string, GuardFn<OriginationContext, OriginationEvent>> {
  return {
    'applicant-and-loan-complete': makeCompositeGate(
      deps,
      ['applicant-details-sufficient', 'loan-details-sufficient'],
      'APPLICATION_INCOMPLETE',
    ),
    'identity-complete': makeGate(
      deps,
      'identity-sufficient',
      'IDENTITY_INCOMPLETE',
    ),
    'credit-acceptable': makeGate(
      deps,
      'credit-acceptable',
      'CREDIT_UNACCEPTABLE',
    ),
    'loan-affordable': makeGate(
      deps,
      'loan-affordable',
      'LOAN_UNAFFORDABLE',
    ),
  }
}

// ── The product itself ────────────────────────────────────────────────

export const personalLoanProduct: ProductDefinition = {
  id: 'personal-loan',
  label: 'Personal Loan',
  description:
    'Unsecured personal loan. Requires identity verification, credit check, and affordability assessment before funding.',

  schema: {
    id: 'personal-loan',
    version: '1.0',
    jsonSchema: {
      type: 'object',
      required: ['applicant', 'loan'],
      properties: {
        applicant: {
          type: 'object',
          required: ['fullName'],
          properties: {
            fullName: { type: 'string' },
            dateOfBirth: { type: 'string' },
            email: { type: 'string' },
            employmentStatus: {
              type: 'string',
              enum: ['employed', 'self_employed', 'unemployed', 'retired'],
            },
            annualIncome: { type: 'number' },
          },
          additionalProperties: false,
        },
        identity: {
          type: 'object',
          properties: {
            documentType: {
              type: 'string',
              enum: ['passport', 'drivers_licence'],
            },
            documentNumber: { type: 'string' },
          },
          additionalProperties: false,
        },
        loan: {
          type: 'object',
          required: ['amount', 'termMonths', 'purpose'],
          properties: {
            amount: { type: 'number' },
            termMonths: { type: 'number' },
            purpose: {
              type: 'string',
              enum: [
                'home_improvement',
                'debt_consolidation',
                'vehicle',
                'other',
              ],
            },
          },
          additionalProperties: false,
        },
        creditCheck: {
          type: 'object',
          properties: {
            score: { type: 'number' },
            checkedAt: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
  },

  functions: {
    'check-credit-score': checkCreditScore,
    'check-affordability': checkAffordability,
  },

  assessments: [
    {
      name: 'applicant-details-sufficient',
      version: '1.0',
      schemaId: 'personal-loan',
      rules: [
        { type: 'required', field: 'applicant.fullName' },
        { type: 'required', field: 'applicant.dateOfBirth' },
        { type: 'required', field: 'applicant.email' },
        { type: 'required', field: 'applicant.employmentStatus' },
        { type: 'required', field: 'applicant.annualIncome' },
      ],
    },
    {
      name: 'loan-details-sufficient',
      version: '1.0',
      schemaId: 'personal-loan',
      rules: [
        { type: 'required', field: 'loan.amount' },
        { type: 'required', field: 'loan.termMonths' },
        { type: 'required', field: 'loan.purpose' },
      ],
    },
    {
      name: 'identity-sufficient',
      version: '1.0',
      schemaId: 'personal-loan',
      rules: [
        { type: 'required', field: 'identity.documentType' },
        { type: 'required', field: 'identity.documentNumber' },
      ],
    },
    {
      name: 'credit-acceptable',
      version: '1.0',
      schemaId: 'personal-loan',
      rules: [{ type: 'fn', fn: 'check-credit-score' }],
    },
    {
      name: 'loan-affordable',
      version: '1.0',
      schemaId: 'personal-loan',
      rules: [{ type: 'fn', fn: 'check-affordability' }],
    },
  ],

  workflow: {
    name: 'personal-loan-origination',
    version: '1.0',
    initialState: 'draft',
    finalStates: ['funded', 'cancelled', 'declined'],
    states: [
      { name: 'draft' },
      { name: 'submitted' },
      { name: 'identity-verification' },
      { name: 'credit-check' },
      { name: 'underwriting' },
      { name: 'approved' },
      { name: 'funded' },
      { name: 'cancelled' },
      { name: 'declined' },
    ],
    transitions: [
      {
        name: 'submit',
        from: 'draft',
        to: 'submitted',
        guard: 'applicant-and-loan-complete',
      },
      {
        name: 'verify-identity',
        from: 'submitted',
        to: 'identity-verification',
        guard: 'identity-complete',
      },
      {
        name: 'run-credit-check',
        from: 'identity-verification',
        to: 'credit-check',
      },
      {
        name: 'begin-underwriting',
        from: 'credit-check',
        to: 'underwriting',
        guard: 'credit-acceptable',
      },
      {
        name: 'approve',
        from: 'underwriting',
        to: 'approved',
        guard: 'loan-affordable',
      },
      { name: 'fund', from: 'approved', to: 'funded' },
      {
        name: 'cancel',
        from: [
          'draft',
          'submitted',
          'identity-verification',
          'credit-check',
          'underwriting',
        ],
        to: 'cancelled',
      },
      {
        name: 'decline',
        from: ['credit-check', 'underwriting'],
        to: 'declined',
      },
    ],
  },

  guards: buildGuards,
}
