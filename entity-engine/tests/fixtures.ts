import type { EntityEngineConfig } from '../src/types/config'
import type { SchemaDefinition } from '../src/types/schema'
import type { AssessmentDefinition } from '../src/types/assessment'
import {
  MemoryAssessmentRunRepository,
  MemoryEntityRepository,
} from '../src/adapters/memory-repository'

export interface BankApp {
  applicant: {
    fullName: string
    dob?: string
    email?: string
    age?: number
  }
  identity?: {
    documentType?: string
    documentNumber?: string
    tfn?: string
  }
  tags?: string[]
}

export const bankSchema: SchemaDefinition = {
  id: 'bank-account-application',
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
          dob: { type: 'string' },
          email: { type: 'string' },
          age: { type: 'number' },
        },
      },
      identity: {
        type: 'object',
        properties: {
          documentType: { type: 'string' },
          documentNumber: { type: 'string' },
          tfn: { type: 'string' },
        },
      },
      tags: { type: 'array', items: { type: 'string' } },
    },
  },
}

export const contactAssessment: AssessmentDefinition = {
  name: 'contact-details-sufficient',
  version: '1.0',
  schemaId: 'bank-account-application',
  rules: [
    { type: 'required', field: 'applicant.fullName' },
    { type: 'required', field: 'applicant.dob' },
    { type: 'required', field: 'applicant.email' },
  ],
}

export const kycAssessment: AssessmentDefinition = {
  name: 'kyc-sufficient',
  version: '1.0',
  schemaId: 'bank-account-application',
  precondition: 'contact-details-sufficient',
  rules: [
    { type: 'required', field: 'identity.documentType' },
    { type: 'required', field: 'identity.documentNumber' },
    { type: 'fn', fn: 'validate-tfn-format' },
  ],
}

export function makeConfig(
  overrides: Partial<EntityEngineConfig<BankApp>> = {},
): EntityEngineConfig<BankApp> {
  return {
    entity: {
      name: 'bank-account-application',
      label: 'Bank Account Application',
    },
    schemas: [bankSchema],
    assessments: [contactAssessment, kycAssessment],
    functions: {
      'validate-tfn-format': (entity) => {
        const tfn = entity.data.identity?.tfn
        if (tfn !== undefined && !/^\d{9}$/.test(tfn)) {
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
      },
    },
    repository: {
      entities: new MemoryEntityRepository(),
      assessmentRuns: new MemoryAssessmentRunRepository(),
    },
    ...overrides,
  }
}
