import { describe, expect, it } from 'vitest'

import { WorkflowEngine } from '../src/engine'
import {
  GuardRejectedError,
  InvalidTransitionError,
  TerminalStateError,
  WorkflowDefinitionNotFoundError,
  WorkflowEngineConfigError,
  WorkflowInstanceNotFoundError,
} from '../src/errors'
import { AppContext, ReviewEvent, bankReviewWorkflow, makeConfig } from './fixtures'

describe('WorkflowEngine construction', () => {
  it('constructs with a valid config', () => {
    expect(
      () => new WorkflowEngine<AppContext, ReviewEvent>(makeConfig()),
    ).not.toThrow()
  })

  it('throws on duplicate workflow name+version', () => {
    expect(
      () =>
        new WorkflowEngine<AppContext, ReviewEvent>(
          makeConfig({
            workflows: [bankReviewWorkflow, { ...bankReviewWorkflow }],
          }),
        ),
    ).toThrow(WorkflowEngineConfigError)
  })

  it('throws when initialState is not declared in states', () => {
    expect(
      () =>
        new WorkflowEngine<AppContext, ReviewEvent>(
          makeConfig({
            workflows: [{ ...bankReviewWorkflow, initialState: 'no-such-state' }],
          }),
        ),
    ).toThrow(WorkflowEngineConfigError)
  })

  it('throws when a finalState is not declared in states', () => {
    expect(
      () =>
        new WorkflowEngine<AppContext, ReviewEvent>(
          makeConfig({
            workflows: [
              { ...bankReviewWorkflow, finalStates: ['does-not-exist'] },
            ],
          }),
        ),
    ).toThrow(WorkflowEngineConfigError)
  })

  it('throws when a transition references an unknown source state', () => {
    expect(
      () =>
        new WorkflowEngine<AppContext, ReviewEvent>(
          makeConfig({
            workflows: [
              {
                ...bankReviewWorkflow,
                transitions: [
                  ...bankReviewWorkflow.transitions,
                  {
                    name: 'bogus',
                    from: 'nowhere',
                    to: 'approved',
                  },
                ],
              },
            ],
          }),
        ),
    ).toThrow(WorkflowEngineConfigError)
  })

  it('throws when a transition references an unknown target state', () => {
    expect(
      () =>
        new WorkflowEngine<AppContext, ReviewEvent>(
          makeConfig({
            workflows: [
              {
                ...bankReviewWorkflow,
                transitions: [
                  ...bankReviewWorkflow.transitions,
                  { name: 'leap', from: 'draft', to: 'nowhere' },
                ],
              },
            ],
          }),
        ),
    ).toThrow(WorkflowEngineConfigError)
  })

  it('throws on duplicate transition names within a workflow', () => {
    expect(
      () =>
        new WorkflowEngine<AppContext, ReviewEvent>(
          makeConfig({
            workflows: [
              {
                ...bankReviewWorkflow,
                transitions: [
                  ...bankReviewWorkflow.transitions,
                  { name: 'submit', from: 'draft', to: 'rejected' },
                ],
              },
            ],
          }),
        ),
    ).toThrow(WorkflowEngineConfigError)
  })

  it('throws when a guard name is not registered', () => {
    expect(
      () =>
        new WorkflowEngine<AppContext, ReviewEvent>(
          makeConfig({
            workflows: [
              {
                ...bankReviewWorkflow,
                transitions: [
                  ...bankReviewWorkflow.transitions.filter(
                    (t) => t.name !== 'submit',
                  ),
                  {
                    name: 'submit',
                    from: 'draft',
                    to: 'submitted',
                    guard: 'phantom',
                  },
                ],
              },
            ],
          }),
        ),
    ).toThrow(WorkflowEngineConfigError)
  })

  it('throws when a transition fires from a final state', () => {
    expect(
      () =>
        new WorkflowEngine<AppContext, ReviewEvent>(
          makeConfig({
            workflows: [
              {
                ...bankReviewWorkflow,
                transitions: [
                  ...bankReviewWorkflow.transitions,
                  {
                    name: 'resurrect',
                    from: 'rejected',
                    to: 'draft',
                  },
                ],
              },
            ],
          }),
        ),
    ).toThrow(WorkflowEngineConfigError)
  })
})

