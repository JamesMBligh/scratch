# origination-platform

A prototype REST API for a bank origination platform, built entirely on
top of the two sibling library prototypes in this repo:

- [`entity-engine`](../entity-engine) — versioned, schema-validated data
  with declarative assessments
- [`workflow-engine`](../workflow-engine) — declarative state-machine
  workflows with pure-function guards

The platform layer owns no storage and no domain logic beyond composition.
It exposes two banking products, **Transaction Account** and
**Personal Loan**, each with its own schema, assessments, and workflow.
Everything is in-memory via the libraries' existing `Memory*Repository`
adapters — there is no database, cache, or external service.

> This is a prototype. See `CLAUDE.md` at the repo root for context.

## Design

- **Single pair of engines** — one `EntityEngine` and one `WorkflowEngine`
  are shared across all products. Product-local assessment, function, and
  guard names are prefixed with the productId at engine-construction time
  so they never collide; API callers continue to see plain unprefixed
  names.
- **Application ID = workflow instance ID**. No separate aggregate id;
  the workflow's `context` holds `{ entityId, productId }`, which is
  enough to locate everything.
- **Merged projection**. The API never leaks raw entities or raw workflow
  instances. Every read returns an `ApplicationView` that flattens the
  two objects into one shape.
- **Nothing auto-advances**. After `PUT /applications/:id` the workflow
  is untouched. Clients fire transitions explicitly, mirroring the
  caller-driven philosophy of workflow-engine.
- **Guards are thin adapters over assessments**. Each guard closes over
  an `entityEngine.assess()` closure that runs a named assessment and
  translates the result into a `GuardResult`. The composite
  `applicant-and-loan-complete` guard on the personal loan workflow shows
  how one guard can run multiple assessments.

## Setup

Both libraries must be built before this project can resolve them via
`file:` links. A convenience script handles it:

```
cd origination-platform
npm run setup
```

This installs + builds `entity-engine` and `workflow-engine`, then
installs `origination-platform`.

## Scripts

```
npm run setup   # one-time: build sibling libraries, then npm install here
npm run build   # tsc → dist/
npm start       # node dist/index.js — listens on :3000 (override with PORT)
npm test        # vitest run
```

## REST API

All routes live under `/v1`. JSON in, JSON out. Error responses are
always shaped `{ error: { code, message, ...details } }`.

### Products (read-only)

| Method | Path                 | Description |
|--------|----------------------|-------------|
| GET    | `/v1/products`       | List registered products |
| GET    | `/v1/products/:id`   | Get product detail: schema, assessments, workflow states and transitions |

### Applications

| Method | Path                                | Description |
|--------|-------------------------------------|-------------|
| POST   | `/v1/applications`                  | Create. Body: `{ productId, data, note? }` → 201 `ApplicationView` |
| GET    | `/v1/applications`                  | List. Query: `productId, state, status, limit, offset` |
| GET    | `/v1/applications/:id`              | Get merged view |
| PUT    | `/v1/applications/:id`              | Replace data. Body: `{ data, note? }`. Re-validates against the entity's original schema. Workflow untouched. |
| DELETE | `/v1/applications/:id`              | Hard delete entity + workflow instance → 204 |
| GET    | `/v1/applications/:id/history`      | Merged time-ordered audit of entity versions and workflow transitions |
| GET    | `/v1/applications/:id/available-transitions` | Transitions fireable from the current state (guards not evaluated) |
| POST   | `/v1/applications/:id/transitions`  | Fire a transition. Body: `{ name, eventData?, actor?, note? }` |
| GET    | `/v1/applications/:id/assessments`  | All stored assessment runs |
| POST   | `/v1/applications/:id/assessments/:name/run` | Run a named assessment (product-local name) |
| GET    | `/v1/applications/:id/assessments/:name/latest` | Most recent stored run |

### Error mapping

| Library error                                            | HTTP |
|----------------------------------------------------------|------|
| `EntityValidationError`                                  | 400  |
| `EntityNotFoundError` / `WorkflowInstanceNotFoundError` / `SchemaNotFoundError` / `AssessmentNotFoundError` / `WorkflowDefinitionNotFoundError` / `UnknownProductError` | 404 |
| `InvalidTransitionError` / `TerminalStateError` / `PreconditionNotMetError` | 409  |
| `GuardRejectedError`                                     | 422  |
| Config / `FunctionNotRegistered` / `GuardNotRegistered`  | 500  |

## Example: walking a transaction account through its workflow

