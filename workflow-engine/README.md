# workflow-engine

A storage-agnostic TypeScript state-machine workflow engine with full
transition history. Companion library to `entity-engine` — architected the
same way, but scoped to declarative workflow definitions and caller-driven
state transitions.

> This is a prototype. See `CLAUDE.md` at the repo root for context.

## Design principles

- **No database dependencies.** Persistence is delegated to a repository
  object supplied by the consumer. The library ships only an in-memory
  reference adapter.
- **Initialisation-time configuration.** All workflow definitions, states,
  transitions, guards, and the repository are declared once via a
  strongly-typed config passed to the engine constructor.
- **Immutable versioning.** Every `start` and every `fire` writes a new
  version record. Previous versions are never overwritten — the version
  records *are* the history.
- **Caller-driven.** The engine has no ambient loop. Nothing advances until
  the caller invokes `fire()` with a transition name. No timers, no queues,
  no background workers.
- **Results are data.** `fire()` returns a structured `TransitionOutcome`;
  the caller decides what to do with it.
- **Pure guards.** Guards are pure predicates — they may read the instance
  and event data, but they must not mutate anything. Side effects are the
  caller's concern.
- **Soft coupling to `entity-engine`.** Workflow instances carry an opaque
  `context` object. A typical consumer puts `{ entityId, schemaId }` there
  and wires the two libraries together at the application layer. The
  workflow library does not import entity-engine.

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
import { WorkflowEngine, MemoryWorkflowRepository } from 'workflow-engine'

interface AppContext { entityId: string; applicantName: string; amount?: number }
interface ReviewEvent { reviewer?: string; comment?: string }

const engine = new WorkflowEngine<AppContext, ReviewEvent>({
  workflowKind: {
    name: 'bank-account-application-review',
    label: 'Bank Account Application Review',
  },
  workflows: [
    {
      name: 'bank-account-application-review',
      version: '1.0',
      initialState: 'draft',
      finalStates: ['activated', 'rejected', 'cancelled'],
      states: [
        { name: 'draft' },
        { name: 'submitted' },
        { name: 'under-review' },
        { name: 'approved' },
        { name: 'activated' },
        { name: 'rejected' },
        { name: 'cancelled' },
      ],
      transitions: [
        { name: 'submit', from: 'draft', to: 'submitted', guard: 'application-complete' },
        { name: 'begin-review', from: 'submitted', to: 'under-review' },
        { name: 'approve', from: 'under-review', to: 'approved' },
        { name: 'reject', from: ['submitted', 'under-review'], to: 'rejected' },
        { name: 'activate', from: 'approved', to: 'activated' },
        { name: 'cancel', from: ['draft', 'submitted', 'under-review'], to: 'cancelled' },
      ],
    },
  ],
  guards: {
    'application-complete': ({ instance }) => {
      if (!instance.context.amount || instance.context.amount <= 0) {
        return { allowed: false, reason: 'amount required', code: 'AMOUNT_REQUIRED' }
      }
      return { allowed: true }
    },
  },
  repository: { instances: new MemoryWorkflowRepository() },
})

// Start
const instance = await engine.start('bank-account-application-review', {
  entityId: 'app-123',
  applicantName: 'Jane',
  amount: 1000,
})

// Drive the state machine
await engine.fire(instance.id, 'submit')
await engine.fire(instance.id, 'begin-review')
const outcome = await engine.fire(instance.id, 'approve', { reviewer: 'alex' })
// → { fromState: 'under-review', toState: 'approved', instance, record, ... }

// Inspect
const available = await engine.availableTransitions(instance.id)
// → [{ name: 'activate', ... }]

const history = await engine.getHistory(instance.id)
// → four version records: start(draft), transition(submit), transition(begin-review), transition(approve)
```

## Validation at construction time

The constructor throws `WorkflowEngineConfigError` if any of these are violated:

- Duplicate `workflowName@version`
- Duplicate state names within a workflow
- `initialState` not in `states`
- Any `finalStates` entry not in `states`
- Duplicate transition names within a workflow
- Any transition `from` or `to` referencing an unknown state
- Any transition declared with an empty `from` list
- Any transition `guard` name not registered in `config.guards`
- Any outgoing transition declared from a final state

## Runtime errors

`fire()` throws:

| Error                           | When                                                               |
|---------------------------------|--------------------------------------------------------------------|
| `WorkflowInstanceNotFoundError` | The instance id does not exist                                     |
| `TerminalStateError`            | The instance is already `completed`                                |
| `InvalidTransitionError`        | The transition name is unknown, or not available from the current state |
| `GuardRejectedError`            | A guard returned `{ allowed: false }` — reason and code preserved  |

## Relationship to `entity-engine`

Soft-coupled by convention, not by code. A typical setup keeps the two
libraries independent and composes them at the application layer:

```typescript
// At the app layer, wire entity-engine and workflow-engine together
const outcome = await workflowEngine.fire(instance.id, 'submit')
// Consumer chooses to run an assessment as a side effect
await entityEngine.assess(instance.context.entityId, 'contact-details-sufficient')
```

If you want a guard to call an entity-engine assessment, do it explicitly in
the consumer-supplied guard function — the workflow library itself has no
awareness of entities.

## Project layout

```
src/
  types/            # workflow, instance, query, guard, config
  interfaces/       # IWorkflowRepository
  adapters/         # MemoryWorkflowRepository
  engine.ts         # WorkflowEngine class
  field-path.ts     # dot-notation resolver (duplicated locally — no cross-project imports)
  errors.ts
  index.ts          # public exports
tests/
  engine.test.ts
  memory-repository.test.ts
  fixtures.ts
```
