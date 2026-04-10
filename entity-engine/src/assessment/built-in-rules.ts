import type { AssessmentRule, Finding } from '../types/assessment'
import { getFieldValue } from './field-path'

/**
 * Executes a single built-in rule against the given data object and returns
 * any findings produced. Built-in rules only produce error-severity findings.
 */
export function executeBuiltInRule(
  rule: Exclude<AssessmentRule, { type: 'fn' }>,
  data: unknown,
): Finding[] {
  switch (rule.type) {
    case 'required':
      return checkRequired(rule.field, data)
    case 'regex':
      return checkRegex(rule.field, rule.pattern, rule.flags, data)
    case 'range':
      return checkRange(rule.field, rule.min, rule.max, data)
    case 'minLength':
      return checkMinLength(rule.field, rule.min, data)
    case 'maxLength':
      return checkMaxLength(rule.field, rule.max, data)
    case 'enum':
      return checkEnum(rule.field, rule.values, data)
  }
}

function checkRequired(field: string, data: unknown): Finding[] {
  const value = getFieldValue(data, field)
  if (value === undefined || value === null || value === '') {
    return [
      {
        field,
        code: 'FIELD_REQUIRED',
        message: `Field '${field}' is required`,
        severity: 'error',
      },
    ]
  }
  return []
}

function checkRegex(
  field: string,
  pattern: string,
  flags: string | undefined,
  data: unknown,
): Finding[] {
  const value = getFieldValue(data, field)
  if (value === undefined || value === null) return []
  if (typeof value !== 'string') {
    return [
      {
        field,
        code: 'FIELD_TYPE_INVALID',
        message: `Field '${field}' must be a string for regex validation`,
        severity: 'error',
      },
    ]
  }
  const regex = new RegExp(pattern, flags)
  if (!regex.test(value)) {
    return [
      {
        field,
        code: 'FIELD_PATTERN_MISMATCH',
        message: `Field '${field}' does not match pattern /${pattern}/${flags ?? ''}`,
        severity: 'error',
      },
    ]
  }
  return []
}

function checkRange(
  field: string,
  min: number | undefined,
  max: number | undefined,
  data: unknown,
): Finding[] {
  const value = getFieldValue(data, field)
  if (value === undefined || value === null) return []
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return [
      {
        field,
        code: 'FIELD_TYPE_INVALID',
        message: `Field '${field}' must be a number for range validation`,
        severity: 'error',
      },
    ]
  }
  if (min !== undefined && value < min) {
    return [
      {
        field,
        code: 'FIELD_OUT_OF_RANGE',
        message: `Field '${field}' must be >= ${min}`,
        severity: 'error',
      },
    ]
  }
  if (max !== undefined && value > max) {
    return [
      {
        field,
        code: 'FIELD_OUT_OF_RANGE',
        message: `Field '${field}' must be <= ${max}`,
        severity: 'error',
      },
    ]
  }
  return []
}

function checkMinLength(
  field: string,
  min: number,
  data: unknown,
): Finding[] {
  const value = getFieldValue(data, field)
  if (value === undefined || value === null) return []
  const length = lengthOf(value)
  if (length === null) {
    return [
      {
        field,
        code: 'FIELD_TYPE_INVALID',
        message: `Field '${field}' must be a string or array for minLength validation`,
        severity: 'error',
      },
    ]
  }
  if (length < min) {
    return [
      {
        field,
        code: 'FIELD_TOO_SHORT',
        message: `Field '${field}' must have length >= ${min}`,
        severity: 'error',
      },
    ]
  }
  return []
}

function checkMaxLength(
  field: string,
  max: number,
  data: unknown,
): Finding[] {
  const value = getFieldValue(data, field)
  if (value === undefined || value === null) return []
  const length = lengthOf(value)
  if (length === null) {
    return [
      {
        field,
        code: 'FIELD_TYPE_INVALID',
        message: `Field '${field}' must be a string or array for maxLength validation`,
        severity: 'error',
      },
    ]
  }
  if (length > max) {
    return [
      {
        field,
        code: 'FIELD_TOO_LONG',
        message: `Field '${field}' must have length <= ${max}`,
        severity: 'error',
      },
    ]
  }
  return []
}

function checkEnum(
  field: string,
  values: unknown[],
  data: unknown,
): Finding[] {
  const value = getFieldValue(data, field)
  if (value === undefined || value === null) return []
  if (!values.includes(value)) {
    return [
      {
        field,
        code: 'FIELD_NOT_IN_ENUM',
        message: `Field '${field}' must be one of: ${values
          .map((v) => JSON.stringify(v))
          .join(', ')}`,
        severity: 'error',
      },
    ]
  }
  return []
}

function lengthOf(value: unknown): number | null {
  if (typeof value === 'string') return value.length
  if (Array.isArray(value)) return value.length
  return null
}
