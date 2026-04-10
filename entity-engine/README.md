# entity-engine

A storage-agnostic TypeScript library that provides a document store with a
named assessment engine. It manages strongly-typed JSON entities, maintains
their full version history, and runs named assessment functions against them
to evaluate validity, sufficiency, completeness, or any other externally
defined criteria.

> This is a prototype. See `CLAUDE.md` at the repo root for context.

## Design principles

- **No database dependencies.** The library has zero knowledge of any
  database technology. Persistence is delegated to a repository object
  supplied by the consumer.
- **Initialisation-time configuration.** All schemas, assessments, functions,
  and the repository are declared once via a strongly-typed config passed to
  the engine constructor. There is no dynamic registration after that.
- **Immutable versioning.** Every mutation creates a new version. Previous
  versions are never overwritten.
- **Assessment results are data.** Running an assessment produces a
  structured result; the engine stores it via the repository if one is
  configured, and the caller decides what to do with it.
- **Single responsibility.** The engine stores entities and runs assessments.
  It has no opinion about workflow, state machines, or business process.

## Install

```
npm install
```

## Scripts

```
npm run build   # tsc → dist/
npm test        # vitest run
```

## Quick start

```typescript
import { EntityEngine, MemoryEntityRepository } from 'entity-engine'

interface BankApp {
  applicant: { fullName: string; dob?: string; email?: string }
  identity?: { documentType?: string; documentNumber?: string; tfn?: string }
}

const engine = new EntityEngine<BankApp>({
  entity: { name: 'bank-account-application', label: 'Bank Account Application' },
  schemas: [
    {
      id: 'bank-account-application',
      version: '1.0',
      jsonSchema: {
        type: 'object',
        required: ['applicant'],
        properties: {
          applicant: {
            type: 'object',
            required: ['fullName'],
            properties: {
              fullName: { type: 'string' },
              dob: { type: 'string' },
              email: { type: 'string' },
            },
          },
        },
      },
    },
  ],
  assessments: [
    {
      name: 'contact-details-sufficient',
      version: '1.0',
      schemaId: 'bank-account-application',
      rules: [
        { type: 'required', field: 'applicant.fullName' },
        { type: 'required', field: 'applicant.dob' },
        { type: 'required', field: 'applicant.email' },
      ],
    },
  ],
  functions: {},
  repository: { entities: new MemoryEntityRepository() },
})

const app = await engine.create('bank-account-application', '1.0', {
  applicant: { fullName: 'Jane Smith' },
})

const updated = await engine.update(app.id, {
  applicant: { fullName: 'Jane Smith', dob: '1990-06-15', email: 'jane@example.com' },
})

const result = await engine.assess(app.id, 'contact-details-sufficient')
// → { passed: true, score: 100, findings: [] }
```

## Built-in rule executors

| Rule type   | Behaviour                                                          |
|-------------|--------------------------------------------------------------------|
| `required`  | Finding if the field is absent, null, or empty string              |
| `regex`     | Finding if the field value does not match the pattern              |
| `range`     | Finding if the numeric field value is outside min/max              |
| `minLength` | Finding if the string or array field length is below min           |
| `maxLength` | Finding if the string or array field length exceeds max            |
| `enum`      | Finding if the field value is not in the allowed values list       |
| `fn`        | Delegates to the consumer-supplied function named in `functions`   |

All built-in rules produce error-severity findings. Consumer `fn` rules may
produce findings with any severity.

## Score calculation

```
score = Math.round((rulesPassed / totalRules) * 100)
```

A rule is considered passed if it produced zero error-severity findings.
Rules producing only warning or info findings count as passed.

## Project layout

```
src/
  types/            # all public type definitions
  interfaces/       # IEntityRepository, IAssessmentRunRepository
  schema/           # AJV wrapper
  assessment/       # built-in rules, runner, field-path utility
  adapters/         # MemoryEntityRepository, MemoryAssessmentRunRepository
  engine.ts         # EntityEngine class
  errors.ts
  index.ts          # public exports
tests/
  engine.test.ts
  assessment-runner.test.ts
  memory-repository.test.ts
```
