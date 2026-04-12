import { buildApplicationService } from '../src/index'
import { createServer } from '../src/api/server'

/**
 * Build a fresh Express app with a freshly-constructed ApplicationService
 * backed by brand-new in-memory engines. Every test gets its own
 * isolated universe.
 */
export function buildTestApp() {
  const service = buildApplicationService()
  const app = createServer(service)
  return { app, service }
}

// ── Fixture data the tests share ──────────────────────────────────────

export const completeTransactionAccount = {
  applicant: {
    fullName: 'Jane Smith',
    dateOfBirth: '1990-06-15',
    email: 'jane@example.com',
    phone: '+61400000000',
  },
  identity: {
    documentType: 'passport',
    documentNumber: 'P1234567',
    tfn: '123456789',
  },
}

export const completePersonalLoan = {
  applicant: {
    fullName: 'Dan Durian',
    dateOfBirth: '1985-03-10',
    email: 'dan@example.com',
    employmentStatus: 'employed',
    annualIncome: 120000,
  },
  identity: {
    documentType: 'drivers_licence',
    documentNumber: 'DL-9988',
  },
  loan: {
    amount: 20000,
    termMonths: 36,
    purpose: 'debt_consolidation',
  },
}
