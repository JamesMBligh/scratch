import type { WorkflowInstance } from './instance'
import type { TransitionDefinition } from './workflow'

/**
 * Result returned by a guard function. If `allowed` is false, the engine
 * throws a GuardRejectedError carrying the reason.
 */
export type GuardResult =
  | { allowed: true }
  | { allowed: false; reason: string; code?: string }

/**
 * Arguments passed to a guard function. Guards are pure — they should not
 * mutate the instance or perform side effects.
 */
export interface GuardArgs<TContext = unknown, TEventData = unknown> {
  instance: WorkflowInstance<TContext>
  transition: TransitionDefinition
  eventData: TEventData | undefined
}

/**
 * Consumer-supplied guard function. May be synchronous or asynchronous.
 */
export type GuardFn<TContext = unknown, TEventData = unknown> = (
  args: GuardArgs<TContext, TEventData>,
) => GuardResult | Promise<GuardResult>
