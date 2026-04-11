/**
 * Base class for all errors thrown by the workflow engine.
 */
export class WorkflowEngineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message)
    this.name = 'WorkflowEngineError'
  }
}

export class WorkflowEngineConfigError extends WorkflowEngineError {
  constructor(message: string) {
    super(message, 'CONFIG_INVALID')
    this.name = 'WorkflowEngineConfigError'
  }
}

export class WorkflowDefinitionNotFoundError extends WorkflowEngineError {
  constructor(name: string, version?: string) {
    super(
      `Workflow definition not found: ${name}${version ? `@${version}` : ''}`,
      'WORKFLOW_DEFINITION_NOT_FOUND',
    )
    this.name = 'WorkflowDefinitionNotFoundError'
  }
}

export class WorkflowInstanceNotFoundError extends WorkflowEngineError {
  constructor(id: string) {
    super(`Workflow instance not found: ${id}`, 'WORKFLOW_INSTANCE_NOT_FOUND')
    this.name = 'WorkflowInstanceNotFoundError'
  }
}

/**
 * Thrown when `fire()` is called with a transition name that is either not
 * defined on the workflow at all, or not available from the instance's
 * current state.
 */
export class InvalidTransitionError extends WorkflowEngineError {
  constructor(
    public readonly transition: string,
    public readonly currentState: string,
    reason: string,
  ) {
    super(
      `Invalid transition '${transition}' from state '${currentState}': ${reason}`,
      'INVALID_TRANSITION',
    )
    this.name = 'InvalidTransitionError'
  }
}

/**
 * Thrown when a guard function returned `{ allowed: false }`. The original
 * reason and optional code are preserved on the error.
 */
export class GuardRejectedError extends WorkflowEngineError {
  constructor(
    public readonly transition: string,
    public readonly reason: string,
    public readonly guardCode?: string,
  ) {
    super(
      `Guard rejected transition '${transition}': ${reason}`,
      'GUARD_REJECTED',
    )
    this.name = 'GuardRejectedError'
  }
}

/**
 * Thrown when `fire()` is called on an instance whose status is `completed`.
 * Completed workflows are frozen.
 */
export class TerminalStateError extends WorkflowEngineError {
  constructor(instanceId: string, currentState: string) {
    super(
      `Workflow instance '${instanceId}' is in terminal state '${currentState}' and cannot transition further`,
      'TERMINAL_STATE',
    )
    this.name = 'TerminalStateError'
  }
}

export class GuardNotRegisteredError extends WorkflowEngineError {
  constructor(name: string) {
    super(`Guard function not registered: ${name}`, 'GUARD_NOT_REGISTERED')
    this.name = 'GuardNotRegisteredError'
  }
}
