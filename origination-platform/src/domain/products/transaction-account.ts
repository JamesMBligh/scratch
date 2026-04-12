import type { AssessmentFn, Entity, Finding } from 'entity-engine'
import type { GuardFn } from 'workflow-engine'

import type {
  GuardDependencies,
  OriginationContext,
  OriginationEvent,
  ProductDefinition,
} from './index'

// ── Functions backing `fn` rules in assessments ───────────────────────

const validateTfnFormat: AssessmentFn<unknown> = (
  entity: Entity<unknown>,
): Finding[] => {
  const data = entity.data as { identity?: { tfn?: string } }
  const tfn = data.identity?.tfn
  if (tfn === undefined || tfn === null) return []
  if (!/^\d{9}$/.test(tfn)) {
    return [
      {
        field: 'identity.tfn',
        code: 'INVALID_TFN',
        message: 'TFN must be exactly 9 digits',
        severity: 'error',
      },
    ]
  }
  return []
}

// ── Guard factory ─────────────────────────────────────────────────────

/**
 * Builds a single-assessment gate: a guard that runs a named assessment
 * and rejects the transition if it didn't pass. The reason string is
 * composed from the error-severity findings.
 */
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

function buildGuards(
  deps: GuardDependencies,
): Record<string, GuardFn<OriginationContext, OriginationEvent>> {
  return {
    'contact-details-complete': makeGate(
      deps,
      'contact-details-sufficient',
      'CONTACT_INCOMPLETE',
    ),
    'identity-complete': makeGate(
      deps,
      'identity-sufficient',
      'IDENTITY_INCOMPLETE',
    ),
  }
}

// ── The product itself ────────────────────────────────────────────────

export const transactionAccountProduct: ProductDefinition = {
  id: 'transaction-account',
  label: 'Transaction Account',
  description:
    'Everyday deposit account. Requires basic identity verification before activation.',

  schema: {
    id: 'transaction-account',
    version: '1.0',
    jsonSchema: {
      type: 'object',
      required: ['applicant'],
      properties: {
        applicant: {
          type: 'object',
          required: ['fullName'],
          properties: {
            fullName: { type: 'string' },
            dateOfBirth: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
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
            tfn: { type: 'string' },
          },
          additionalProperties: false,
        },
        accountPreferences: {
          type: 'object',
          properties: {
            accountName: { type: 'string' },
            initialDeposit: { type: 'number' },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
  },

  functions: {
    'validate-tfn-format': validateTfnFormat,
  },

  assessments: [
    {
      name: 'contact-details-sufficient',
      version: '1.0',
      schemaId: 'transaction-account',
      rules: [
        { type: 'required', field: 'applicant.fullName' },
        { type: 'required', field: 'applicant.dateOfBirth' },
        { type: 'required', field: 'applicant.email' },
      ],
    },
    {
      name: 'identity-sufficient',
      version: '1.0',
      schemaId: 'transaction-account',
      precondition: 'contact-details-sufficient',
      rules: [
        { type: 'required', field: 'identity.documentType' },
        { type: 'required', field: 'identity.documentNumber' },
        { type: 'fn', fn: 'validate-tfn-format' },
      ],
    },
  ],

  workflow: {
    name: 'transaction-account-origination',
    version: '1.0',
    initialState: 'draft',
    finalStates: ['activated', 'cancelled', 'rejected'],
    states: [
      { name: 'draft' },
      { name: 'submitted' },
      { name: 'identity-verification' },
      { name: 'approved' },
      { name: 'activated' },
      { name: 'cancelled' },
      { name: 'rejected' },
    ],
    transitions: [
      {
        name: 'submit',
        from: 'draft',
        to: 'submitted',
        guard: 'contact-details-complete',
      },
      {
        name: 'verify-identity',
        from: 'submitted',
        to: 'identity-verification',
        guard: 'identity-complete',
      },
      {
        name: 'approve',
        from: 'identity-verification',
        to: 'approved',
      },
      { name: 'activate', from: 'approved', to: 'activated' },
      {
        name: 'cancel',
        from: ['draft', 'submitted', 'identity-verification'],
        to: 'cancelled',
      },
      {
        name: 'reject',
        from: ['submitted', 'identity-verification'],
        to: 'rejected',
      },
    ],
  },

  guards: buildGuards,
}
