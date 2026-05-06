# CLAUDE.md

Guidance for Claude Code sessions working on this repository.

## What this is

A Vue 3 + Vite + TypeScript runtime for **point-and-click adventure games defined entirely by JSON**. The engine is intentionally generic: scene-object types, action types, and condition types are all dispatched through registries so new behaviour can be plugged in without touching the runtime. The repo also ships a sample adventure (`The Cabin in the Clearing`) and a GitHub Pages deploy workflow.

The original prototype lived in a multi-project scratch repo and was extracted into this standalone repository. There may be earlier conversation history that no longer travels with the code; this file is the durable summary.

## Stack & commands

- **Vue 3** (script-setup, `<script setup lang="ts">`), **Vite 5**, **TypeScript** (strict).
- `npm run dev` — local dev server (default port 5173).
- `npm run build` — `vue-tsc --noEmit && vite build`. Always run this after non-trivial changes; it is the closest thing to a test suite right now.
- `npm run typecheck` — `vue-tsc --noEmit` only.
- No test framework yet. If you add one, prefer Vitest.

## Architecture

### Engine (`src/engine/`)

- `types.ts` (in `src/`) — domain types: `Adventure`, `Scene`, `SceneObject`, `Action`, `Condition`, `GameState`, `NarrationEntry`. `Action` and `Condition` are intentionally open-ended: `{ type: string, ...rest }`.
- `registry.ts` — three registries: `actionRegistry`, `conditionRegistry`, `objectComponentRegistry`. Each is an instance of a tiny `Registry<T>` class. `ActionContext` is what handlers receive (`{ engine, object?, trigger? }`).
- `actions.ts` — built-in action handlers (`narrate`, `goto`, `setFlag`, `addItem`, `removeItem`, `hideObject`, `showObject`, `if`, `sequence`, `wait`). `runActions(actions, ctx)` is the entry point.
- `conditions.ts` — built-in conditions (`flag`, `hasItem`, `scene`, `and`, `or`, `not`). `evaluateCondition(cond, ctx)` returns boolean.
- `engine.ts` — `GameEngine` class. Holds the reactive `GameState`, exposes `currentScene` (computed), `visibleObjects()`, `pushNarration()`, `enterScene(id)`, `fireTrigger(object, triggerName)`, `start()`. `ensureBuiltInsRegistered()` wires built-ins idempotently.
- `layout.ts` — `SCENE_WIDTH = 960`, `SCENE_HEIGHT = 540`. Object rects in adventure JSON are percentages of these, so changing them rescales everything cleanly.
- `index.ts` — public re-exports. Treat this as the engine's surface API.

### Components (`src/components/`)

- `AdventureGame.vue` — the host component. Takes an `Adventure` prop, owns a `GameEngine`, emits `exit`. The layout is a flex stage:
  - left **scene column** (fixed `SCENE_WIDTH`): `SceneView` → `GroundPanel` → `NarrationPanel`,
  - right **side column**: `SidePanel`.
- `SceneView.vue` — fixed-size scene canvas. Renders background and absolutely-positioned `SceneObjectView`s.
- `SceneObjectView.vue` — generic clickable region. Looks up its inner renderer in `objectComponentRegistry` keyed by `object.type` (default `hotspot`). Emits `click` / `hover`, which `SceneView` forwards to `engine.fireTrigger(obj, 'onClick' | 'onHover')`.
- `HotspotObject.vue` — default object renderer (transparent box, optional image, optional colour overlay).
- `NarrationPanel.vue` — scrollable log; auto-scrolls on new entries; supports `narration` / `dialog` (with `speaker`) / `system` kinds.
- `SidePanel.vue` — **placeholder** for the persistent player inventory. To be designed.
- `GroundPanel.vue` — **placeholder** for items lying on the ground in the current scene. To be designed; will likely need engine support for per-scene ground inventories.
- `StartPage.vue` — lists `adventureCatalog` entries; emits `start(adventure, entry)`.

### App shell

- `src/App.vue` — switches between `StartPage` and `AdventureGame`. A `sessionKey` ref is bumped each launch so re-entering the same adventure remounts with fresh state.
- `src/main.ts` — mounts `App` and imports global `style.css`.

