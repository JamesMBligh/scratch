/**
 * JSON Schema definition used to validate entity data.
 *
 * Multiple versions for the same `id` are allowed so schema evolution
 * is possible without losing history.
 */
export interface SchemaDefinition {
  id: string
  /** Version string, e.g. '1.0', '2.0'. Semver-style strings are recommended. */
  version: string
  /** A JSON Schema (draft-07) object. */
  jsonSchema: object
}
