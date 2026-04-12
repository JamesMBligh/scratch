import type {
  WorkflowInstance,
  WorkflowInstanceVersion,
} from '../types/instance'
import type { FieldFilter, WorkflowQueryCriteria } from '../types/query'
import type { IWorkflowRepository } from '../interfaces/repository'
import { getFieldValue } from '../field-path'

/**
 * Reference in-memory implementation of IWorkflowRepository. Intended for
 * unit tests and local prototyping only — not safe for production use.
 */
export class MemoryWorkflowRepository implements IWorkflowRepository {
  private readonly versions = new Map<string, WorkflowInstanceVersion[]>()

  async save(version: WorkflowInstanceVersion): Promise<void> {
    const list = this.versions.get(version.id) ?? []
    list.push(cloneVersion(version))
    list.sort((a, b) => a.version - b.version)
    this.versions.set(version.id, list)
  }

  async findById(id: string): Promise<WorkflowInstance | null> {
    const list = this.versions.get(id)
    if (!list || list.length === 0) return null
    return toInstance(list[list.length - 1])
  }

  async findVersion(
    id: string,
    version: number,
  ): Promise<WorkflowInstanceVersion | null> {
    const list = this.versions.get(id)
    if (!list) return null
    const found = list.find((v) => v.version === version)
    return found ? cloneVersion(found) : null
  }

  async findAllVersions(id: string): Promise<WorkflowInstanceVersion[]> {
    const list = this.versions.get(id)
    if (!list) return []
    return list.map(cloneVersion)
  }

  async find(criteria: WorkflowQueryCriteria): Promise<WorkflowInstance[]> {
    const matches = this.matchingInstances(criteria)
    const sorted = sortInstances(matches, criteria.sort)
    return paginate(sorted, criteria.pagination)
  }

  async count(criteria: WorkflowQueryCriteria): Promise<number> {
    return this.matchingInstances(criteria).length
  }

  async delete(id: string): Promise<void> {
    this.versions.delete(id)
  }

  // ── internal helpers ─────────────────────────────────────────────────

  private matchingInstances(
    criteria: WorkflowQueryCriteria,
  ): WorkflowInstance[] {
    const instances: WorkflowInstance[] = []
    for (const list of this.versions.values()) {
      if (list.length === 0) continue
      const latest = toInstance(list[list.length - 1])
      if (criteria.workflowName && latest.workflowName !== criteria.workflowName)
        continue
      if (
        criteria.workflowVersion &&
        latest.workflowVersion !== criteria.workflowVersion
      )
        continue
      if (criteria.currentState && latest.currentState !== criteria.currentState)
        continue
      if (criteria.status && latest.status !== criteria.status) continue
      if (
        criteria.contextFilters &&
        !criteria.contextFilters.every((filter) =>
          matchesFilter(latest, filter),
        )
      )
        continue
      instances.push(latest)
    }
    return instances
  }
}

// ── helpers ─────────────────────────────────────────────────────────────

function toInstance(version: WorkflowInstanceVersion): WorkflowInstance {
  const {
    previousVersion: _previousVersion,
    cause: _cause,
    ...instance
  } = version
  return {
    ...instance,
    context: deepClone(instance.context),
    createdAt: new Date(instance.createdAt),
    updatedAt: new Date(instance.updatedAt),
  }
}

function cloneVersion(
  version: WorkflowInstanceVersion,
): WorkflowInstanceVersion {
  return {
    ...version,
    context: deepClone(version.context),
    cause: deepClone(version.cause),
    createdAt: new Date(version.createdAt),
    updatedAt: new Date(version.updatedAt),
  }
}

function deepClone<T>(value: T): T {
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value)) as T
}

function matchesFilter(instance: WorkflowInstance, filter: FieldFilter): boolean {
  const actual = getFieldValue(instance.context, filter.field)
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

function sortInstances(
  instances: WorkflowInstance[],
  sort: WorkflowQueryCriteria['sort'],
): WorkflowInstance[] {
  if (!sort) return instances
  const { field, direction } = sort
  const multiplier = direction === 'desc' ? -1 : 1
  return [...instances].sort((a, b) => {
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

function resolveSortField(instance: WorkflowInstance, field: string): unknown {
  if (field === 'createdAt') return instance.createdAt
  if (field === 'updatedAt') return instance.updatedAt
  return getFieldValue(instance.context, field)
}

function paginate(
  instances: WorkflowInstance[],
  pagination: WorkflowQueryCriteria['pagination'],
): WorkflowInstance[] {
  if (!pagination) return instances
  const { limit, offset } = pagination
  return instances.slice(offset, offset + limit)
}
