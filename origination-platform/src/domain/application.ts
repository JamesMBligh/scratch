import type { Entity, EntityVersion } from 'entity-engine'
import type {
  WorkflowInstance,
  WorkflowInstanceVersion,
} from 'workflow-engine'

import type { OriginationContext } from './products'

/**
 * The unified view returned by the API. Flattens the underlying entity +
 * workflow instance into a single shape that clients can consume without
 * needing to know about either library.
 *
 * `id` is the workflow instance id — it doubles as the public
 * application id.
 */
export interface ApplicationView {
  id: string
  productId: string
  entityId: string
  schemaId: string
  schemaVersion: string
  state: string
  status: 'active' | 'completed'
  data: unknown
  entityVersion: number
  workflowVersion: number
  createdAt: Date
  updatedAt: Date
}

export function mergeApplication(
  workflow: WorkflowInstance<OriginationContext>,
  entity: Entity<unknown>,
): ApplicationView {
  return {
    id: workflow.id,
    productId: workflow.context.productId,
    entityId: entity.id,
    schemaId: entity.schemaId,
    schemaVersion: entity.schemaVersion,
    state: workflow.currentState,
    status: workflow.status,
    data: entity.data,
    entityVersion: entity.version,
    workflowVersion: workflow.version,
    // createdAt is the earlier of the two; both should match in practice.
    createdAt:
      workflow.createdAt < entity.createdAt
        ? workflow.createdAt
        : entity.createdAt,
    // updatedAt is the later of the two — whichever side mutated last.
    updatedAt:
      workflow.updatedAt > entity.updatedAt
        ? workflow.updatedAt
        : entity.updatedAt,
  }
}

/**
 * A single entry in the merged audit history returned by
 * `GET /v1/applications/:id/history`. Entity and workflow events are
 * interleaved by timestamp.
 */
export type HistoryEvent =
  | {
      kind: 'data-version'
      at: Date
      entityVersion: number
      previousVersion: number | null
      changeNote?: string
    }
  | {
      kind: 'workflow-version'
      at: Date
      workflowVersion: number
      previousVersion: number | null
      state: string
      cause:
        | { type: 'start'; note?: string }
        | {
            type: 'transition'
            transition: string
            fromState: string
            toState: string
            eventData?: unknown
            actor?: string
            note?: string
          }
    }

export function buildMergedHistory(
  entityVersions: EntityVersion<unknown>[],
  workflowVersions: WorkflowInstanceVersion<OriginationContext>[],
): HistoryEvent[] {
  const events: HistoryEvent[] = []

  for (const ev of entityVersions) {
    events.push({
      kind: 'data-version',
      at: ev.updatedAt,
      entityVersion: ev.version,
      previousVersion: ev.previousVersion,
      changeNote: ev.changeNote,
    })
  }
  for (const wv of workflowVersions) {
    events.push({
      kind: 'workflow-version',
      at: wv.updatedAt,
      workflowVersion: wv.version,
      previousVersion: wv.previousVersion,
      state: wv.currentState,
      cause: wv.cause,
    })
  }

  // Stable chronological sort. When two events share a timestamp the
  // workflow event sorts after the matching entity event — this is
  // usually what you want when an update is quickly followed by a
  // transition that was waiting for the new data.
  return events.sort((a, b) => {
    const diff = a.at.getTime() - b.at.getTime()
    if (diff !== 0) return diff
    if (a.kind === b.kind) return 0
    return a.kind === 'data-version' ? -1 : 1
  })
}
