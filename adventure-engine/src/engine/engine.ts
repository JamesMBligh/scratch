import { reactive, computed, type ComputedRef } from 'vue';
import type {
  Action,
  Adventure,
  GameState,
  NarrationEntry,
  Scene,
  SceneObject,
} from '../types';
import { registerBuiltInActions, runActions } from './actions';
import { evaluateCondition, registerBuiltInConditions } from './conditions';
import type { ActionContext } from './registry';

let narrationCounter = 0;

/** GameEngine ties together adventure data, mutable state, and the registries. */
export class GameEngine {
  readonly adventure: Adventure;
  readonly state: GameState;
  readonly currentScene: ComputedRef<Scene>;

  constructor(adventure: Adventure) {
    this.adventure = adventure;
    const initial = adventure.initialState ?? {};
    this.state = reactive<GameState>({
      currentSceneId: adventure.startScene,
      flags: { ...(initial.flags ?? {}) },
      inventory: [...(initial.inventory ?? [])],
      objectState: {},
      narration: [],
    });

    this.currentScene = computed(() => {
      const scene = adventure.scenes[this.state.currentSceneId];
      if (!scene) {
        throw new Error(`Unknown scene: ${this.state.currentSceneId}`);
      }
      return scene;
    });
  }

  /** Visible objects for the current scene, after applying runtime overrides. */
  visibleObjects(): SceneObject[] {
    const scene = this.currentScene.value;
    const ctx: ActionContext = { engine: this };
    return (scene.objects ?? []).filter((obj) => {
      const override = this.state.objectState[obj.id];
      if (override?.hidden) return false;
      if (override?.hidden === false) {
        // Explicitly shown by an action: ignore initiallyHidden.
      } else if (obj.initiallyHidden) {
        return false;
      }
      if (obj.visibleIf && !evaluateCondition(obj.visibleIf, { ...ctx, object: obj })) {
        return false;
      }
      return true;
    });
  }

  pushNarration(entry: Omit<NarrationEntry, 'id'>): void {
    this.state.narration.push({ ...entry, id: ++narrationCounter });
  }

  async enterScene(id: string): Promise<void> {
    const previous = this.adventure.scenes[this.state.currentSceneId];
    if (previous?.onExit) {
      await runActions(previous.onExit, { engine: this });
    }
    const next = this.adventure.scenes[id];
    if (!next) {
      console.warn(`[adventure-engine] Cannot goto unknown scene: ${id}`);
      return;
    }
    this.state.currentSceneId = id;
    if (next.description) {
      this.pushNarration({ kind: 'narration', text: next.description });
    }
    await runActions(next.onEnter, { engine: this });
  }

  /** Run a trigger (e.g. "onClick") for an object. */
  async fireTrigger(object: SceneObject, trigger: string): Promise<void> {
    const actions: Action[] | undefined = object.triggers?.[trigger];
    if (!actions || actions.length === 0) return;
    await runActions(actions, { engine: this, object, trigger });
  }

  /** Begin the adventure. Idempotent if state has been preserved by caller. */
  async start(): Promise<void> {
    const scene = this.currentScene.value;
    if (scene.description) {
      this.pushNarration({ kind: 'narration', text: scene.description });
    }
    await runActions(scene.onEnter, { engine: this });
  }
}

let registriesInitialised = false;

/** Initialise built-in action and condition handlers. Safe to call repeatedly. */
export function ensureBuiltInsRegistered(): void {
  if (registriesInitialised) return;
  registerBuiltInActions();
  registerBuiltInConditions();
  registriesInitialised = true;
}
