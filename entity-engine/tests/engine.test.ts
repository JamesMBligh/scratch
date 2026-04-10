import { describe, expect, it } from 'vitest'

import { EntityEngine } from '../src/engine'
import {
  EntityEngineConfigError,
  EntityNotFoundError,
  EntityValidationError,
  AssessmentNotFoundError,
  PreconditionNotMetError,
} from '../src/errors'
import {
  MemoryAssessmentRunRepository,
  MemoryEntityRepository,
} from '../src/adapters/memory-repository'
import {
  BankApp,
  bankSchema,
  contactAssessment,
  kycAssessment,
  makeConfig,
} from './fixtures'

describe('EntityEngine construction', () => {
  it('constructs with a valid config', () => {
    expect(() => new EntityEngine<BankApp>(makeConfig())).not.toThrow()
  })

  it('throws when an assessment references an unknown fn', () => {
    expect(
      () =>
        new EntityEngine<BankApp>(
          makeConfig({
            assessments: [
              {
                name: 'broken',
                version: '1.0',
                schemaId: 'bank-account-application',
                rules: [{ type: 'fn', fn: 'does-not-exist' }],
              },
            ],
          }),
        ),
    ).toThrow(EntityEngineConfigError)
  })

  it('throws on duplicate schema id+version', () => {
    expect(
      () =>
        new EntityEngine<BankApp>(
          makeConfig({
            schemas: [bankSchema, { ...bankSchema }],
          }),
        ),
    ).toThrow(EntityEngineConfigError)
  })

  it('throws on duplicate assessment name+version', () => {
    expect(
      () =>
        new EntityEngine<BankApp>(
          makeConfig({
            assessments: [contactAssessment, { ...contactAssessment }],
          }),
        ),
    ).toThrow(EntityEngineConfigError)
  })

  it('throws when an assessment references an unknown schemaId', () => {
    expect(
      () =>
        new EntityEngine<BankApp>(
          makeConfig({
            assessments: [
              {
                name: 'orphan',
                version: '1.0',
                schemaId: 'unknown-schema',
                rules: [{ type: 'required', field: 'applicant.fullName' }],
              },
            ],
          }),
        ),
    ).toThrow(EntityEngineConfigError)
  })

  it('throws when a precondition references an unknown assessment', () => {
    expect(
      () =>
        new EntityEngine<BankApp>(
          makeConfig({
            assessments: [
              {
                ...contactAssessment,
                precondition: 'no-such-thing',
              },
            ],
          }),
        ),
    ).toThrow(EntityEngineConfigError)
  })
})

describe('Entity create', () => {
  it('creates an entity at version 1', async () => {
    const engine = new EntityEngine<BankApp>(makeConfig())
    const entity = await engine.create('bank-account-application', '1.0', {
      applicant: { fullName: 'Jane Smith' },
    })
    expect(entity.version).toBe(1)
    expect(entity.data.applicant.fullName).toBe('Jane Smith')
    expect(entity.id).toBeTruthy()
  })

  it('throws EntityValidationError on schema validation failure', async () => {
    const engine = new EntityEngine<BankApp>(makeConfig())
    await expect(
      engine.create('bank-account-application', '1.0', {
        // missing required applicant
      } as unknown as BankApp),
    ).rejects.toBeInstanceOf(EntityValidationError)
  })
})

describe('Entity update', () => {
  it('updates an entity creating a new version', async () => {
    const engine = new EntityEngine<BankApp>(makeConfig())
    const created = await engine.create('bank-account-application', '1.0', {
      applicant: { fullName: 'Jane' },
    })
    const updated = await engine.update(created.id, {
      applicant: {
        fullName: 'Jane',
        dob: '1990-06-15',
        email: 'jane@example.com',
      },
    })
    expect(updated.version).toBe(2)
    expect(updated.data.applicant.dob).toBe('1990-06-15')
  })

  it('throws EntityNotFoundError when updating unknown entity', async () => {
    const engine = new EntityEngine<BankApp>(makeConfig())
    await expect(
      engine.update('missing-id', {
        applicant: { fullName: 'x' },
      }),
    ).rejects.toBeInstanceOf(EntityNotFoundError)
  })
})

