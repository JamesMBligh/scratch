import { describe, expect, it } from 'vitest'
import request from 'supertest'

import {
  buildTestApp,
  completePersonalLoan,
  completeTransactionAccount,
} from '../fixtures'

describe('POST /v1/applications', () => {
  it('creates a transaction-account application at version 1', async () => {
    const { app } = buildTestApp()
    const res = await request(app)
      .post('/v1/applications')
      .send({
        productId: 'transaction-account',
        data: { applicant: { fullName: 'Jane' } },
      })
    expect(res.status).toBe(201)
    expect(res.body.productId).toBe('transaction-account')
    expect(res.body.state).toBe('draft')
    expect(res.body.status).toBe('active')
    expect(res.body.entityVersion).toBe(1)
    expect(res.body.workflowVersion).toBe(1)
    expect(res.body.data.applicant.fullName).toBe('Jane')
    expect(typeof res.body.id).toBe('string')
  })

  it('rejects an invalid payload (schema validation)', async () => {
    const { app } = buildTestApp()
    const res = await request(app)
      .post('/v1/applications')
      .send({
        productId: 'transaction-account',
        data: {
          // missing required applicant
        },
      })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('ENTITY_VALIDATION_FAILED')
    expect(res.body.error.validationErrors).toBeDefined()
  })

  it('rejects an unknown product', async () => {
    const { app } = buildTestApp()
    const res = await request(app)
      .post('/v1/applications')
      .send({ productId: 'nope', data: {} })
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('UNKNOWN_PRODUCT')
  })

  it('rejects a request with no productId', async () => {
    const { app } = buildTestApp()
    const res = await request(app)
      .post('/v1/applications')
      .send({ data: { applicant: { fullName: 'Jane' } } })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('BAD_REQUEST')
  })
})

describe('GET /v1/applications/:id', () => {
  it('returns the merged application view', async () => {
    const { app } = buildTestApp()
    const created = await request(app).post('/v1/applications').send({
      productId: 'transaction-account',
      data: completeTransactionAccount,
    })
    const res = await request(app).get(`/v1/applications/${created.body.id}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(created.body.id)
    expect(res.body.state).toBe('draft')
    expect(res.body.data.applicant.fullName).toBe('Jane Smith')
  })

  it('returns 404 for an unknown id', async () => {
    const { app } = buildTestApp()
    const res = await request(app).get('/v1/applications/unknown-id')
    expect(res.status).toBe(404)
  })
})

describe('PUT /v1/applications/:id', () => {
  it('updates the entity data, leaving the workflow untouched', async () => {
    const { app } = buildTestApp()
    const created = await request(app)
      .post('/v1/applications')
      .send({
        productId: 'transaction-account',
        data: { applicant: { fullName: 'Jane' } },
      })

    const updated = await request(app)
      .put(`/v1/applications/${created.body.id}`)
      .send({
        data: completeTransactionAccount,
      })
    expect(updated.status).toBe(200)
    expect(updated.body.entityVersion).toBe(2)
    expect(updated.body.workflowVersion).toBe(1)
    expect(updated.body.state).toBe('draft')
    expect(updated.body.data.applicant.email).toBe('jane@example.com')
  })

  it('returns 404 when updating a missing application', async () => {
    const { app } = buildTestApp()
    const res = await request(app).put('/v1/applications/ghost').send({
      data: { applicant: { fullName: 'Ghost' } },
    })
    expect(res.status).toBe(404)
  })

  it('returns 400 when the update body fails schema validation', async () => {
    const { app } = buildTestApp()
    const created = await request(app).post('/v1/applications').send({
      productId: 'transaction-account',
      data: { applicant: { fullName: 'Jane' } },
    })
    const res = await request(app)
      .put(`/v1/applications/${created.body.id}`)
      .send({ data: { applicant: {} } }) // missing required fullName
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('ENTITY_VALIDATION_FAILED')
  })
})

describe('DELETE /v1/applications/:id', () => {
  it('hard-deletes the application', async () => {
    const { app } = buildTestApp()
    const created = await request(app).post('/v1/applications').send({
      productId: 'transaction-account',
      data: completeTransactionAccount,
    })
    const del = await request(app).delete(`/v1/applications/${created.body.id}`)
    expect(del.status).toBe(204)
    const after = await request(app).get(`/v1/applications/${created.body.id}`)
    expect(after.status).toBe(404)
  })
})

describe('GET /v1/applications (listing)', () => {
  it('returns applications filtered by productId', async () => {
    const { app } = buildTestApp()
    await request(app).post('/v1/applications').send({
      productId: 'transaction-account',
      data: completeTransactionAccount,
    })
    await request(app).post('/v1/applications').send({
      productId: 'personal-loan',
      data: completePersonalLoan,
    })

    const res = await request(app).get('/v1/applications?productId=personal-loan')
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(1)
    expect(res.body.items[0].productId).toBe('personal-loan')
  })

  it('returns the total count independent of pagination', async () => {
    const { app } = buildTestApp()
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/v1/applications')
        .send({
          productId: 'transaction-account',
          data: {
            applicant: {
              fullName: `Person ${i}`,
              dateOfBirth: '1990-01-01',
              email: `p${i}@example.com`,
            },
          },
        })
    }
    const res = await request(app).get('/v1/applications?limit=2&offset=0')
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(3)
    expect(res.body.items).toHaveLength(2)
  })
})
