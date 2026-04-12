import { describe, expect, it } from 'vitest'
import request from 'supertest'

import { buildTestApp } from '../fixtures'

describe('transaction-account — full journey', () => {
  it('walks an application from draft to activated with blocked paths along the way', async () => {
    const { app } = buildTestApp()

    // ── 1. Create with only a name: fails to submit ─────────────
    const created = await request(app).post('/v1/applications').send({
      productId: 'transaction-account',
      data: { applicant: { fullName: 'Jane Smith' } },
    })
    expect(created.status).toBe(201)
    const id = created.body.id as string
    expect(created.body.state).toBe('draft')

    const tooEarly = await request(app)
      .post(`/v1/applications/${id}/transitions`)
      .send({ name: 'submit' })
    expect(tooEarly.status).toBe(422)
    expect(tooEarly.body.error.guardCode).toBe('CONTACT_INCOMPLETE')

    // ── 2. Fill in contact details, submit ──────────────────────
    await request(app)
      .put(`/v1/applications/${id}`)
      .send({
        data: {
          applicant: {
            fullName: 'Jane Smith',
            dateOfBirth: '1990-06-15',
            email: 'jane@example.com',
          },
        },
      })

    const submitted = await request(app)
      .post(`/v1/applications/${id}/transitions`)
      .send({ name: 'submit' })
    expect(submitted.status).toBe(200)
    expect(submitted.body.application.state).toBe('submitted')

    // verify-identity is blocked because identity fields are missing
    const noIdentity = await request(app)
      .post(`/v1/applications/${id}/transitions`)
      .send({ name: 'verify-identity' })
    expect(noIdentity.status).toBe(422)
    expect(noIdentity.body.error.guardCode).toBe('IDENTITY_INCOMPLETE')

    // ── 3. Add identity docs, verify ────────────────────────────
    await request(app)
      .put(`/v1/applications/${id}`)
      .send({
        data: {
          applicant: {
            fullName: 'Jane Smith',
            dateOfBirth: '1990-06-15',
            email: 'jane@example.com',
          },
          identity: {
            documentType: 'passport',
            documentNumber: 'P1234567',
            tfn: '123456789',
          },
        },
      })

    const verified = await request(app)
      .post(`/v1/applications/${id}/transitions`)
      .send({ name: 'verify-identity' })
    expect(verified.status).toBe(200)
    expect(verified.body.application.state).toBe('identity-verification')

    // ── 4. Approve, then activate ───────────────────────────────
    const approved = await request(app)
      .post(`/v1/applications/${id}/transitions`)
      .send({ name: 'approve', actor: 'reviewer-1' })
    expect(approved.status).toBe(200)
    expect(approved.body.application.state).toBe('approved')

    const activated = await request(app)
      .post(`/v1/applications/${id}/transitions`)
      .send({ name: 'activate', actor: 'back-office' })
    expect(activated.status).toBe(200)
    expect(activated.body.application.state).toBe('activated')
    expect(activated.body.application.status).toBe('completed')

    // ── 5. Any further transition is rejected as terminal ──────
    const afterTerminal = await request(app)
      .post(`/v1/applications/${id}/transitions`)
      .send({ name: 'cancel' })
    expect(afterTerminal.status).toBe(409)
    expect(afterTerminal.body.error.code).toBe('TERMINAL_STATE')

    // ── 6. History has all expected versions ────────────────────
    const history = await request(app).get(`/v1/applications/${id}/history`)
    expect(history.status).toBe(200)
    const kinds = history.body.items.map(
      (e: { kind: string }) => e.kind,
    ) as string[]
    // 3 entity versions (create, update, update) + 5 workflow versions
    // (start, submit, verify-identity, approve, activate)
    expect(kinds.filter((k) => k === 'data-version')).toHaveLength(3)
    expect(kinds.filter((k) => k === 'workflow-version')).toHaveLength(5)
  })
})
