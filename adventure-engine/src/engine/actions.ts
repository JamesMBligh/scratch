import type { Action, Condition } from '../types';
import { evaluateCondition } from './conditions';
import { actionRegistry, type ActionContext } from './registry';

/** Run a list of actions sequentially. Each action may be async. */
export async function runActions(
  actions: Action[] | undefined,
  ctx: ActionContext,
): Promise<void> {
  if (!actions) return;
  for (const action of actions) {
    const handler = actionRegistry.get(action.type);
    if (!handler) {
      console.warn(`[adventure-engine] Unknown action type: ${action.type}`);
      continue;
    }
    await handler(action, ctx);
  }
}

export function registerBuiltInActions(): void {
  // { type: "narrate", text: "...", speaker?, kind? }
  actionRegistry.register('narrate', (action, { engine }) => {
    engine.pushNarration({
      text: String(action.text ?? ''),
      speaker: action.speaker as string | undefined,
      kind: (action.kind as 'narration' | 'dialog' | 'system') ?? 'narration',
    });
  });

  // { type: "goto", scene: "interior" }
  actionRegistry.register('goto', async (action, { engine }) => {
    await engine.enterScene(String(action.scene));
  });

  // { type: "setFlag", flag: "doorUnlocked", value: true }
  actionRegistry.register('setFlag', (action, { engine }) => {
    engine.state.flags[String(action.flag)] = action.value ?? true;
  });

  // { type: "addItem", item: "key" }
  actionRegistry.register('addItem', (action, { engine }) => {
    const item = String(action.item);
    if (!engine.state.inventory.includes(item)) {
      engine.state.inventory.push(item);
      const display = engine.adventure.items?.[item]?.name ?? item;
      engine.pushNarration({ kind: 'system', text: `Acquired: ${display}.` });
    }
  });

  // { type: "removeItem", item: "key" }
  actionRegistry.register('removeItem', (action, { engine }) => {
    const item = String(action.item);
    const idx = engine.state.inventory.indexOf(item);
    if (idx >= 0) engine.state.inventory.splice(idx, 1);
  });

  // { type: "hideObject", object: "rock" } -- defaults to current trigger object
  actionRegistry.register('hideObject', (action, ctx) => {
    const id = (action.object as string) ?? ctx.object?.id;
    if (!id) return;
    const cur = ctx.engine.state.objectState[id] ?? {};
    ctx.engine.state.objectState[id] = { ...cur, hidden: true };
  });

  // { type: "showObject", object: "rock" }
  actionRegistry.register('showObject', (action, ctx) => {
    const id = (action.object as string) ?? ctx.object?.id;
    if (!id) return;
    const cur = ctx.engine.state.objectState[id] ?? {};
    ctx.engine.state.objectState[id] = { ...cur, hidden: false };
  });

  // { type: "if", condition: {...}, then: [...], else?: [...] }
  actionRegistry.register('if', async (action, ctx) => {
    const cond = action.condition as Condition;
    const branch = evaluateCondition(cond, ctx)
      ? (action.then as Action[] | undefined)
      : (action.else as Action[] | undefined);
    await runActions(branch, ctx);
  });

  // { type: "sequence", actions: [...] } -- handy for nesting via `if.then`.
  actionRegistry.register('sequence', async (action, ctx) => {
    await runActions((action.actions as Action[]) ?? [], ctx);
  });

  // { type: "wait", ms: 500 } -- pause between narration lines.
  actionRegistry.register('wait', async (action) => {
    const ms = Number(action.ms ?? 0);
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  });
}
