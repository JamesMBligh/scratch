import type { Entity, EntityVersion } from '../types/entity'
import type { QueryCriteria } from '../types/query'
import type { AssessmentResult } from '../types/assessment'

/**
 * Contract for persisting entities and their version history. Consumer
 * applications implement this against whatever storage technology they use.
 */
export interface IEntityRepository {
  /**
   * Writes a new version record. The repository is responsible for persisting
   * both the current state and all historical versions.
   */
  save(version: EntityVersion): Promise<void>

  /** Returns the current (latest) version of an entity, or null if not found. */
  findById(id: string): Promise<Entity | null>

  /** Returns a specific historical version, or null if not found. */
  findVersion(id: string, version: number): Promise<EntityVersion | null>

  /** Returns all versions of an entity, ordered by version ascending. */
  findAllVersions(id: string): Promise<EntityVersion[]>

  /** Returns entities matching the query criteria (current versions only). */
  find(criteria: QueryCriteria): Promise<Entity[]>

  /** Returns the total count of entities matching criteria, for pagination. */
  count(criteria: QueryCriteria): Promise<number>

  /** Hard deletes an entity and all its versions. */
  delete(id: string): Promise<void>
}

/**
 * Contract for persisting assessment runs. Optional — if omitted, the engine
 * still returns results from `assess()` but does not store them.
 */
export interface IAssessmentRunRepository {
  save(result: AssessmentResult): Promise<void>
  findByEntityId(entityId: string): Promise<AssessmentResult[]>
  findLatest(
    entityId: string,
    assessmentName: string,
  ): Promise<AssessmentResult | null>
}