describe('Version history', () => {
  it('returns all versions in order', async () => {
    const engine = new EntityEngine<BankApp>(makeConfig())
    const created = await engine.create('bank-account-application', '1.0', {
      applicant: { fullName: 'A' },
    })
    await engine.update(created.id, { applicant: { fullName: 'B' } })
    await engine.update(created.id, { applicant: { fullName: 'C' } })

    const history = await engine.getVersionHistory(created.id)
    expect(history.map((v) => v.version)).toEqual([1, 2, 3])
    expect(history.map((v) => v.data.applicant.fullName)).toEqual([
      'A',
      'B',
      'C',
    ])
    expect(history[0].previousVersion).toBeNull()
    expect(history[1].previousVersion).toBe(1)
    expect(history[2].previousVersion).toBe(2)
  })
})

describe('Assessment — precondition', () => {
  it('throws PreconditionNotMetError when precondition has not passed', async () => {
    const engine = new EntityEngine<BankApp>(makeConfig())
    const created = await engine.create('bank-account-application', '1.0', {
      applicant: { fullName: 'Jane' },
    })
    await expect(
      engine.assess(created.id, 'kyc-sufficient'),
    ).rejects.toBeInstanceOf(PreconditionNotMetError)
  })

  it('proceeds once precondition has passed', async () => {
    const engine = new EntityEngine<BankApp>(makeConfig())
    const created = await engine.create('bank-account-application', '1.0', {
      applicant: {
        fullName: 'Jane',
        dob: '1990-01-01',
        email: 'jane@example.com',
      },
      identity: { documentType: 'passport', documentNumber: 'P123' },
    })

    const contact = await engine.assess(created.id, 'contact-details-sufficient')
    expect(contact.passed).toBe(true)

    const kyc = await engine.assess(created.id, 'kyc-sufficient')
    expect(kyc.passed).toBe(true)
  })
})

describe('Assessment — result storage', () => {
  it('stores and retrieves the latest assessment result', async () => {
    const config = makeConfig()
    const engine = new EntityEngine<BankApp>(config)
    const created = await engine.create('bank-account-application', '1.0', {
      applicant: {
        fullName: 'Jane',
        dob: '1990-01-01',
        email: 'jane@example.com',
      },
    })
    const result = await engine.assess(
      created.id,
      'contact-details-sufficient',
    )
    expect(result.passed).toBe(true)

    const latest = await engine.getLatestAssessment(
      created.id,
      'contact-details-sufficient',
    )
    expect(latest).not.toBeNull()
    expect(latest!.passed).toBe(true)
  })

  it('returns null / empty history when no assessment run repo configured', async () => {
    const config = makeConfig({
      repository: { entities: new MemoryEntityRepository() },
    })
    const engine = new EntityEngine<BankApp>(config)
    const created = await engine.create('bank-account-application', '1.0', {
      applicant: {
        fullName: 'Jane',
        dob: '1990-01-01',
        email: 'jane@example.com',
      },
    })
    await engine.assess(created.id, 'contact-details-sufficient')

    expect(
      await engine.getLatestAssessment(created.id, 'contact-details-sufficient'),
    ).toBeNull()
    expect(await engine.getAssessmentHistory(created.id)).toEqual([])
  })
})

describe('Assessment — unknown assessment', () => {
  it('throws AssessmentNotFoundError when the name is unknown', async () => {
    const engine = new EntityEngine<BankApp>(makeConfig())
    const created = await engine.create('bank-account-application', '1.0', {
      applicant: {
        fullName: 'Jane',
        dob: '1990-01-01',
        email: 'jane@example.com',
      },
    })
    await expect(engine.assess(created.id, 'not-real')).rejects.toBeInstanceOf(
      AssessmentNotFoundError,
    )
  })
})

describe('Assessment versioning', () => {
  it('selects the highest semver assessment version when none specified', async () => {
    const engine = new EntityEngine<BankApp>(
      makeConfig({
        assessments: [
          {
            name: 'minimal',
            version: '1.0',
            schemaId: 'bank-account-application',
            rules: [{ type: 'required', field: 'applicant.fullName' }],
          },
          {
            name: 'minimal',
            version: '2.0',
            schemaId: 'bank-account-application',
            rules: [
              { type: 'required', field: 'applicant.fullName' },
              { type: 'required', field: 'applicant.dob' },
            ],
          },
        ],
      }),
    )
    const created = await engine.create('bank-account-application', '1.0', {
      applicant: { fullName: 'X' },
    })
    const result = await engine.assess(created.id, 'minimal')
    expect(result.assessmentVersion).toBe('2.0')
    // Version 2.0 has 2 rules, only 1 passes → 50
    expect(result.score).toBe(50)
  })
})