### Adventures

- `src/adventures/index.ts` — `adventureCatalog: AdventureCatalogEntry[]`. Each entry has `{ id, title, description, author?, load }` where `load: () => Promise<Adventure>` is a dynamic import so adventure JSON is code-split.
- `src/adventures/cabin.json` — sample adventure exercising locked doors, hidden-key pickup, conditional reveal of a trapdoor after reading a note, lantern-gated cellar descent, dialog narration. **Use it as a reference when authoring new adventures or testing engine changes.**

## Adventure JSON shape (essentials)

```jsonc
{
  "title": "...",
  "author": "...",
  "startScene": "sceneId",
  "initialState": { "flags": {}, "inventory": [] },
  "items": { "key": { "name": "Brass Key", "description": "..." } },
  "scenes": {
    "sceneId": {
      "name": "Display Name",
      "background": "#hex | rgb(...) | /url-or-path.jpg",
      "description": "Auto-narrated on enter (optional).",
      "onEnter": [/* actions */],
      "onExit":  [/* actions */],
      "objects": [
        {
          "id": "uniqueId",
          "name": "Display name",
          "type": "hotspot",          // or any registered type
          "rect": { "x": 0, "y": 0, "w": 100, "h": 100 }, // % of scene
          "color": "rgba(...)",        // optional overlay tint
          "image": "/path.png",        // optional sprite
          "initiallyHidden": false,
          "visibleIf": { "type": "flag", "flag": "x" },
          "triggers": {
            "onClick": [/* actions */],
            "onHover": [/* actions */]
          }
        }
      ]
    }
  }
}
```

Triggers are arbitrary string keys; the engine just runs whichever action list matches the event you fire. New trigger names cost nothing.

## How to extend

### Add an adventure

1. Add the JSON under `src/adventures/`.
2. Append an entry to `adventureCatalog` in `src/adventures/index.ts`. Use a dynamic import so it lazy-loads.

### Add an action type

```ts
import { actionRegistry } from './engine/registry';
actionRegistry.register('myAction', (action, ctx) => {
  // action: { type: 'myAction', ... }
  // ctx:    { engine, object?, trigger? }
});
```

Register it before the first `GameEngine` is constructed (or co-locate with `registerBuiltInActions` if it should always be available). Async handlers are supported; `runActions` awaits each.

### Add a condition type

Same pattern with `conditionRegistry`. Handler returns `boolean`.

### Add a scene-object type

```ts
import { objectComponentRegistry } from './engine/registry';
import MyObject from './components/MyObject.vue';
objectComponentRegistry.register('myType', MyObject);
```

The component receives the `SceneObject` as a prop. `SceneObjectView` already provides the positioned, clickable wrapper; your component just renders the inner contents.

## Conventions & gotchas

- **Don't break the percentage-based `rect`s** when changing `SCENE_WIDTH`/`SCENE_HEIGHT` — they're deliberately resolution-independent.
- **`ensureBuiltInsRegistered()`** must be called before any `GameEngine` is constructed. `AdventureGame.vue` does this; if you instantiate the engine elsewhere, make sure to do it too.
- **State is `reactive`**, but `engine` itself is held in a `shallowRef` so swapping adventures replaces the entire instance cleanly.
- **`SidePanel` and `GroundPanel` are placeholders.** The intent is to flesh them out in future work — likely with new action types like `dropItem` / `pickUpFromGround` and a `groundItems` map on either `Scene` or `GameState`.
- **No comments unless they explain non-obvious WHY.** Don't restate code in prose.
- **Don't introduce cross-cutting abstractions** for hypothetical future requirements. Two adventures of similar shape don't yet justify a base class.

## Deployment

- `.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on every push to `main`.
- `vite.config.ts` reads `BASE_PATH` (set by `actions/configure-pages`) so asset URLs resolve under `/<repo-name>/` for project Pages sites and `/` for user/org or custom-domain sites.
- One-time setup in the GitHub repo: **Settings → Pages → Source: GitHub Actions**.
