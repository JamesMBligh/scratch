import type { Component } from 'vue';
import type { Action, Condition, SceneObject } from '../types';
import type { GameEngine } from './engine';

/** Context passed to action handlers. */
export interface ActionContext {
  engine: GameEngine;
  /** The object that triggered this action, if any (e.g. for click triggers). */
  object?: SceneObject;
  /** Trigger name the action originated from, if any. */
  trigger?: string;
}

export type ActionHandler = (action: Action, ctx: ActionContext) => void | Promise<void>;
export type ConditionHandler = (condition: Condition, ctx: ActionContext) => boolean;

/** Registries are simple maps; consumers can add their own types. */
export class Registry<T> {
  private map = new Map<string, T>();

  register(type: string, handler: T): void {
    this.map.set(type, handler);
  }

  get(type: string): T | undefined {
    return this.map.get(type);
  }

  has(type: string): boolean {
    return this.map.has(type);
  }

  types(): string[] {
    return [...this.map.keys()];
  }
}

export const actionRegistry = new Registry<ActionHandler>();
export const conditionRegistry = new Registry<ConditionHandler>();
/** Renders for `SceneObject.type`. The default "hotspot" is provided by the engine. */
export const objectComponentRegistry = new Registry<Component>();
