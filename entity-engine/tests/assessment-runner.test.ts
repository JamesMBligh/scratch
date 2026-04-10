import { describe, expect, it } from 'vitest'

import { EntityEngine } from '../src/engine'
import type { Finding } from '../src/types/assessment'
import { BankApp, bankSchema, makeConfig } from './fixtures'

async function runWithRules(
  rules: Parameters<typeof makeConfig>[0] extends infer _ ? any : never,
  data: BankApp,
  functions: Record<string, (e: unknown) => Finding[] | Promise<Finding[]>> = {},
) {
  const engine = new EntityEngine<BankApp>(
    makeConfig({
      assessments: [
        {
          name: 'ad-hoc',
          version: '1.0',
          schemaId: 'bank-account-application',
          rules,
        },
      ],
      functions: functions as any,
    }),
  )
  const created = await engine.create('bank-account-application', '1.0', data)
  return engine.assess(created.id, 'ad-hoc')
}

describe('built-in rules: required', () => {
  it('produces a finding when the field is missing', async () => {
    const result = await runWithRules(
      [{ type: 'required', field: 'applicant.email' }],
      { applicant: { fullName: 'Jane' } },
    )
    expect(result.passed).toBe(false)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].code).toBe('FIELD_REQUIRED')
    expect(result.findings[0].field).toBe('applicant.email')
  })

  it('produces no finding when the field is present', async () => {
    const result = await runWithRules(
      [{ type: 'required', field: 'applicant.fullName' }],
      { applicant: { fullName: 'Jane' } },
    )
    expect(result.passed).toBe(true)
    expect(result.findings).toHaveLength(0)
  })
})

describe('built-in rules: regex', () => {
  it('fails when the value does not match the pattern', async () => {
    const result = await runWithRules(
      [
        {
          type: 'regex',
          field: 'applicant.email',
          pattern: '^[^@]+@[^@]+$',
        },
      ],
      { applicant: { fullName: 'J', email: 'not-an-email' } },
    )
    expect(result.passed).toBe(false)
    expect(result.findings[0].code).toBe('FIELD_PATTERN_MISMATCH')
  })

  it('passes when the value matches the pattern', async () => {
    const result = await runWithRules(
      [
        {
          type: 'regex',
          field: 'applicant.email',
          pattern: '^[^@]+@[^@]+$',
        },
      ],
      { applicant: { fullName: 'J', email: 'jane@example.com' } },
    )
    expect(result.passed).toBe(true)
  })
})

describe('built-in rules: range', () => {
  it('fails when value is below min', async () => {
    const result = await runWithRules(
      [{ type: 'range', field: 'applicant.age', min: 18, max: 120 }],
      { applicant: { fullName: 'J', age: 10 } },
    )
    expect(result.passed).toBe(false)
    expect(result.findings[0].code).toBe('FIELD_OUT_OF_RANGE')
  })

  it('passes when value is within range', async () => {
    const result = await runWithRules(
      [{ type: 'range', field: 'applicant.age', min: 18, max: 120 }],
      { applicant: { fullName: 'J', age: 30 } },
    )
    expect(result.passed).toBe(true)
  })
})

describe('built-in rules: minLength', () => {
  it('fails when string is too short', async () => {
    const result = await runWithRules(
      [{ type: 'minLength', field: 'applicant.fullName', min: 5 }],
      { applicant: { fullName: 'Jo' } },
    )
    expect(result.findings[0].code).toBe('FIELD_TOO_SHORT')
  })

  it('passes when array meets minLength', async () => {
    const result = await runWithRules(
      [{ type: 'minLength', field: 'tags', min: 2 }],
      { applicant: { fullName: 'J' }, tags: ['a', 'b', 'c'] },
    )
    expect(result.passed).toBe(true)
  })
})

describe('built-in rules: maxLength', () => {
  it('fails when string exceeds max length', async () => {
    const result = await runWithRules(
      [{ type: 'maxLength', field: 'applicant.fullName', max: 3 }],
      { applicant: { fullName: 'Jonathan' } },
    )
    expect(result.findings[0].code).toBe('FIELD_TOO_LONG')
  })
})

describe('built-in rules: enum', () => {
  it('fails when value is not in the allowed list', async () => {
    const result = await runWithRules(
      [
        {
          type: 'enum',
          field: 'identity.documentType',
          values: ['passport', 'drivers_licence'],
        },
      ],
      {
        applicant: { fullName: 'J' },
        identity: { documentType: 'id_card' },
      },
    )
    expect(result.findings[0].code).toBe('FIELD_NOT_IN_ENUM')
  })

  it('passes when value is in the allowed list', async () => {
    const result = await runWithRules(
      [
        {
          type: 'enum',
          field: 'identity.documentType',
          values: ['passport', 'drivers_licence'],
        },
      ],
      {
        applicant: { fullName: 'J' },
        identity: { documentType: 'passport' },
      },
    )
    expect(result.passed).toBe(true)
  })
})

describe('fn rules', () => {
  it('invokes consumer function and includes its findings', async () => {
    const result = await runWithRules(
      [{ type: 'fn', fn: 'custom-check' }],
      { applicant: { fullName: 'Jane' } },
      {
        'custom-check': () => [
          {
            field: 'applicant.fullName',
            code: 'CUSTOM_CODE',
            message: 'nope',
            severity: 'error',
          },
        ],
      },
    )
    expect(result.passed).toBe(false)
    expect(result.findings[0].code).toBe('CUSTOM_CODE')
  })

  it('awaits async consumer functions', async () => {
    const result = await runWithRules(
      [{ type: 'fn', fn: 'async-check' }],
      { applicant: { fullName: 'Jane' } },
      {
        'async-check': async () => {
          await new Promise((r) => setTimeout(r, 1))
          return [
            {
              code: 'ASYNC_WARNING',
              message: 'async',
              severity: 'warning',
            },
          ]
        },
      },
    )
    expect(result.passed).toBe(true) // warnings do not fail an assessment
    expect(result.findings[0].severity).toBe('warning')
  })
})

describe('score calculation', () => {
  it('calculates percentage with mixed pass/fail', async () => {
    const result = await runWithRules(
      [
        { type: 'required', field: 'applicant.fullName' }, // pass
        { type: 'required', field: 'applicant.dob' }, // fail
        { type: 'required', field: 'applicant.email' }, // fail
        { type: 'required', field: 'applicant.age' }, // fail
      ],
      { applicant: { fullName: 'J' } },
    )
    expect(result.score).toBe(25)
    expect(result.passed).toBe(false)
  })

  it('returns 100 for an empty rule list', async () => {
    const result = await runWithRules([], { applicant: { fullName: 'J' } })
    expect(result.score).toBe(100)
    expect(result.passed).toBe(true)
  })

  it('warnings count as passed for score purposes', async () => {
    const result = await runWithRules(
      [
        { type: 'required', field: 'applicant.fullName' },
        { type: 'fn', fn: 'warn-only' },
      ],
      { applicant: { fullName: 'J' } },
      {
        'warn-only': () => [
          {
            code: 'WARN',
            message: 'warn',
            severity: 'warning',
          },
        ],
      },
    )
    expect(result.score).toBe(100)
    expect(result.passed).toBe(true)
  })
})
