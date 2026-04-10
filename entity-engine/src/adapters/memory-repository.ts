import type { Entity, EntityVersion } from '../types/entity'
import type { FieldFilter, QueryCriteria } from '../types/query'
import type { AssessmentResult } from '../types/assessment'
import type {
  IAssessmentRunRepository,
  IEntityRepository,
} from '../interfaces/repository'
import { getFieldValue } from '../assessment/field-path'

/**
 * Reference in-memory implementation of IEntityRepository. Intended for
 * unit tests and local prototyping only — not safe for production.
 */
export class MemoryEntityRepository implements IEntityRepository {
  private readonly versions = new Map<string, EntityVersion[]>()

  async save(version: EntityVersion): Promise<void> {
    const list = this.versions.get(version.id) ?? []
    list.push(cloneVersion(version))
    list.sort((a, b) => a.version - b.version)
    this.versions.set(version.id, list)
  }

  async findById(id: string): Promise<Entity | null> {
    const list = this.versions.get(id)
    if (!list || list.length === 0) return null
    return toEntity(list[list.length - 1])
  }

  async findVersion(
    id: string,
    version: number,
  ): Promise<EntityVersion | null> {
    const list = this.versions.get(id)
    if (!list) return null
    const found = list.find((v) => v.version === version)
    return found ? cloneVersion(found) : null
  }

  async findAllVersions(id: string): Promise<EntityVersion[]> {
    const list = this.versions.get(id)
    if (!list) return []
    return list.map(cloneVersion)
  }

  async find(criteria: QueryCriteria): Promise<Entity[]> {
    const matches = this.matchingEntities(criteria)
    const sorted = sortEntities(matches, criteria.sort)
    return paginate(sorted, criteria.pagination)
  }

  async count(criteria: QueryCriteria): Promise<number> {
    return this.matchingEntities(criteria).length
  }

  async delete(id: string): Promise<void> {
    this.versions.delete(id)
  }

  // ── internal helpers ────────────────────────────────────────────────────

  private matchingEntities(criteria: QueryCriteria): Entity[] {
    const entities: Entity[] = []
    for (const list of this.versions.values()) {
      if (list.length === 0) continue
      const latest = toEntity(list[list.length - 1])
      if (criteria.schemaId && latest.schemaId !== criteria.schemaId) continue
      if (
        criteria.schemaVersion &&
        latest.schemaVersion !== criteria.schemaVersion
      )
        continue
      if (
        criteria.filters &&
        !criteria.filters.every((filter) => matchesFilter(latest, filter))
      )
        continue
      entities.push(latest)
    }
    return entities
  }
}

/**
 * Reference in-memory implementation of IAssessmentRunRepository.
 */
export class MemoryAssessmentRunRepository
  implements IAssessmentRunRepository
{
  private readonly runs: AssessmentResult[] = []

  async save(result: AssessmentResult): Promise<void> {
    this.runs.push(cloneResult(result))
  }

  async findByEntityId(entityId: string): Promise<AssessmentResult[]> {
    return this.runs
      .filter((r) => r.entityId === entityId)
      .map(cloneResult)
      .sort((a, b) => b.ranAt.getTime() - a.ranAt.getTime())
  }

  async findLatest(
    entityId: string,
    assessmentName: string,
  ): Promise<AssessmentResult | null> {
    let latest: AssessmentResult | null = null
    for (const run of this.runs) {
      if (run.entityId !== entityId) continue
      if (run.assessmentName !== assessmentName) continue
      if (!latest || run.ranAt.getTime() > latest.ranAt.getTime()) {
        latest = run
      }
    }
    return latest ? cloneResult(latest) : null
  }
}

// ── helpers ───────────────────────────────────────────────────────────────

function toEntity(version: EntityVersion): Entity {
  const {
    previousVersion: _previousVersion,
    changeNote: _changeNote,
    ...entity
  } = version
  return {
    ...entity,
    data: deepClone(entity.data),
    createdAt: new Date(entity.createdAt),
    updatedAt: new Date(entity.updatedAt),
  }
}

function cloneVersion(version: EntityVersion): EntityVersion {
  return {
    ...version,
    data: deepClone(version.data),
    createdAt: new Date(version.createdAt),
    updatedAt: new Date(version.updatedAt),
  }
}

function cloneResult(result: AssessmentResult): AssessmentResult {
  return {
    ...result,
    findings: result.findings.map((f) => ({ ...f })),
    ranAt: new Date(result.ranAt),
  }
}

function deepClone<T>(value: T): T {
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value)) as T
}

function matchesFilter(entity: Entity, filter: FieldFilter): boolean {
  const actual = getFieldValue(entity.data, filter.field)
  const expected = filter.value
  switch (filter.operator) {
    case 'eq':
      return actual === expected
    case 'neq':
      return actual !== expected
    case 'gt':
      return compareOrdered(actual, expected, (a, b) => a > b)
    case 'gte':
      return compareOrdered(actual, expected, (a, b) => a >= b)
    case 'lt':
      return compareOrdered(actual, expected, (a, b) => a < b)
    case 'lte':
      return compareOrdered(actual, expected, (a, b) => a <= b)
    case 'in':
      if (!Array.isArray(expected)) return false
      return (expected as unknown[]).includes(actual)
    case 'contains':
      if (typeof actual === 'string' && typeof expected === 'string') {
        return actual.includes(expected)
      }
      if (Array.isArray(actual)) {
        return (actual as unknown[]).includes(expected)
      }
      return false
    default:
      return false
  }
}

function compareOrdered(
  a: unknown,
  b: unknown,
  cmp: (a: number, b: number) => boolean,
): boolean {
  if (typeof a === 'number' && typeof b === 'number') return cmp(a, b)
  if (typeof a === 'string' && typeof b === 'string') {
    return cmp(a.localeCompare(b), 0)
  }
  return false
}

function sortEntities(
  entities: Entity[],
  sort: QueryCriteria['sort'],
): Entity[] {
  if (!sort) return entities
  const { field, direction } = sort
  const multiplier = direction === 'desc' ? -1 : 1
  return [...entities].sort((a, b) => {
    const av = resolveSortField(a, field)
    const bv = resolveSortField(b, field)
    if (av === bv) return 0
    if (av === undefined) return 1
    if (bv === undefined) return -1
    if (typeof av === 'number' && typeof bv === 'number') {
      return (av - bv) * multiplier
    }
    if (av instanceof Date && bv instanceof Date) {
      return (av.getTime() - bv.getTime()) * multiplier
    }
    return String(av).localeCompare(String(bv)) * multiplier
  })
}

function resolveSortField(entity: Entity, field: string): unknown {
  if (field === 'createdAt') return entity.createdAt
  if (field === 'updatedAt') return entity.updatedAt
  return getFieldValue(entity.data, field)
}

function paginate(entities: Entity[], pagination: QueryCriteria['pagination']) {
  if (!pagination) return entities
  const { limit, offset } = pagination
  return entities.slice(offset, offset + limit)
}