```bash
# 1. Create (only a name) — draft@v1
curl -s -X POST localhost:3000/v1/applications \
  -H 'content-type: application/json' \
  -d '{"productId":"transaction-account","data":{"applicant":{"fullName":"Jane"}}}'
# → 201 with { id, state: "draft", entityVersion: 1, workflowVersion: 1, ... }

ID=<id from response>

# 2. Try to submit — fails because contact-details-complete guard rejects
curl -s -X POST localhost:3000/v1/applications/$ID/transitions \
  -H 'content-type: application/json' \
  -d '{"name":"submit"}'
# → 422 { error: { code: "GUARD_REJECTED", guardCode: "CONTACT_INCOMPLETE", reason: "..." } }

# 3. Fill in contact details
curl -s -X PUT localhost:3000/v1/applications/$ID \
  -H 'content-type: application/json' \
  -d '{"data":{"applicant":{"fullName":"Jane","dateOfBirth":"1990-06-15","email":"jane@example.com"}}}'
# → 200 with entityVersion: 2, state still "draft"

# 4. Submit — now passes
curl -s -X POST localhost:3000/v1/applications/$ID/transitions \
  -H 'content-type: application/json' \
  -d '{"name":"submit"}'
# → 200 with { fromState: "draft", toState: "submitted", application: { workflowVersion: 2, ... } }
```

## Example: personal loan with credit-check gating

```bash
curl -s -X POST localhost:3000/v1/applications \
  -H 'content-type: application/json' \
  -d '{"productId":"personal-loan","data":{
    "applicant":{"fullName":"Dan","dateOfBirth":"1985-03-10","email":"dan@example.com","employmentStatus":"employed","annualIncome":120000},
    "loan":{"amount":20000,"termMonths":36,"purpose":"debt_consolidation"}
  }}'
# → 201

ID=<id from response>

curl -s -X POST localhost:3000/v1/applications/$ID/transitions -H 'content-type: application/json' -d '{"name":"submit"}'
# → submitted

curl -s -X PUT localhost:3000/v1/applications/$ID -H 'content-type: application/json' -d '{"data":{
  "applicant":{"fullName":"Dan","dateOfBirth":"1985-03-10","email":"dan@example.com","employmentStatus":"employed","annualIncome":120000},
  "loan":{"amount":20000,"termMonths":36,"purpose":"debt_consolidation"},
  "identity":{"documentType":"drivers_licence","documentNumber":"DL-9988"}
}}'

curl -s -X POST localhost:3000/v1/applications/$ID/transitions -H 'content-type: application/json' -d '{"name":"verify-identity"}'
# → identity-verification
curl -s -X POST localhost:3000/v1/applications/$ID/transitions -H 'content-type: application/json' -d '{"name":"run-credit-check"}'
# → credit-check
# At this point a real system would hit a credit bureau; here the client PUTs the result
curl -s -X PUT localhost:3000/v1/applications/$ID -H 'content-type: application/json' -d '{"data":{
  "applicant":{"fullName":"Dan","dateOfBirth":"1985-03-10","email":"dan@example.com","employmentStatus":"employed","annualIncome":120000},
  "loan":{"amount":20000,"termMonths":36,"purpose":"debt_consolidation"},
  "identity":{"documentType":"drivers_licence","documentNumber":"DL-9988"},
  "creditCheck":{"score":720}
}}'
curl -s -X POST localhost:3000/v1/applications/$ID/transitions -H 'content-type: application/json' -d '{"name":"begin-underwriting"}'
# → underwriting (credit-acceptable guard passes)
curl -s -X POST localhost:3000/v1/applications/$ID/transitions -H 'content-type: application/json' -d '{"name":"approve"}'
# → approved (loan-affordable guard passes)
curl -s -X POST localhost:3000/v1/applications/$ID/transitions -H 'content-type: application/json' -d '{"name":"fund"}'
# → funded, status: "completed"
```

## Project layout

```
src/
  domain/
    products/
      index.ts                  # ProductDefinition type + registry
      transaction-account.ts    # schema, assessments, workflow, guards-factory
      personal-loan.ts          # schema, assessments, workflow, guards-factory
    application.ts              # ApplicationView + history merge helpers
    application-service.ts      # Core composition — owns both engines
  engines/
    entity-engine.ts            # Builds one EntityEngine from all products
    workflow-engine.ts          # Builds one WorkflowEngine from all products
    naming.ts                   # prefixAssessment / prefixFunction / prefixGuard
  api/
    server.ts                   # Express app factory
    errors.ts                   # Library error → HTTP middleware
    routes/
      products.ts
      applications.ts
      transitions.ts
      history.ts
      assessments.ts
  index.ts                      # buildApplicationService + server startup
tests/
  fixtures.ts
  api/
    products.test.ts
    applications.test.ts
    transitions.test.ts
    history.test.ts
    assessments.test.ts
  journeys/
    transaction-account.test.ts # Full end-to-end happy + blocked paths
    personal-loan.test.ts       # Full end-to-end, including failed credit check
```