describe('start', () => {
  it('creates an instance at version 1 in the initial state', async () => {
    const engine = new WorkflowEngine<AppContext, ReviewEvent>(makeConfig())
    const instance = await engine.start('bank-account-application-review', {
      entityId: 'ent-1',
      applicantName: 'Jane',
      amount: 1000,
    })
    expect(instance.version).toBe(1)
    expect(instance.currentState).toBe('draft')
    expect(instance.status).toBe('active')
    expect(instance.context.applicantName).toBe('Jane')
  })

  it('records a start cause in history', async () => {
    const engine = new WorkflowEngine<AppContext, ReviewEvent>(makeConfig())
    const instance = await engine.start(
      'bank-account-application-review',
      { entityId: 'ent-1', applicantName: 'Jane' },
      { note: 'kicked off by onboarding team' },
    )
    const history = await engine.getHistory(instance.id)
    expect(history).toHaveLength(1)
    expect(history[0].cause.type).toBe('start')
    if (history[0].cause.type === 'start') {
      expect(history[0].cause.note).toBe('kicked off by onboarding team')
    }
  })

  it('throws when the workflow definition does not exist', async () => {
    const engine = new WorkflowEngine<AppContext, ReviewEvent>(makeConfig())
    await expect(
      engine.start('no-such-workflow', {
        entityId: 'ent-1',
        applicantName: 'Jane',
      }),
    ).rejects.toBeInstanceOf(WorkflowDefinitionNotFoundError)
  })
})

describe('fire — happy path', () => {
  it('advances current state, increments version, and records the transition', async () => {
    const engine = new WorkflowEngine<AppContext, ReviewEvent>(makeConfig())
    const instance = await engine.start('bank-account-application-review', {
      entityId: 'ent-1',
      applicantName: 'Jane',
      amount: 500,
    })

    const outcome = await engine.fire(
      instance.id,
      'submit',
      { reviewer: undefined },
      { actor: 'onboarding-service' },
    )
    expect(outcome.fromState).toBe('draft')
    expect(outcome.toState).toBe('submitted')
    expect(outcome.instance.version).toBe(2)
    expect(outcome.instance.currentState).toBe('submitted')
    expect(outcome.instance.status).toBe('active')

    if (outcome.record.cause.type === 'transition') {
      expect(outcome.record.cause.actor).toBe('onboarding-service')
    } else {
      throw new Error('expected transition cause')
    }
  })

  it('supports transitions with multiple source states', async () => {
    const engine = new WorkflowEngine<AppContext, ReviewEvent>(makeConfig())
    const instance = await engine.start('bank-account-application-review', {
      entityId: 'ent-1',
      applicantName: 'Jane',
      amount: 500,
    })
    await engine.fire(instance.id, 'submit')
    await engine.fire(instance.id, 'begin-review')
    const outcome = await engine.fire(instance.id, 'reject')
    expect(outcome.fromState).toBe('under-review')
    expect(outcome.toState).toBe('rejected')
  })

  it('sets status to completed when transitioning into a final state', async () => {
    const engine = new WorkflowEngine<AppContext, ReviewEvent>(makeConfig())
    const instance = await engine.start('bank-account-application-review', {
      entityId: 'ent-1',
      applicantName: 'Jane',
      amount: 500,
    })
    await engine.fire(instance.id, 'submit')
    await engine.fire(instance.id, 'begin-review')
    await engine.fire(instance.id, 'approve')
    const outcome = await engine.fire(instance.id, 'activate')
    expect(outcome.instance.status).toBe('completed')
  })
})

