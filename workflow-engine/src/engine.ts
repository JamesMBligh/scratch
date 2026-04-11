import type { WorkflowEngineConfig } from './types/config'
import type {
  TransitionDefinition,
  WorkflowDefinition,
} from './types/workflow'
import type {
  TransitionOutcome,
  VersionCause,
  WorkflowInstance,
  WorkflowInstanceVersion,
} from './types/instance'
import type { WorkflowQueryCriteria } from './types/query'
import {
  GuardNotRegisteredError,
  GuardRejectedError,
  InvalidTransitionError,
  TerminalStateError,
  WorkflowDefinitionNotFoundError,
  WorkflowEngineConfigError,
  WorkflowInstanceNotFoundError,
} from './errors'

/**
 * Main workflow engine. Constructed with a complete WorkflowEngineConfig —
 * all behaviour is fixed at construction time.
 */
export class WorkflowEngine<TContext = unknown, TEventData = unknown> {
  private readonly config: WorkflowEngineConfig<TContext, TEventData>
  private readonly workflows: Map<string, WorkflowDefinition>
  private readonly workflowsByName: Map<string, WorkflowDefinition[]>
  private readonly generateId: () => string

  constructor(config: WorkflowEngineConfig<TContext, TEventData>) {
    this.config = config
    this.workflows = new Map()
    this.workflowsByName = new Map()

    this.validateConfig()

    this.generateId = config.generateId ?? defaultIdGenerator()
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  /**
   * Starts a new workflow instance in the workflow's `initialState`.
   * If `workflowVersion` is omitted, the highest registered version is used.
   */
  async start(
    workflowName: string,
    context: TContext,
    opts?: { workflowVersion?: string; note?: string },
  ): Promise<WorkflowInstance<TContext>> {
    const definition = this.resolveWorkflow(workflowName, opts?.workflowVersion)

    const now = new Date()
    const version: WorkflowInstanceVersion<TContext> = {
      id: this.generateId(),
      workflowName: definition.name,
      workflowVersion: definition.version,
      currentState: definition.initialState,
      status: definition.finalStates.includes(definition.initialState)
        ? 'completed'
        : 'active',
      context,
      version: 1,
      createdAt: now,
      updatedAt: now,
      previousVersion: null,
      cause: { type: 'start', note: opts?.note },
    }

    await this.config.repository.instances.save(
      version as unknown as WorkflowInstanceVersion,
    )
    return toInstance(version)
  }

  /**
   * Fires a named transition against an instance. Returns a TransitionOutcome
   * describing the move. Throws:
   *   - WorkflowInstanceNotFoundError if the instance does not exist
   *   - TerminalStateError if the instance is already completed
   *   - InvalidTransitionError if the transition name is unknown, or is not
   *     available from the instance's current state
   *   - GuardRejectedError if a guard returns { allowed: false }
   */
  async fire(
    instanceId: string,
    transitionName: string,
    eventData?: TEventData,
    opts?: { actor?: string; note?: string },
  ): Promise<TransitionOutcome<TContext>> {
    const current = (await this.config.repository.instances.findById(
      instanceId,
    )) as WorkflowInstance<TContext> | null
    if (!current) throw new WorkflowInstanceNotFoundError(instanceId)

    if (current.status === 'completed') {
      throw new TerminalStateError(instanceId, current.currentState)
    }

    const definition = this.resolveWorkflow(
      current.workflowName,
      current.workflowVersion,
    )

    const transition = findTransition(
      definition,
      transitionName,
      current.currentState,
    )

    if (transition.guard) {
      const guardFn = this.config.guards[transition.guard]
      if (!guardFn) {
        // Defensive — construction-time validation should prevent this.
        throw new GuardNotRegisteredError(transition.guard)
      }
      const result = await Promise.resolve(
        guardFn({
          instance: current,
          transition,
          eventData,
        }),
      )
      if (!result.allowed) {
        throw new GuardRejectedError(
          transition.name,
          result.reason,
          result.code,
        )
      }
    }

    const now = new Date()
    const fromState = current.currentState
    const toState = transition.to
    const cause: VersionCause = {
      type: 'transition',
      transition: transition.name,
      fromState,
      toState,
      eventData,
      actor: opts?.actor,
      note: opts?.note,
    }

    const nextStatus = definition.finalStates.includes(toState)
      ? 'completed'
      : 'active'

    const nextVersion: WorkflowInstanceVersion<TContext> = {
      id: current.id,
      workflowName: current.workflowName,
      workflowVersion: current.workflowVersion,
      currentState: toState,
      status: nextStatus,
      context: current.context,
      version: current.version + 1,
      createdAt: current.createdAt,
      updatedAt: now,
      previousVersion: current.version,
      cause,
    }

    await this.config.repository.instances.save(
      nextVersion as unknown as WorkflowInstanceVersion,
    )

    return {
      instance: toInstance(nextVersion),
      record: cloneVersion(nextVersion),
      fromState,
      toState,
      transition: transition.name,
    }
  }

  // ── Read operations ──────────────────────────────────────────────────

  async get(instanceId: string): Promise<WorkflowInstance<TContext> | null> {
    const found = await this.config.repository.instances.findById(instanceId)
    return (found as WorkflowInstance<TContext> | null) ?? null
  }

  async getVersion(
    instanceId: string,
    version: number,
  ): Promise<WorkflowInstanceVersion<TContext> | null> {
    const found = await this.config.repository.instances.findVersion(
      instanceId,
      version,
    )
    return (found as WorkflowInstanceVersion<TContext> | null) ?? null
  }

  async getHistory(
    instanceId: string,
  ): Promise<WorkflowInstanceVersion<TContext>[]> {
    const versions =
      await this.config.repository.instances.findAllVersions(instanceId)
    return versions as WorkflowInstanceVersion<TContext>[]
  }

  async find(
    criteria: WorkflowQueryCriteria,
  ): Promise<WorkflowInstance<TContext>[]> {
    const results = await this.config.repository.instances.find(criteria)
    return results as WorkflowInstance<TContext>[]
  }

  async count(criteria: WorkflowQueryCriteria): Promise<number> {
    return this.config.repository.instances.count(criteria)
  }

  async delete(instanceId: string): Promise<void> {
    return this.config.repository.instances.delete(instanceId)
  }

  /**
   * Returns the transitions currently fireable from the instance's state,
   * without evaluating guards. Useful for driving UI affordances.
   * Returns an empty array for completed instances.
   */
  async availableTransitions(
    instanceId: string,
  ): Promise<TransitionDefinition[]> {
    const instance = (await this.config.repository.instances.findById(
      instanceId,
    )) as WorkflowInstance<TContext> | null
    if (!instance) throw new WorkflowInstanceNotFoundError(instanceId)
    if (instance.status === 'completed') return []

    const definition = this.resolveWorkflow(
      instance.workflowName,
      instance.workflowVersion,
    )
    return definition.transitions.filter((t) =>
      fromStates(t).includes(instance.currentState),
    )
  }

  // ── Internal ─────────────────────────────────────────────────────────

  private validateConfig(): void {
    const seen = new Set<string>()
    for (const def of this.config.workflows) {
      const key = `${def.name}@${def.version}`
      if (seen.has(key)) {
        throw new WorkflowEngineConfigError(
          `Duplicate workflow definition: ${def.name}@${def.version}`,
        )
      }
      seen.add(key)

      const stateNames = new Set(def.states.map((s) => s.name))
      if (stateNames.size !== def.states.length) {
        throw new WorkflowEngineConfigError(
          `Workflow '${def.name}@${def.version}' has duplicate state names`,
        )
      }
      if (!stateNames.has(def.initialState)) {
        throw new WorkflowEngineConfigError(
          `Workflow '${def.name}@${def.version}' initialState '${def.initialState}' is not declared in states`,
        )
      }
      for (const finalState of def.finalStates) {
        if (!stateNames.has(finalState)) {
          throw new WorkflowEngineConfigError(
            `Workflow '${def.name}@${def.version}' finalState '${finalState}' is not declared in states`,
          )
        }
      }

      const transitionNames = new Set<string>()
      for (const transition of def.transitions) {
        if (transitionNames.has(transition.name)) {
          throw new WorkflowEngineConfigError(
            `Workflow '${def.name}@${def.version}' has duplicate transition name '${transition.name}'`,
          )
        }
        transitionNames.add(transition.name)

        const sources = fromStates(transition)
        if (sources.length === 0) {
          throw new WorkflowEngineConfigError(
            `Workflow '${def.name}@${def.version}' transition '${transition.name}' has no 'from' states`,
          )
        }
        for (const source of sources) {
          if (!stateNames.has(source)) {
            throw new WorkflowEngineConfigError(
              `Workflow '${def.name}@${def.version}' transition '${transition.name}' references unknown source state '${source}'`,
            )
          }
          if (def.finalStates.includes(source)) {
            throw new WorkflowEngineConfigError(
              `Workflow '${def.name}@${def.version}' transition '${transition.name}' fires from final state '${source}'`,
            )
          }
        }
        if (!stateNames.has(transition.to)) {
          throw new WorkflowEngineConfigError(
            `Workflow '${def.name}@${def.version}' transition '${transition.name}' references unknown target state '${transition.to}'`,
          )
        }
        if (transition.guard) {
          if (
            !this.config.guards ||
            !(transition.guard in this.config.guards)
          ) {
            throw new WorkflowEngineConfigError(
              `Workflow '${def.name}@${def.version}' transition '${transition.name}' references unregistered guard '${transition.guard}'`,
            )
          }
        }
      }

      this.workflows.set(key, def)
      const byName = this.workflowsByName.get(def.name) ?? []
      byName.push(def)
      this.workflowsByName.set(def.name, byName)
    }
  }

  private resolveWorkflow(
    name: string,
    version?: string,
  ): WorkflowDefinition {
    if (version !== undefined) {
      const found = this.workflows.get(`${name}@${version}`)
      if (!found) throw new WorkflowDefinitionNotFoundError(name, version)
      return found
    }
    const all = this.workflowsByName.get(name)
    if (!all || all.length === 0) {
      throw new WorkflowDefinitionNotFoundError(name)
    }
    return all.reduce((best, current) =>
      compareVersions(current.version, best.version) > 0 ? current : best,
    )
  }
}

// ── module-private helpers ────────────────────────────────────────────

function fromStates(transition: TransitionDefinition): string[] {
  return Array.isArray(transition.from) ? transition.from : [transition.from]
}

function findTransition(
  definition: WorkflowDefinition,
  transitionName: string,
  currentState: string,
): TransitionDefinition {
  const byName = definition.transitions.find((t) => t.name === transitionName)
  if (!byName) {
    throw new InvalidTransitionError(
      transitionName,
      currentState,
      'transition is not defined on this workflow',
    )
  }
  if (!fromStates(byName).includes(currentState)) {
    throw new InvalidTransitionError(
      transitionName,
      currentState,
      'transition is not available from the current state',
    )
  }
  return byName
}

function toInstance<TContext>(
  version: WorkflowInstanceVersion<TContext>,
): WorkflowInstance<TContext> {
  return {
    id: version.id,
    workflowName: version.workflowName,
    workflowVersion: version.workflowVersion,
    currentState: version.currentState,
    status: version.status,
    context: version.context,
    version: version.version,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
  }
}

function cloneVersion<TContext>(
  version: WorkflowInstanceVersion<TContext>,
): WorkflowInstanceVersion<TContext> {
  return {
    ...version,
    cause: JSON.parse(JSON.stringify(version.cause)) as VersionCause,
  }
}

function defaultIdGenerator(): () => string {
  const cryptoRef: { randomUUID?: () => string } | undefined = (
    globalThis as unknown as { crypto?: { randomUUID?: () => string } }
  ).crypto
  if (cryptoRef?.randomUUID) {
    return () => cryptoRef.randomUUID!()
  }
  return () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
}

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
