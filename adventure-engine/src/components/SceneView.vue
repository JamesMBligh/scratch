<script setup lang="ts">
import { computed } from 'vue';
import type { GameEngine } from '../engine/engine';
import { SCENE_HEIGHT, SCENE_WIDTH } from '../engine/layout';
import type { SceneObject } from '../types';
import SceneObjectView from './SceneObjectView.vue';

const props = defineProps<{
  engine: GameEngine;
}>();

const scene = computed(() => props.engine.currentScene.value);
const objects = computed(() => props.engine.visibleObjects());

const backgroundStyle = computed(() => {
  const bg = scene.value.background;
  if (!bg) return { background: '#1a1722' };
  if (bg.startsWith('#') || bg.startsWith('rgb') || bg.startsWith('hsl')) {
    return { background: bg };
  }
  return {
    backgroundImage: `url(${bg})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
});

function handleClick(obj: SceneObject) {
  void props.engine.fireTrigger(obj, 'onClick');
}

function handleHover(obj: SceneObject) {
  void props.engine.fireTrigger(obj, 'onHover');
}
</script>

<template>
  <div
    class="scene"
    :style="{ width: `${SCENE_WIDTH}px`, height: `${SCENE_HEIGHT}px`, ...backgroundStyle }"
  >
    <div class="scene-frame">
      <SceneObjectView
        v-for="obj in objects"
        :key="obj.id"
        :object="obj"
        @click="handleClick"
        @hover="handleHover"
      />
    </div>
    <div class="scene-title">{{ scene.name }}</div>
  </div>
</template>

<style scoped>
.scene {
  position: relative;
  flex: 0 0 auto;
  background-color: #1a1722;
  border: 1px solid var(--accent-dim);
  overflow: hidden;
}

.scene-frame {
  position: absolute;
  inset: 0;
}

.scene-title {
  position: absolute;
  left: 0.75rem;
  bottom: 0.5rem;
  font-size: 0.85rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-dim);
  background: rgba(0, 0, 0, 0.45);
  padding: 0.15rem 0.5rem;
  pointer-events: none;
}
</style>
