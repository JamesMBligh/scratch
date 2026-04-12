import type { WorkflowDefinition } from '../src/types/workflow'
import type { WorkflowEngineConfig } from '../src/types/config'
import { MemoryWorkflowRepository } from '../src/adapters/memory-repository'

export interface AppContext {
  entityId: string
  applicantName: string
  amount?: number
}

export interface ReviewEvent {
  reviewer?: string
  comment?: string
}

export const bankReviewWorkflow: WorkflowDefinition = {
  name: 'bank-account-application-review',
  version: '1.0',
  initialState: 'draft',
  finalStates: ['activated', 'rejected', 'cancelled'],
  states: [
    { name: 'draft' },
    { name: 'submitted' },
    { name: 'under-review' },
    { name: 'approved' },
    { name: 'activated' },
    { name: 'rejected' },
    { name: 'cancelled' },
  ],
  transitions: [
    { name: 'submit', from: 'draft', to: 'submitted', guard: 'application-complete' },
    { name: 'begin-review', from: 'submitted', to: 'under-review' },
    { name: 'approve', from: 'under-review', to: 'approved' },
    { name: 'reject', from: ['submitted', 'under-review'], to: 'rejected' },
    { name: 'activate', from: 'approved', to: 'activated' },
    {
      name: 'cancel',
      from: ['draft', 'submitted', 'under-review'],
      to: 'cancelled',
    },
  ],
}

export function makeConfig(
  overrides: Partial<WorkflowEngineConfig<AppContext, ReviewEvent>> = {},
): WorkflowEngineConfig<AppContext, ReviewEvent> {
  return {
    workflowKind: {
      name: 'bank-account-application-review',
      label: 'Bank Account Application Review',
    },
    workflows: [bankReviewWorkflow],
    guards: {
      'application-complete': ({ instance }) => {
        // Pretend we validate the application is ready. For tests, gate on
        // amount being present and > 0.
        if (!instance.context.amount || instance.context.amount <= 0) {
          return {
            allowed: false,
            reason: 'application amount must be set and positive',
            code: 'AMOUNT_REQUIRED',
          }
        }
        return { allowed: true }
      },
    },
    repository: {
      instances: new MemoryWorkflowRepository(),
    },
    ...overrides,
  }
}
