import { describe, expect, it } from 'vitest'
import request from 'supertest'

import { buildTestApp } from '../fixtures'

const baseApplicant = {
  fullName: 'Dan Durian',
  dateOfBirth: '1985-03-10',
  email: 'dan@example.com',
  employmentStatus: 'employed',
  annualIncome: 120000,
}

const baseLoan = {
  amount: 20000,
  termMonths: 36,
  purpose: 'debt_consolidation',
}

const baseIdentity = {
  documentType: 'drivers_licence',
  documentNumber: 'DL-9988',
}

describe('personal-loan — full journey', () => {
  it('walks a loan from draft to funded, demonstrating guard rejection on a bad credit score', async () => {
    const { app } = buildTestApp()

    // ── 1. Create with only applicant details — submit is blocked ──
    const created = await request(app).post('/v1/applications').send({
      productId: 'personal-loan',
      data: {
        applicant: baseApplicant,
        loan: baseLoan, // loan is required by schema; we can't create without it
      },
    })
    expect(created.status).toBe(201)
    const id = created.body.id as string
    expect(created.body.state).toBe('draft')

    // The application is complete for submit already (the composite guard
    // checks applicant-details + loan-details), so submit should pass.
    const submitted = await request(app)
      .post(`/v1/applications/${id}/transitions`)
      .send({ name: 'submit' })
    expect(submitted.status).toBe(200)
    expect(submitted.body.application.state).toBe('submitted')

    // ── 2. verify-identity is blocked until identity fields exist ──
    const noIdentity = await request(app)
      .post(`/v1/applications/${id}/transitions`)
      .send({ name: 'verify-identity' })
    expect(noIdentity.status).toBe(422)
    expect(noIdentity.body.error.guardCode).toBe('IDENTITY_INCOMPLETE')

    await request(app).put(`/v1/applications/${id}`).send({
      data: {
        applicant: baseApplicant,
        loan: baseLoan,
        identity: baseIdentity,
      },
    })
    const verified = await request(app)
      .post(`/v1/applications/${id}/transitions`)
      .send({ name: 'verify-identity' })
    expect(verified.status).toBe(200)
    expect(verified.body.application.state).toBe('identity-verification')

    // ── 3. run-credit-check has no guard ───────────────────────────
    const creditState = await request(app)
      .post(`/v1/applications/${id}/transitions`)
      .send({ name: 'run-credit-check' })
    expect(creditState.status).toBe(200)
    expect(creditState.body.application.state).toBe('credit-check')

    // ── 4. Record a FAILING credit score ────────────────────────────
    await request(app).put(`/v1/applications/${id}`).send({
      data: {
        applicant: baseApplicant,
        loan: baseLoan,
        identity: baseIdentity,
        creditCheck: { score: 540, checkedAt: '2026-04-12T10:00:00Z' },
      },
    })
    const badCredit = await request(app)
      .post(`/v1/applications/${id}/transitions`)
      .send({ name: 'begin-underwriting' })
    expect(badCredit.status).toBe(422)
    expect(badCredit.body.error.guardCode).toBe('CREDIT_UNACCEPTABLE')

    // ── 5. Update to a passing credit score ─────────────────────────
    await request(app).put(`/v1/applications/${id}`).send({
      data: {
        applicant: baseApplicant,
        loan: baseLoan,
        identity: baseIdentity,
        creditCheck: { score: 720, checkedAt: '2026-04-12T10:05:00Z' },
      },
    })
    const underwriting = await request(app)
      .post(`/v1/applications/${id}/transitions`)
      .send({ name: 'begin-underwriting' })
    expect(underwriting.status).toBe(200)
    expect(underwriting.body.application.state).toBe('underwriting')

    // ── 6. Approve (runs loan-affordable guard) ─────────────────────
    const approved = await request(app)
      .post(`/v1/applications/${id}/transitions`)
      .send({ name: 'approve' })
    expect(approved.status).toBe(200)
    expect(approved.body.application.state).toBe('approved')

    // ── 7. Fund ─────────────────────────────────────────────────────
    const funded = await request(app)
      .post(`/v1/applications/${id}/transitions`)
      .send({ name: 'fund' })
    expect(funded.status).toBe(200)
    expect(funded.body.application.state).toBe('funded')
    expect(funded.body.application.status).toBe('completed')
  })

  it('rejects approval when affordability fails', async () => {
    const { app } = buildTestApp()
    const created = await request(app).post('/v1/applications').send({
      productId: 'personal-loan',
      data: {
        applicant: { ...baseApplicant, annualIncome: 18000 }, // low income
        loan: { amount: 50000, termMonths: 12, purpose: 'vehicle' }, // large loan
        identity: baseIdentity,
      },
    })
    const id = created.body.id
    await request(app).post(`/v1/applications/${id}/transitions`).send({ name: 'submit' })
    await request(app).post(`/v1/applications/${id}/transitions`).send({ name: 'verify-identity' })
    await request(app).post(`/v1/applications/${id}/transitions`).send({ name: 'run-credit-check' })
    await request(app).put(`/v1/applications/${id}`).send({
      data: {
        applicant: { ...baseApplicant, annualIncome: 18000 },
        loan: { amount: 50000, termMonths: 12, purpose: 'vehicle' },
        identity: baseIdentity,
        creditCheck: { score: 720 },
      },
    })
    await request(app).post(`/v1/applications/${id}/transitions`).send({ name: 'begin-underwriting' })
    const res = await request(app)
      .post(`/v1/applications/${id}/transitions`)
      .send({ name: 'approve' })
    expect(res.status).toBe(422)
    expect(res.body.error.guardCode).toBe('LOAN_UNAFFORDABLE')
  })
})
