<script setup lang="ts">
import { computed, onMounted, shallowRef, watch } from 'vue';
import type { Adventure } from '../types';
import { GameEngine, ensureBuiltInsRegistered } from '../engine/engine';
import { SCENE_WIDTH } from '../engine/layout';
import SceneView from './SceneView.vue';
import NarrationPanel from './NarrationPanel.vue';
import SidePanel from './SidePanel.vue';
import GroundPanel from './GroundPanel.vue';

const props = defineProps<{
  adventure: Adventure;
}>();

defineEmits<{
  (e: 'exit'): void;
}>();

ensureBuiltInsRegistered();

const engine = shallowRef<GameEngine>(new GameEngine(props.adventure));

watch(
  () => props.adventure,
  (next) => {
    engine.value = new GameEngine(next);
    void engine.value.start();
  },
);

onMounted(() => {
  void engine.value.start();
});

const sceneName = computed(() => engine.value.currentScene.value.name);
// Match the ground/narration width to the scene so the layout aligns under it.
const sceneColStyle = { width: `${SCENE_WIDTH}px` };
</script>

<template>
  <div class="game">
    <header class="game-header">
      <button class="back" type="button" @click="$emit('exit')" aria-label="Back to menu">
        ← Menu
      </button>
      <h1>{{ adventure.title }}</h1>
      <span v-if="adventure.author" class="author">by {{ adventure.author }}</span>
    </header>

    <div class="stage">
      <div class="scene-column" :style="sceneColStyle">
        <SceneView :engine="engine" />
        <GroundPanel :scene-name="sceneName" />
        <NarrationPanel :entries="engine.state.narration" />
      </div>
      <SidePanel :inventory="engine.state.inventory" />
    </div>
  </div>
</template>

<style scoped>
.game {
  margin: 0 auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: max-content;
}

.game-header {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
}

.back {
  align-self: center;
  font-size: 0.85rem;
  padding: 0.25rem 0.6rem;
}

.game-header h1 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--hot);
  letter-spacing: 0.04em;
}

.author {
  color: var(--ink-dim);
  font-size: 0.9rem;
}

.stage {
  display: flex;
  align-items: stretch;
  gap: 0.75rem;
}

.scene-column {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex: 0 0 auto;
}

.scene-column > :deep(.narration) {
  height: 220px;
}
</style>