describe('fire — error cases', () => {
  it('throws WorkflowInstanceNotFoundError for an unknown instance', async () => {
    const engine = new WorkflowEngine<AppContext, ReviewEvent>(makeConfig())
    await expect(
      engine.fire('no-such-instance', 'submit'),
    ).rejects.toBeInstanceOf(WorkflowInstanceNotFoundError)
  })

  it('throws InvalidTransitionError for an unknown transition name', async () => {
    const engine = new WorkflowEngine<AppContext, ReviewEvent>(makeConfig())
    const instance = await engine.start('bank-account-application-review', {
      entityId: 'ent-1',
      applicantName: 'Jane',
      amount: 500,
    })
    await expect(
      engine.fire(instance.id, 'teleport'),
    ).rejects.toBeInstanceOf(InvalidTransitionError)
  })

  it('throws InvalidTransitionError when transition is not available from current state', async () => {
    const engine = new WorkflowEngine<AppContext, ReviewEvent>(makeConfig())
    const instance = await engine.start('bank-account-application-review', {
      entityId: 'ent-1',
      applicantName: 'Jane',
      amount: 500,
    })
    // 'approve' is only fireable from 'under-review'
    await expect(engine.fire(instance.id, 'approve')).rejects.toBeInstanceOf(
      InvalidTransitionError,
    )
  })

  it('throws TerminalStateError when firing against a completed instance', async () => {
    const engine = new WorkflowEngine<AppContext, ReviewEvent>(makeConfig())
    const instance = await engine.start('bank-account-application-review', {
      entityId: 'ent-1',
      applicantName: 'Jane',
      amount: 500,
    })
    await engine.fire(instance.id, 'submit')
    await engine.fire(instance.id, 'reject')
    await expect(engine.fire(instance.id, 'approve')).rejects.toBeInstanceOf(
      TerminalStateError,
    )
  })
})

describe('guards', () => {
  it('blocks a transition when the guard returns allowed: false', async () => {
    const engine = new WorkflowEngine<AppContext, ReviewEvent>(makeConfig())
    const instance = await engine.start('bank-account-application-review', {
      entityId: 'ent-1',
      applicantName: 'Jane',
      // no amount set → guard should fail
    })
    await expect(engine.fire(instance.id, 'submit')).rejects.toBeInstanceOf(
      GuardRejectedError,
    )
    // Instance should still be in its original state
    const again = await engine.get(instance.id)
    expect(again!.currentState).toBe('draft')
    expect(again!.version).toBe(1)
  })

  it('allows a transition when the guard returns allowed: true', async () => {
    const engine = new WorkflowEngine<AppContext, ReviewEvent>(makeConfig())
    const instance = await engine.start('bank-account-application-review', {
      entityId: 'ent-1',
      applicantName: 'Jane',
      amount: 2500,
    })
    const outcome = await engine.fire(instance.id, 'submit')
    expect(outcome.toState).toBe('submitted')
  })

  it('supports async guard functions', async () => {
    const engine = new WorkflowEngine<AppContext, ReviewEvent>(
      makeConfig({
        guards: {
          'application-complete': async () => {
            await new Promise((r) => setTimeout(r, 1))
            return { allowed: true }
          },
        },
      }),
    )
    const instance = await engine.start('bank-account-application-review', {
      entityId: 'ent-1',
      applicantName: 'Jane',
    })
    const outcome = await engine.fire(instance.id, 'submit')
    expect(outcome.toState).toBe('submitted')
  })

  it('exposes the guard reason and code on the thrown error', async () => {
    const engine = new WorkflowEngine<AppContext, ReviewEvent>(makeConfig())
    const instance = await engine.start('bank-account-application-review', {
      entityId: 'ent-1',
      applicantName: 'Jane',
    })
    try {
      await engine.fire(instance.id, 'submit')
      expect.fail('expected GuardRejectedError')
    } catch (err) {
      expect(err).toBeInstanceOf(GuardRejectedError)
      const ge = err as GuardRejectedError
      expect(ge.reason).toMatch(/amount/i)
      expect(ge.guardCode).toBe('AMOUNT_REQUIRED')
    }
  })
})

