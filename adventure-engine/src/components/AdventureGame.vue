<script setup lang="ts">
import { onMounted, shallowRef, watch } from 'vue';
import type { Adventure } from '../types';
import { GameEngine, ensureBuiltInsRegistered } from '../engine/engine';
import SceneView from './SceneView.vue';
import NarrationPanel from './NarrationPanel.vue';
import InventoryPanel from './InventoryPanel.vue';

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
    <div class="layout">
      <div class="left">
        <SceneView :engine="engine" />
        <InventoryPanel :inventory="engine.state.inventory" :items="adventure.items" />
      </div>
      <div class="right">
        <NarrationPanel :entries="engine.state.narration" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.game {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
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

.layout {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 0.75rem;
  flex: 1 1 auto;
  min-height: 0;
}

.left {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 0;
}

.right {
  min-height: 0;
}

@media (max-width: 800px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
