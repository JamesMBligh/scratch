import type { Condition } from '../types';
import { conditionRegistry, type ActionContext } from './registry';

/** Evaluate a condition by dispatching to the registry. Falsy/missing -> true. */
export function evaluateCondition(condition: Condition | undefined, ctx: ActionContext): boolean {
  if (!condition) return true;
  const handler = conditionRegistry.get(condition.type);
  if (!handler) {
    console.warn(`[adventure-engine] Unknown condition type: ${condition.type}`);
    return false;
  }
  return handler(condition, ctx);
}

export function registerBuiltInConditions(): void {
  // { type: "flag", flag: "doorUnlocked", equals: true }
  // `equals` defaults to true, so `{ type: "flag", flag: "x" }` is "x is truthy".
  conditionRegistry.register('flag', (cond, { engine }) => {
    const flag = cond.flag as string;
    const expected = 'equals' in cond ? cond.equals : true;
    return engine.state.flags[flag] === expected;
  });

  // { type: "hasItem", item: "key" }
  conditionRegistry.register('hasItem', (cond, { engine }) => {
    return engine.state.inventory.includes(cond.item as string);
  });

  // { type: "scene", scene: "outside" }
  conditionRegistry.register('scene', (cond, { engine }) => {
    return engine.state.currentSceneId === (cond.scene as string);
  });

  // { type: "and", conditions: [...] }
  conditionRegistry.register('and', (cond, ctx) => {
    const list = (cond.conditions as Condition[]) ?? [];
    return list.every((c) => evaluateCondition(c, ctx));
  });

  // { type: "or", conditions: [...] }
  conditionRegistry.register('or', (cond, ctx) => {
    const list = (cond.conditions as Condition[]) ?? [];
    return list.some((c) => evaluateCondition(c, ctx));
  });

  // { type: "not", condition: { ... } }
  conditionRegistry.register('not', (cond, ctx) => {
    return !evaluateCondition(cond.condition as Condition, ctx);
  });
}
