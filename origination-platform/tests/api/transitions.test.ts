import { describe, expect, it } from 'vitest'
import request from 'supertest'

import {
  buildTestApp,
  completeTransactionAccount,
} from '../fixtures'

async function createDraftWithCompleteData(app: ReturnType<typeof buildTestApp>['app']) {
  const res = await request(app).post('/v1/applications').send({
    productId: 'transaction-account',
    data: completeTransactionAccount,
  })
  return res.body.id as string
}

describe('POST /v1/applications/:id/transitions', () => {
  it('advances state and returns the new application view', async () => {
    const { app } = buildTestApp()
    const id = await createDraftWithCompleteData(app)
    const res = await request(app)
      .post(`/v1/applications/${id}/transitions`)
      .send({ name: 'submit' })
    expect(res.status).toBe(200)
    expect(res.body.fromState).toBe('draft')
    expect(res.body.toState).toBe('submitted')
    expect(res.body.transition).toBe('submit')
    expect(res.body.application.state).toBe('submitted')
    expect(res.body.application.workflowVersion).toBe(2)
  })

  it('returns 422 when a guard rejects the transition', async () => {
    const { app } = buildTestApp()
    const created = await request(app).post('/v1/applications').send({
      productId: 'transaction-account',
      data: { applicant: { fullName: 'Incomplete' } },
    })
    const res = await request(app)
      .post(`/v1/applications/${created.body.id}/transitions`)
      .send({ name: 'submit' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('GUARD_REJECTED')
    expect(res.body.error.guardCode).toBe('CONTACT_INCOMPLETE')
    expect(res.body.error.transition).toBe('submit')
  })

  it('returns 409 when a transition is not available from the current state', async () => {
    const { app } = buildTestApp()
    const id = await createDraftWithCompleteData(app)
    // `approve` is only fireable from identity-verification
    const res = await request(app)
      .post(`/v1/applications/${id}/transitions`)
      .send({ name: 'approve' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('INVALID_TRANSITION')
  })

  it('returns 409 when the application is already completed', async () => {
    const { app } = buildTestApp()
    const id = await createDraftWithCompleteData(app)
    await request(app)
      .post(`/v1/applications/${id}/transitions`)
      .send({ name: 'submit' })
    await request(app)
      .post(`/v1/applications/${id}/transitions`)
      .send({ name: 'reject' })

    const res = await request(app)
      .post(`/v1/applications/${id}/transitions`)
      .send({ name: 'approve' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('TERMINAL_STATE')
  })

  it('returns 400 when name is missing from the body', async () => {
    const { app } = buildTestApp()
    const id = await createDraftWithCompleteData(app)
    const res = await request(app)
      .post(`/v1/applications/${id}/transitions`)
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('BAD_REQUEST')
  })

  it('returns 404 for a missing application', async () => {
    const { app } = buildTestApp()
    const res = await request(app)
      .post('/v1/applications/ghost/transitions')
      .send({ name: 'submit' })
    expect(res.status).toBe(404)
  })
})

describe('GET /v1/applications/:id/available-transitions', () => {
  it('lists transitions fireable from the current state', async () => {
    const { app } = buildTestApp()
    const id = await createDraftWithCompleteData(app)
    const res = await request(app).get(
      `/v1/applications/${id}/available-transitions`,
    )
    expect(res.status).toBe(200)
    const names = res.body.items.map((t: { name: string }) => t.name).sort()
    expect(names).toEqual(['cancel', 'submit'])
  })

  it('returns an empty list for a completed application', async () => {
    const { app } = buildTestApp()
    const id = await createDraftWithCompleteData(app)
    await request(app).post(`/v1/applications/${id}/transitions`).send({
      name: 'submit',
    })
    await request(app).post(`/v1/applications/${id}/transitions`).send({
      name: 'reject',
    })
    const res = await request(app).get(
      `/v1/applications/${id}/available-transitions`,
    )
    expect(res.status).toBe(200)
    expect(res.body.items).toEqual([])
  })

  it('strips the product prefix from guard names in the response', async () => {
    const { app } = buildTestApp()
    const id = await createDraftWithCompleteData(app)
    const res = await request(app).get(
      `/v1/applications/${id}/available-transitions`,
    )
    const submitT = res.body.items.find((t: { name: string }) => t.name === 'submit')
    expect(submitT.guard).toBe('contact-details-complete')
  })
})