describe('version history', () => {
  it('returns all versions ordered ascending', async () => {
    const engine = new WorkflowEngine<AppContext, ReviewEvent>(makeConfig())
    const instance = await engine.start('bank-account-application-review', {
      entityId: 'ent-1',
      applicantName: 'Jane',
      amount: 500,
    })
    await engine.fire(instance.id, 'submit')
    await engine.fire(instance.id, 'begin-review')
    await engine.fire(instance.id, 'approve')

    const history = await engine.getHistory(instance.id)
    expect(history.map((v) => v.version)).toEqual([1, 2, 3, 4])
    expect(history.map((v) => v.currentState)).toEqual([
      'draft',
      'submitted',
      'under-review',
      'approved',
    ])
    expect(history[0].cause.type).toBe('start')
    expect(history[1].cause.type).toBe('transition')
    if (history[1].cause.type === 'transition') {
      expect(history[1].cause.transition).toBe('submit')
    }
    expect(history[0].previousVersion).toBeNull()
    expect(history[1].previousVersion).toBe(1)
  })

  it('getVersion returns a specific historical version', async () => {
    const engine = new WorkflowEngine<AppContext, ReviewEvent>(makeConfig())
    const instance = await engine.start('bank-account-application-review', {
      entityId: 'ent-1',
      applicantName: 'Jane',
      amount: 500,
    })
    await engine.fire(instance.id, 'submit')
    const v1 = await engine.getVersion(instance.id, 1)
    expect(v1!.currentState).toBe('draft')
    expect(v1!.version).toBe(1)
  })
})

describe('availableTransitions', () => {
  it('returns transitions fireable from the current state', async () => {
    const engine = new WorkflowEngine<AppContext, ReviewEvent>(makeConfig())
    const instance = await engine.start('bank-account-application-review', {
      entityId: 'ent-1',
      applicantName: 'Jane',
      amount: 500,
    })
    const available = await engine.availableTransitions(instance.id)
    expect(available.map((t) => t.name).sort()).toEqual(['cancel', 'submit'])
  })

  it('returns an empty array for a completed instance', async () => {
    const engine = new WorkflowEngine<AppContext, ReviewEvent>(makeConfig())
    const instance = await engine.start('bank-account-application-review', {
      entityId: 'ent-1',
      applicantName: 'Jane',
      amount: 500,
    })
    await engine.fire(instance.id, 'submit')
    await engine.fire(instance.id, 'reject')
    const available = await engine.availableTransitions(instance.id)
    expect(available).toEqual([])
  })
})

describe('workflow versioning', () => {
  it('picks the highest version when workflowVersion is omitted', async () => {
    const v1 = { ...bankReviewWorkflow }
    const v2 = { ...bankReviewWorkflow, version: '2.0' }
    const engine = new WorkflowEngine<AppContext, ReviewEvent>(
      makeConfig({ workflows: [v1, v2] }),
    )
    const instance = await engine.start('bank-account-application-review', {
      entityId: 'ent-1',
      applicantName: 'Jane',
    })
    expect(instance.workflowVersion).toBe('2.0')
  })

  it('can pin to a specific version at start', async () => {
    const v1 = { ...bankReviewWorkflow }
    const v2 = { ...bankReviewWorkflow, version: '2.0' }
    const engine = new WorkflowEngine<AppContext, ReviewEvent>(
      makeConfig({ workflows: [v1, v2] }),
    )
    const instance = await engine.start(
      'bank-account-application-review',
      { entityId: 'ent-1', applicantName: 'Jane' },
      { workflowVersion: '1.0' },
    )
    expect(instance.workflowVersion).toBe('1.0')
  })
})

describe('delete', () => {
  it('hard deletes instance and all history', async () => {
    const engine = new WorkflowEngine<AppContext, ReviewEvent>(makeConfig())
    const instance = await engine.start('bank-account-application-review', {
      entityId: 'ent-1',
      applicantName: 'Jane',
      amount: 500,
    })
    await engine.fire(instance.id, 'submit')
    await engine.delete(instance.id)
    expect(await engine.get(instance.id)).toBeNull()
    expect(await engine.getHistory(instance.id)).toEqual([])
  })
})
