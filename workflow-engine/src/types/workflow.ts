/**
 * The declarative shape of a workflow. All definitions are registered
 * with the engine at construction time and cannot be changed afterwards.
 */
export interface WorkflowDefinition {
  name: string
  version: string
  /** Name of the state every new instance starts in. Must appear in `states`. */
  initialState: string
  /**
   * Names of terminal states. Reaching one of these marks the instance as
   * completed; no further transitions may fire. Each must appear in `states`.
   */
  finalStates: string[]
  states: StateDefinition[]
  transitions: TransitionDefinition[]
}

/**
 * A single named state in a workflow.
 */
export interface StateDefinition {
  name: string
  label?: string
  description?: string
}

/**
 * A named transition between states. Transition names must be unique within
 * a workflow definition. The `from` field may be a single source state or an
 * array of source states.
 */
export interface TransitionDefinition {
  /** The event name, e.g. 'submit', 'approve'. Unique within a workflow. */
  name: string
  /** One or more source states this transition can fire from. */
  from: string | string[]
  /** The destination state. */
  to: string
  /** Optional key into `config.guards`. If set, the guard decides whether the transition may fire. */
  guard?: string
  label?: string
  description?: string
}
