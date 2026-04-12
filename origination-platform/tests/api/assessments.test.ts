import { describe, expect, it } from 'vitest'
import request from 'supertest'

import {
  buildTestApp,
  completeTransactionAccount,
} from '../fixtures'

describe('POST /v1/applications/:id/assessments/:name/run', () => {
  it('runs a named assessment and returns the result', async () => {
    const { app } = buildTestApp()
    const created = await request(app).post('/v1/applications').send({
      productId: 'transaction-account',
      data: completeTransactionAccount,
    })
    const res = await request(app)
      .post(`/v1/applications/${created.body.id}/assessments/contact-details-sufficient/run`)
      .send()
    expect(res.status).toBe(200)
    expect(res.body.passed).toBe(true)
    expect(res.body.score).toBe(100)
    expect(res.body.findings).toEqual([])
  })

  it('reports failing findings', async () => {
    const { app } = buildTestApp()
    const created = await request(app).post('/v1/applications').send({
      productId: 'transaction-account',
      data: { applicant: { fullName: 'Jane' } },
    })
    const res = await request(app)
      .post(`/v1/applications/${created.body.id}/assessments/contact-details-sufficient/run`)
      .send()
    expect(res.status).toBe(200)
    expect(res.body.passed).toBe(false)
    expect(res.body.findings.length).toBeGreaterThan(0)
  })

  it('returns 409 when an assessment precondition has not been met', async () => {
    const { app } = buildTestApp()
    const created = await request(app).post('/v1/applications').send({
      productId: 'transaction-account',
      data: { applicant: { fullName: 'Jane' } },
    })
    // identity-sufficient has precondition contact-details-sufficient
    const res = await request(app)
      .post(`/v1/applications/${created.body.id}/assessments/identity-sufficient/run`)
      .send()
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('PRECONDITION_NOT_MET')
  })

  it('returns 404 for an unknown assessment name', async () => {
    const { app } = buildTestApp()
    const created = await request(app).post('/v1/applications').send({
      productId: 'transaction-account',
      data: completeTransactionAccount,
    })
    const res = await request(app)
      .post(`/v1/applications/${created.body.id}/assessments/not-a-real-assessment/run`)
      .send()
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('ASSESSMENT_NOT_FOUND')
  })
})

describe('GET /v1/applications/:id/assessments/:name/latest', () => {
  it('returns the latest stored run after one is recorded', async () => {
    const { app } = buildTestApp()
    const created = await request(app).post('/v1/applications').send({
      productId: 'transaction-account',
      data: completeTransactionAccount,
    })
    await request(app)
      .post(`/v1/applications/${created.body.id}/assessments/contact-details-sufficient/run`)
      .send()

    const res = await request(app).get(
      `/v1/applications/${created.body.id}/assessments/contact-details-sufficient/latest`,
    )
    expect(res.status).toBe(200)
    expect(res.body.passed).toBe(true)
  })

  it('returns 404 when nothing has been run yet', async () => {
    const { app } = buildTestApp()
    const created = await request(app).post('/v1/applications').send({
      productId: 'transaction-account',
      data: completeTransactionAccount,
    })
    const res = await request(app).get(
      `/v1/applications/${created.body.id}/assessments/contact-details-sufficient/latest`,
    )
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NO_ASSESSMENT_RUNS')
  })
})

describe('GET /v1/applications/:id/assessments', () => {
  it('returns the full list of runs, newest first', async () => {
    const { app } = buildTestApp()
    const created = await request(app).post('/v1/applications').send({
      productId: 'transaction-account',
      data: completeTransactionAccount,
    })
    await request(app)
      .post(`/v1/applications/${created.body.id}/assessments/contact-details-sufficient/run`)
      .send()
    await request(app)
      .post(`/v1/applications/${created.body.id}/assessments/identity-sufficient/run`)
      .send()

    const res = await request(app).get(
      `/v1/applications/${created.body.id}/assessments`,
    )
    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(2)
  })
})
