import type { ErrorRequestHandler } from 'express'

import {
  AssessmentNotFoundError,
  EntityEngineConfigError,
  EntityEngineError,
  EntityNotFoundError,
  EntityValidationError,
  FunctionNotRegisteredError,
  PreconditionNotMetError,
  SchemaNotFoundError,
} from 'entity-engine'
import {
  GuardNotRegisteredError,
  GuardRejectedError,
  InvalidTransitionError,
  TerminalStateError,
  WorkflowDefinitionNotFoundError,
  WorkflowEngineConfigError,
  WorkflowEngineError,
  WorkflowInstanceNotFoundError,
} from 'workflow-engine'

import { UnknownProductError } from '../domain/application-service'

interface ErrorBody {
  code: string
  message: string
  [k: string]: unknown
}

interface MappedError {
  status: number
  body: ErrorBody
}

/**
 * Classify a thrown error into an HTTP status and JSON body. Unknown
 * errors produce a 500 with the generic code `INTERNAL_ERROR`.
 */
export function mapError(err: unknown): MappedError {
  if (err instanceof EntityValidationError) {
    return {
      status: 400,
      body: {
        code: err.code,
        message: err.message,
        validationErrors: err.validationErrors,
      },
    }
  }
  if (err instanceof EntityNotFoundError) {
    return { status: 404, body: { code: err.code, message: err.message } }
  }
  if (err instanceof SchemaNotFoundError) {
    return { status: 404, body: { code: err.code, message: err.message } }
  }
  if (err instanceof AssessmentNotFoundError) {
    return { status: 404, body: { code: err.code, message: err.message } }
  }
  if (err instanceof PreconditionNotMetError) {
    return { status: 409, body: { code: err.code, message: err.message } }
  }
  if (
    err instanceof EntityEngineConfigError ||
    err instanceof FunctionNotRegisteredError
  ) {
    return { status: 500, body: { code: err.code, message: err.message } }
  }
  if (err instanceof WorkflowInstanceNotFoundError) {
    return { status: 404, body: { code: err.code, message: err.message } }
  }
  if (err instanceof WorkflowDefinitionNotFoundError) {
    return { status: 404, body: { code: err.code, message: err.message } }
  }
  if (err instanceof InvalidTransitionError) {
    return {
      status: 409,
      body: {
        code: err.code,
        message: err.message,
        transition: err.transition,
        currentState: err.currentState,
      },
    }
  }
  if (err instanceof TerminalStateError) {
    return { status: 409, body: { code: err.code, message: err.message } }
  }
  if (err instanceof GuardRejectedError) {
    return {
      status: 422,
      body: {
        code: err.code,
        message: err.message,
        transition: err.transition,
        reason: err.reason,
        guardCode: err.guardCode,
      },
    }
  }
  if (
    err instanceof WorkflowEngineConfigError ||
    err instanceof GuardNotRegisteredError
  ) {
    return { status: 500, body: { code: err.code, message: err.message } }
  }
  if (err instanceof UnknownProductError) {
    return {
      status: 404,
      body: {
        code: err.code,
        message: err.message,
        productId: err.productId,
      },
    }
  }
  // Any other subclasses that we haven't enumerated.
  if (err instanceof EntityEngineError || err instanceof WorkflowEngineError) {
    return { status: 500, body: { code: err.code, message: err.message } }
  }

  const message = err instanceof Error ? err.message : String(err)
  return {
    status: 500,
    body: { code: 'INTERNAL_ERROR', message },
  }
}

/**
 * Express error-handling middleware. Must be mounted last so any error
 * thrown from a route handler or `next(err)` call is funnelled here.
 */
export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  const { status, body } = mapError(err)
  res.status(status).json({ error: body })
}
