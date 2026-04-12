import { describe, expect, it } from 'vitest'
import request from 'supertest'

import { buildTestApp } from '../fixtures'

describe('GET /v1/products', () => {
  it('lists all registered products', async () => {
    const { app } = buildTestApp()
    const res = await request(app).get('/v1/products')
    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(2)
    const ids = res.body.items.map((p: { id: string }) => p.id).sort()
    expect(ids).toEqual(['personal-loan', 'transaction-account'])
  })

  it('serialises products without the guard functions', async () => {
    const { app } = buildTestApp()
    const res = await request(app).get('/v1/products')
    const product = res.body.items[0]
    expect(product.guards).toBeUndefined()
    expect(product.schema).toBeDefined()
    expect(product.workflow.states).toBeInstanceOf(Array)
    expect(product.workflow.transitions).toBeInstanceOf(Array)
    expect(product.assessments).toBeInstanceOf(Array)
  })
})

describe('GET /v1/products/:productId', () => {
  it('returns transaction-account details', async () => {
    const { app } = buildTestApp()
    const res = await request(app).get('/v1/products/transaction-account')
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('transaction-account')
    expect(res.body.workflow.initialState).toBe('draft')
    expect(res.body.workflow.finalStates).toEqual([
      'activated',
      'cancelled',
      'rejected',
    ])
  })

  it('returns personal-loan details', async () => {
    const { app } = buildTestApp()
    const res = await request(app).get('/v1/products/personal-loan')
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('personal-loan')
    expect(res.body.workflow.finalStates).toEqual([
      'funded',
      'cancelled',
      'declined',
    ])
  })

  it('returns 404 for an unknown product', async () => {
    const { app } = buildTestApp()
    const res = await request(app).get('/v1/products/not-a-product')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('UNKNOWN_PRODUCT')
  })
})
