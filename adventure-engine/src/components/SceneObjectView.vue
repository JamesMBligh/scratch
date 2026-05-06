<script setup lang="ts">
import { computed, markRaw } from 'vue';
import type { Component } from 'vue';
import type { SceneObject } from '../types';
import { objectComponentRegistry } from '../engine/registry';
import HotspotObject from './HotspotObject.vue';

const props = defineProps<{
  object: SceneObject;
}>();

defineEmits<{
  (e: 'click', object: SceneObject): void;
  (e: 'hover', object: SceneObject): void;
}>();

const rectStyle = computed(() => {
  const r = props.object.rect ?? { x: 0, y: 0, w: 100, h: 100 };
  return {
    left: `${r.x}%`,
    top: `${r.y}%`,
    width: `${r.w}%`,
    height: `${r.h}%`,
  };
});

const objectComponent = computed<Component>(() => {
  const type = props.object.type ?? 'hotspot';
  const registered = objectComponentRegistry.get(type);
  return registered ?? markRaw(HotspotObject);
});

const hasClick = computed(() => Boolean(props.object.triggers?.onClick?.length));
</script>

<template>
  <button
    class="scene-object"
    :class="{ clickable: hasClick }"
    :style="rectStyle"
    :aria-label="object.name ?? object.id"
    :title="object.name"
    type="button"
    @click="$emit('click', object)"
    @mouseenter="$emit('hover', object)"
    @focus="$emit('hover', object)"
  >
    <component :is="objectComponent" :object="object" />
  </button>
</template>

<style scoped>
.scene-object {
  position: absolute;
  background: transparent;
  border: 1px solid transparent;
  padding: 0;
  cursor: default;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}

.scene-object.clickable {
  cursor: pointer;
}

.scene-object:hover,
.scene-object:focus-visible {
  border-color: var(--hot);
  box-shadow: 0 0 12px rgba(240, 192, 96, 0.4);
  outline: none;
}
</style>
