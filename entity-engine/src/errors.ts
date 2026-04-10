/**
 * Base class for all errors thrown by the entity engine.
 */
export class EntityEngineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message)
    this.name = 'EntityEngineError'
  }
}

export class EntityNotFoundError extends EntityEngineError {
  constructor(id: string) {
    super(`Entity not found: ${id}`, 'ENTITY_NOT_FOUND')
    this.name = 'EntityNotFoundError'
  }
}

export class EntityValidationError extends EntityEngineError {
  constructor(public readonly validationErrors: object[]) {
    super('Entity data failed schema validation', 'ENTITY_VALIDATION_FAILED')
    this.name = 'EntityValidationError'
  }
}

export class SchemaNotFoundError extends EntityEngineError {
  constructor(id: string, version: string) {
    super(`Schema not found: ${id}@${version}`, 'SCHEMA_NOT_FOUND')
    this.name = 'SchemaNotFoundError'
  }
}

export class AssessmentNotFoundError extends EntityEngineError {
  constructor(name: string, version?: string) {
    super(
      `Assessment not found: ${name}${version ? `@${version}` : ''}`,
      'ASSESSMENT_NOT_FOUND',
    )
    this.name = 'AssessmentNotFoundError'
  }
}

export class FunctionNotRegisteredError extends EntityEngineError {
  constructor(name: string) {
    super(
      `Assessment function not registered: ${name}`,
      'FUNCTION_NOT_REGISTERED',
    )
    this.name = 'FunctionNotRegisteredError'
  }
}

export class PreconditionNotMetError extends EntityEngineError {
  constructor(assessmentName: string, precondition: string) {
    super(
      `Assessment '${assessmentName}' requires '${precondition}' to have passed first`,
      'PRECONDITION_NOT_MET',
    )
    this.name = 'PreconditionNotMetError'
  }
}

export class EntityEngineConfigError extends EntityEngineError {
  constructor(message: string) {
    super(message, 'CONFIG_INVALID')
    this.name = 'EntityEngineConfigError'
  }
}
