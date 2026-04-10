import Ajv from 'ajv'
import type { ValidateFunction, ErrorObject } from 'ajv'
import addFormats from 'ajv-formats'

import type { SchemaDefinition } from '../types/schema'
import {
  EntityEngineConfigError,
  EntityValidationError,
  SchemaNotFoundError,
} from '../errors'

/**
 * Compiles all schemas eagerly at construction time and exposes a simple
 * validate(schemaId, schemaVersion, data) method.
 */
export class SchemaValidator {
  private readonly compiled: Map<string, ValidateFunction>
  private readonly known: Map<string, SchemaDefinition>

  constructor(schemas: SchemaDefinition[]) {
    const ajv = new Ajv({ allErrors: true, strict: false })
    addFormats(ajv)

    this.compiled = new Map()
    this.known = new Map()

    for (const schema of schemas) {
      const key = this.key(schema.id, schema.version)
      if (this.compiled.has(key)) {
        throw new EntityEngineConfigError(
          `Duplicate schema: ${schema.id}@${schema.version}`,
        )
      }
      try {
        const validate = ajv.compile(schema.jsonSchema)
        this.compiled.set(key, validate)
        this.known.set(key, schema)
      } catch (err) {
        throw new EntityEngineConfigError(
          `Failed to compile schema ${schema.id}@${schema.version}: ${
            (err as Error).message
          }`,
        )
      }
    }
  }

  /**
   * Returns true if the given schemaId+version was registered at construction.
   */
  has(schemaId: string, schemaVersion: string): boolean {
    return this.compiled.has(this.key(schemaId, schemaVersion))
  }

  /**
   * Returns true if any version of the given schemaId exists.
   */
  hasAnyVersionOf(schemaId: string): boolean {
    for (const schema of this.known.values()) {
      if (schema.id === schemaId) return true
    }
    return false
  }

  /**
   * Validates data against the given schema. Throws SchemaNotFoundError if
   * the schema is unknown, and EntityValidationError if validation fails.
   */
  validate(schemaId: string, schemaVersion: string, data: unknown): void {
    const validate = this.compiled.get(this.key(schemaId, schemaVersion))
    if (!validate) {
      throw new SchemaNotFoundError(schemaId, schemaVersion)
    }
    const ok = validate(data)
    if (!ok) {
      const errors: ErrorObject[] = validate.errors ?? []
      throw new EntityValidationError(errors as unknown as object[])
    }
  }

  private key(id: string, version: string): string {
    return `${id}@${version}`
  }
}
