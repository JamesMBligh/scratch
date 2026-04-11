import { describe, expect, it } from 'vitest'

import { WorkflowEngine } from '../src/engine'
import { AppContext, ReviewEvent, makeConfig } from './fixtures'

async function seedEngine() {
  const engine = new WorkflowEngine<AppContext, ReviewEvent>(makeConfig())
  // Start five instances with a variety of contexts and states
  const ids: string[] = []
  for (const ctx of [
    { entityId: 'e1', applicantName: 'Alice', amount: 100 },
    { entityId: 'e2', applicantName: 'Bob', amount: 500 },
    { entityId: 'e3', applicantName: 'Carol', amount: 900 },
    { entityId: 'e4', applicantName: 'Dan', amount: 250 },
    { entityId: 'e5', applicantName: 'Eve', amount: 750 },
  ]) {
    const inst = await engine.start('bank-account-application-review', ctx)
    ids.push(inst.id)
  }
  // Advance some into different states
  await engine.fire(ids[1], 'submit')
  await engine.fire(ids[2], 'submit')
  await engine.fire(ids[2], 'begin-review')
  await engine.fire(ids[3], 'cancel')
  return { engine, ids }
}

describe('query filters', () => {
  it('filters by workflowName', async () => {
    const { engine } = await seedEngine()
    const results = await engine.find({
      workflowName: 'bank-account-application-review',
    })
    expect(results).toHaveLength(5)
  })

  it('filters by currentState', async () => {
    const { engine } = await seedEngine()
    const results = await engine.find({ currentState: 'draft' })
    expect(results.map((r) => r.context.applicantName).sort()).toEqual([
      'Alice',
      'Eve',
    ])
  })

  it('filters by status', async () => {
    const { engine } = await seedEngine()
    const active = await engine.find({ status: 'active' })
    const completed = await engine.find({ status: 'completed' })
    expect(active).toHaveLength(4)
    expect(completed).toHaveLength(1)
    expect(completed[0].context.applicantName).toBe('Dan')
  })

  it('filters by context fields with eq / gt', async () => {
    const { engine } = await seedEngine()
    const eqResult = await engine.find({
      contextFilters: [
        { field: 'applicantName', operator: 'eq', value: 'Bob' },
      ],
    })
    expect(eqResult).toHaveLength(1)

    const gtResult = await engine.find({
      contextFilters: [{ field: 'amount', operator: 'gt', value: 400 }],
    })
    expect(gtResult.map((r) => r.context.applicantName).sort()).toEqual([
      'Bob',
      'Carol',
      'Eve',
    ])
  })

  it('filters by context with in operator', async () => {
    const { engine } = await seedEngine()
    const results = await engine.find({
      contextFilters: [
        {
          field: 'applicantName',
          operator: 'in',
          value: ['Alice', 'Eve'],
        },
      ],
    })
    expect(results).toHaveLength(2)
  })

  it('filters by context with contains operator', async () => {
    const { engine } = await seedEngine()
    const results = await engine.find({
      contextFilters: [
        { field: 'applicantName', operator: 'contains', value: 'li' },
      ],
    })
    expect(results.map((r) => r.context.applicantName)).toEqual(['Alice'])
  })
})

describe('query pagination and sort', () => {
  it('respects limit and offset', async () => {
    const { engine } = await seedEngine()
    const page1 = await engine.find({
      sort: { field: 'applicantName', direction: 'asc' },
      pagination: { limit: 2, offset: 0 },
    })
    expect(page1.map((r) => r.context.applicantName)).toEqual(['Alice', 'Bob'])
    const page2 = await engine.find({
      sort: { field: 'applicantName', direction: 'asc' },
      pagination: { limit: 2, offset: 2 },
    })
    expect(page2.map((r) => r.context.applicantName)).toEqual(['Carol', 'Dan'])
  })

  it('count is independent of pagination', async () => {
    const { engine } = await seedEngine()
    expect(await engine.count({})).toBe(5)
  })

  it('sorts descending by a context field', async () => {
    const { engine } = await seedEngine()
    const results = await engine.find({
      sort: { field: 'amount', direction: 'desc' },
    })
    expect(results.map((r) => r.context.amount)).toEqual([
      900, 750, 500, 250, 100,
    ])
  })
})

describe('combined filters', () => {
  it('combines status and context filter', async () => {
    const { engine } = await seedEngine()
    const results = await engine.find({
      status: 'active',
      contextFilters: [{ field: 'amount', operator: 'gte', value: 500 }],
    })
    expect(results.map((r) => r.context.applicantName).sort()).toEqual([
      'Bob',
      'Carol',
      'Eve',
    ])
  })
})
