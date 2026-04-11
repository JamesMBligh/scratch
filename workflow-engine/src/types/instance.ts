/**
 * Lifecycle status of a workflow instance. `active` means further transitions
 * may still fire. `completed` means the instance has reached a final state and
 * is frozen.
 */
export type WorkflowStatus = 'active' | 'completed'

/**
 * The current state of a workflow instance. This is what `get()` / `find()`
 * return.
 */
export interface WorkflowInstance<TContext = unknown> {
  id: string
  workflowName: string
  workflowVersion: string
  currentState: string
  status: WorkflowStatus
  context: TContext
  /** Monotonically increasing integer, starts at 1 and increments on every transition. */
  version: number
  createdAt: Date
  updatedAt: Date
}

/**
 * A single historical version record. Every call to `start()` / `fire()`
 * produces exactly one of these. The cause describes why the version exists.
 */
export interface WorkflowInstanceVersion<TContext = unknown>
  extends WorkflowInstance<TContext> {
  previousVersion: number | null
  cause: VersionCause
}

/**
 * Discriminated union describing why a new instance version was recorded.
 */
export type VersionCause =
  | { type: 'start'; note?: string }
  | {
      type: 'transition'
      transition: string
      fromState: string
      toState: string
      eventData?: unknown
      actor?: string
      note?: string
    }

/**
 * The synchronous result of a successful `fire()` call. Carries both the new
 * instance state and the version record that was just appended to history.
 */
export interface TransitionOutcome<TContext = unknown> {
  instance: WorkflowInstance<TContext>
  record: WorkflowInstanceVersion<TContext>
  fromState: string
  toState: string
  transition: string
}
