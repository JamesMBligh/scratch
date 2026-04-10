import { describe, expect, it } from 'vitest'

import { EntityEngine } from '../src/engine'
import { BankApp, makeConfig } from './fixtures'

async function seedEngine() {
  const engine = new EntityEngine<BankApp>(makeConfig())
  const people: BankApp[] = [
    { applicant: { fullName: 'Alice Apple', age: 20 } },
    { applicant: { fullName: 'Bob Banana', age: 35 } },
    { applicant: { fullName: 'Carol Cherry', age: 42 } },
    { applicant: { fullName: 'Dan Durian', age: 28 } },
  ]
  for (const p of people) {
    await engine.create('bank-account-application', '1.0', p)
  }
  return engine
}

describe('query filters', () => {
  it('eq operator', async () => {
    const engine = await seedEngine()
    const results = await engine.find({
      filters: [{ field: 'applicant.fullName', operator: 'eq', value: 'Bob Banana' }],
    })
    expect(results).toHaveLength(1)
    expect(results[0].data.applicant.fullName).toBe('Bob Banana')
  })

  it('neq operator', async () => {
    const engine = await seedEngine()
    const results = await engine.find({
      filters: [
        { field: 'applicant.fullName', operator: 'neq', value: 'Bob Banana' },
      ],
    })
    expect(results).toHaveLength(3)
  })

  it('gt / gte / lt / lte operators', async () => {
    const engine = await seedEngine()
    expect(
      await engine.find({
        filters: [{ field: 'applicant.age', operator: 'gt', value: 30 }],
      }),
    ).toHaveLength(2)
    expect(
      await engine.find({
        filters: [{ field: 'applicant.age', operator: 'gte', value: 35 }],
      }),
    ).toHaveLength(2)
    expect(
      await engine.find({
        filters: [{ field: 'applicant.age', operator: 'lt', value: 30 }],
      }),
    ).toHaveLength(2)
    expect(
      await engine.find({
        filters: [{ field: 'applicant.age', operator: 'lte', value: 20 }],
      }),
    ).toHaveLength(1)
  })

  it('in operator', async () => {
    const engine = await seedEngine()
    const results = await engine.find({
      filters: [
        {
          field: 'applicant.fullName',
          operator: 'in',
          value: ['Alice Apple', 'Carol Cherry'],
        },
      ],
    })
    expect(results).toHaveLength(2)
  })

  it('contains operator (string)', async () => {
    const engine = await seedEngine()
    const results = await engine.find({
      filters: [
        { field: 'applicant.fullName', operator: 'contains', value: 'Apple' },
      ],
    })
    expect(results).toHaveLength(1)
  })
})

describe('query pagination', () => {
  it('respects limit and offset', async () => {
    const engine = await seedEngine()
    const page1 = await engine.find({
      sort: { field: 'applicant.fullName', direction: 'asc' },
      pagination: { limit: 2, offset: 0 },
    })
    expect(page1.map((r) => r.data.applicant.fullName)).toEqual([
      'Alice Apple',
      'Bob Banana',
    ])
    const page2 = await engine.find({
      sort: { field: 'applicant.fullName', direction: 'asc' },
      pagination: { limit: 2, offset: 2 },
    })
    expect(page2.map((r) => r.data.applicant.fullName)).toEqual([
      'Carol Cherry',
      'Dan Durian',
    ])
  })

  it('count is independent of pagination', async () => {
    const engine = await seedEngine()
    const total = await engine.count({})
    expect(total).toBe(4)
  })
})

describe('query sort', () => {
  it('sorts ascending by a nested field', async () => {
    const engine = await seedEngine()
    const results = await engine.find({
      sort: { field: 'applicant.age', direction: 'asc' },
    })
    expect(results.map((r) => r.data.applicant.age)).toEqual([20, 28, 35, 42])
  })

  it('sorts descending by a nested field', async () => {
    const engine = await seedEngine()
    const results = await engine.find({
      sort: { field: 'applicant.age', direction: 'desc' },
    })
    expect(results.map((r) => r.data.applicant.age)).toEqual([42, 35, 28, 20])
  })
})

describe('version retrieval', () => {
  it('getVersion returns a specific historical version', async () => {
    const engine = new EntityEngine<BankApp>(makeConfig())
    const created = await engine.create('bank-account-application', '1.0', {
      applicant: { fullName: 'A' },
    })
    await engine.update(created.id, { applicant: { fullName: 'B' } })
    const v1 = await engine.getVersion(created.id, 1)
    expect(v1).not.toBeNull()
    expect(v1!.data.applicant.fullName).toBe('A')
    expect(v1!.version).toBe(1)
  })
})

describe('delete', () => {
  it('hard deletes an entity and all its versions', async () => {
    const engine = new EntityEngine<BankApp>(makeConfig())
    const created = await engine.create('bank-account-application', '1.0', {
      applicant: { fullName: 'A' },
    })
    await engine.update(created.id, { applicant: { fullName: 'B' } })
    await engine.delete(created.id)
    expect(await engine.get(created.id)).toBeNull()
    expect(await engine.getVersionHistory(created.id)).toEqual([])
  })
})
