import { describe, expect, it } from 'vitest'
import request from 'supertest'

import { buildTestApp, completeTransactionAccount } from '../fixtures'

describe('GET /v1/applications/:id/history', () => {
  it('returns a merged time-ordered audit of entity and workflow events', async () => {
    const { app } = buildTestApp()
    const created = await request(app).post('/v1/applications').send({
      productId: 'transaction-account',
      data: { applicant: { fullName: 'Jane' } },
    })
    const id = created.body.id

    // Touch the application: update, then transition, then update, then transition
    await new Promise((r) => setTimeout(r, 2))
    await request(app)
      .put(`/v1/applications/${id}`)
      .send({ data: completeTransactionAccount })
    await new Promise((r) => setTimeout(r, 2))
    await request(app).post(`/v1/applications/${id}/transitions`).send({
      name: 'submit',
    })
    await new Promise((r) => setTimeout(r, 2))
    await request(app)
      .put(`/v1/applications/${id}`)
      .send({
        data: {
          ...completeTransactionAccount,
          accountPreferences: { accountName: 'Everyday' },
        },
      })
    await new Promise((r) => setTimeout(r, 2))
    await request(app).post(`/v1/applications/${id}/transitions`).send({
      name: 'verify-identity',
    })

    const res = await request(app).get(`/v1/applications/${id}/history`)
    expect(res.status).toBe(200)

    const events = res.body.items as Array<{
      kind: string
      at: string
      entityVersion?: number
      workflowVersion?: number
      state?: string
    }>

    // Exact counts: 3 entity versions (create, update, update) + 3 workflow
    // versions (start, submit, verify-identity)
    const entityEvents = events.filter((e) => e.kind === 'data-version')
    const workflowEvents = events.filter((e) => e.kind === 'workflow-version')
    expect(entityEvents).toHaveLength(3)
    expect(workflowEvents).toHaveLength(3)
    expect(entityEvents.map((e) => e.entityVersion)).toEqual([1, 2, 3])
    expect(workflowEvents.map((e) => e.workflowVersion)).toEqual([1, 2, 3])

    // Order is monotonic by timestamp
    for (let i = 1; i < events.length; i++) {
      expect(new Date(events[i].at).getTime()).toBeGreaterThanOrEqual(
        new Date(events[i - 1].at).getTime(),
      )
    }

    // First workflow event is a start; subsequent ones are transitions
    expect(workflowEvents[0]).toMatchObject({ state: 'draft' })
    const secondCause = (workflowEvents[1] as unknown as { cause: { type: string; transition: string } }).cause
    expect(secondCause.type).toBe('transition')
    expect(secondCause.transition).toBe('submit')
  })

  it('returns 404 for a missing application', async () => {
    const { app } = buildTestApp()
    const res = await request(app).get('/v1/applications/ghost/history')
    expect(res.status).toBe(404)
  })
})
