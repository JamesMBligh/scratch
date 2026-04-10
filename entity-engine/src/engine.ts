import type { EntityEngineConfig } from './types/config'
import type { Entity, EntityVersion } from './types/entity'
import type { QueryCriteria } from './types/query'
import type {
  AssessmentDefinition,
  AssessmentResult,
} from './types/assessment'
import {
  AssessmentNotFoundError,
  EntityEngineConfigError,
  EntityNotFoundError,
  FunctionNotRegisteredError,
  PreconditionNotMetError,
  SchemaNotFoundError,
} from './errors'
import { SchemaValidator } from './schema/validator'
import { runAssessment } from './assessment/runner'

/**
 * Main engine class. Construct with a complete EntityEngineConfig — all
 * behaviour is fixed at construction time.
 */
export class EntityEngine<TData = unknown> {
  private readonly config: EntityEngineConfig<TData>
  private readonly validator: SchemaValidator
  private readonly assessments: Map<string, AssessmentDefinition>
  private readonly assessmentsByName: Map<string, AssessmentDefinition[]>
  private readonly generateId: () => string

  constructor(config: EntityEngineConfig<TData>) {
    this.config = config
    this.validator = new SchemaValidator(config.schemas)
    this.assessments = new Map()
    this.assessmentsByName = new Map()

    this.validateAssessmentConfig()

    this.generateId = config.generateId ?? defaultIdGenerator()
  }

  // ── Entity operations ─────────────────────────────────────────────────

  async create(
    schemaId: string,
    schemaVersion: string,
    data: TData,
    changeNote?: string,
  ): Promise<Entity<TData>> {
    if (!this.validator.has(schemaId, schemaVersion)) {
      throw new SchemaNotFoundError(schemaId, schemaVersion)
    }
    this.validator.validate(schemaId, schemaVersion, data)

    const now = new Date()
    const version: EntityVersion<TData> = {
      id: this.generateId(),
      schemaId,
      schemaVersion,
      version: 1,
      data,
      createdAt: now,
      updatedAt: now,
      previousVersion: null,
      changeNote,
    }
    await this.config.repository.entities.save(
      version as unknown as EntityVersion,
    )
    return toEntity(version)
  }

  async update(
    id: string,
    data: TData,
    changeNote?: string,
  ): Promise<Entity<TData>> {
    const existing = (await this.config.repository.entities.findById(id)) as
      | Entity<TData>
      | null
    if (!existing) throw new EntityNotFoundError(id)

    this.validator.validate(existing.schemaId, existing.schemaVersion, data)

    const now = new Date()
    const nextVersion: EntityVersion<TData> = {
      id: existing.id,
      schemaId: existing.schemaId,
      schemaVersion: existing.schemaVersion,
      version: existing.version + 1,
      data,
      createdAt: existing.createdAt,
      updatedAt: now,
      previousVersion: existing.version,
      changeNote,
    }
    await this.config.repository.entities.save(
      nextVersion as unknown as EntityVersion,
    )
    return toEntity(nextVersion)
  }

  async get(id: string): Promise<Entity<TData> | null> {
    const found = await this.config.repository.entities.findById(id)
    return (found as Entity<TData> | null) ?? null
  }

  async getVersion(
    id: string,
    version: number,
  ): Promise<EntityVersion<TData> | null> {
    const found = await this.config.repository.entities.findVersion(id, version)
    return (found as EntityVersion<TData> | null) ?? null
  }

  async getVersionHistory(id: string): Promise<EntityVersion<TData>[]> {
    const versions = await this.config.repository.entities.findAllVersions(id)
    return versions as EntityVersion<TData>[]
  }

  async find(criteria: QueryCriteria): Promise<Entity<TData>[]> {
    const results = await this.config.repository.entities.find(criteria)
    return results as Entity<TData>[]
  }

  async count(criteria: QueryCriteria): Promise<number> {
    return this.config.repository.entities.count(criteria)
  }

  async delete(id: string): Promise<void> {
    return this.config.repository.entities.delete(id)
  }

  // ── Assessment operations ─────────────────────────────────────────────

  async assess(
    entityId: string,
    assessmentName: string,
    assessmentVersion?: string,
  ): Promise<AssessmentResult> {
    const definition = this.resolveAssessment(assessmentName, assessmentVersion)
    const entity = (await this.config.repository.entities.findById(
      entityId,
    )) as Entity<TData> | null
    if (!entity) throw new EntityNotFoundError(entityId)

    if (definition.precondition) {
      await this.requirePrecondition(entityId, definition)
    }

    const result = await runAssessment(
      definition,
      entity,
      this.config.functions,
    )

    if (this.config.repository.assessmentRuns) {
      await this.config.repository.assessmentRuns.save(result)
    }

    return result
  }

