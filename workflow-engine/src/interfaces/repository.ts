import type {
  WorkflowInstance,
  WorkflowInstanceVersion,
} from '../types/instance'
import type { WorkflowQueryCriteria } from '../types/query'

/**
 * Contract for persisting workflow instances and their transition history.
 * Consumer applications implement this against whatever storage they use.
 *
 * Every transition (including the initial `start`) produces exactly one new
 * version record. `findById` returns the latest version as a plain
 * `WorkflowInstance`; `findAllVersions` returns the full history.
 */
export interface IWorkflowRepository {
  /** Writes a new version record. */
  save(version: WorkflowInstanceVersion): Promise<void>

  /** Returns the current (latest) state of an instance, or null if not found. */
  findById(id: string): Promise<WorkflowInstance | null>

  /** Returns a specific historical version, or null if not found. */
  findVersion(
    id: string,
    version: number,
  ): Promise<WorkflowInstanceVersion | null>

  /** Returns all versions of an instance, ordered by version ascending. */
  findAllVersions(id: string): Promise<WorkflowInstanceVersion[]>

  /** Returns instances matching the query criteria (current versions only). */
  find(criteria: WorkflowQueryCriteria): Promise<WorkflowInstance[]>

  /** Returns the total count of instances matching criteria. */
  count(criteria: WorkflowQueryCriteria): Promise<number>

  /** Hard deletes an instance and all its versions. */
  delete(id: string): Promise<void>
}