  async getAssessmentHistory(entityId: string): Promise<AssessmentResult[]> {
    const repo = this.config.repository.assessmentRuns
    if (!repo) return []
    return repo.findByEntityId(entityId)
  }

  async getLatestAssessment(
    entityId: string,
    assessmentName: string,
  ): Promise<AssessmentResult | null> {
    const repo = this.config.repository.assessmentRuns
    if (!repo) return null
    return repo.findLatest(entityId, assessmentName)
  }

  // ── Internal ───────────────────────────────────────────────────────────

  private validateAssessmentConfig(): void {
    const seen = new Set<string>()
    for (const def of this.config.assessments) {
      const key = `${def.name}@${def.version}`
      if (seen.has(key)) {
        throw new EntityEngineConfigError(
          `Duplicate assessment: ${def.name}@${def.version}`,
        )
      }
      seen.add(key)

      if (!this.validator.hasAnyVersionOf(def.schemaId)) {
        throw new EntityEngineConfigError(
          `Assessment '${def.name}@${def.version}' references unknown schemaId '${def.schemaId}'`,
        )
      }

      for (const rule of def.rules) {
        if (rule.type === 'fn') {
          if (!this.config.functions || !(rule.fn in this.config.functions)) {
            throw new EntityEngineConfigError(
              `Assessment '${def.name}@${def.version}' references unregistered function '${rule.fn}'`,
            )
          }
        }
      }

      this.assessments.set(key, def)
      const byName = this.assessmentsByName.get(def.name) ?? []
      byName.push(def)
      this.assessmentsByName.set(def.name, byName)
    }

    // Validate preconditions reference known assessments.
    for (const def of this.config.assessments) {
      if (def.precondition && !this.assessmentsByName.has(def.precondition)) {
        throw new EntityEngineConfigError(
          `Assessment '${def.name}@${def.version}' references unknown precondition '${def.precondition}'`,
        )
      }
    }
  }

  private resolveAssessment(
    name: string,
    version?: string,
  ): AssessmentDefinition {
    if (version !== undefined) {
      const found = this.assessments.get(`${name}@${version}`)
      if (!found) throw new AssessmentNotFoundError(name, version)
      return found
    }
    const all = this.assessmentsByName.get(name)
    if (!all || all.length === 0) throw new AssessmentNotFoundError(name)
    return all.reduce((best, current) =>
      compareVersions(current.version, best.version) > 0 ? current : best,
    )
  }

  private async requirePrecondition(
    entityId: string,
    definition: AssessmentDefinition,
  ): Promise<void> {
    const precondition = definition.precondition
    if (!precondition) return

    const repo = this.config.repository.assessmentRuns
    if (!repo) {
      throw new PreconditionNotMetError(definition.name, precondition)
    }
    const latest = await repo.findLatest(entityId, precondition)
    if (!latest || !latest.passed) {
      throw new PreconditionNotMetError(definition.name, precondition)
    }
  }
}

// Local helpers kept private to the engine module.

function toEntity<TData>(version: EntityVersion<TData>): Entity<TData> {
  return {
    id: version.id,
    schemaId: version.schemaId,
    schemaVersion: version.schemaVersion,
    version: version.version,
    data: version.data,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
  }
}

function defaultIdGenerator(): () => string {
  const cryptoRef: { randomUUID?: () => string } | undefined = (
    globalThis as unknown as { crypto?: { randomUUID?: () => string } }
  ).crypto
  if (cryptoRef?.randomUUID) {
    return () => cryptoRef.randomUUID!()
  }
  // Fallback — sufficient for prototype use.
  return () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
}

/**
 * Compare two version strings. Attempts semver-like numeric comparison by
 * splitting on '.', falling back to lexicographic string comparison when
 * segments are not numeric.
 */
function compareVersions(a: string, b: string): number {
  const as = a.split('.')
  const bs = b.split('.')
  const len = Math.max(as.length, bs.length)
  for (let i = 0; i < len; i++) {
    const ap = as[i] ?? '0'
    const bp = bs[i] ?? '0'
    const an = Number(ap)
    const bn = Number(bp)
    if (!Number.isNaN(an) && !Number.isNaN(bn)) {
      if (an !== bn) return an - bn
    } else {
      const cmp = ap.localeCompare(bp)
      if (cmp !== 0) return cmp
    }
  }
  return 0
}
