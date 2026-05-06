<script setup lang="ts">
import { computed } from 'vue';
import type { SceneObject } from '../types';

const props = defineProps<{
  object: SceneObject;
}>();

const hotspotStyle = computed(() =>
  props.object.color ? { background: props.object.color } : undefined,
);
</script>

<template>
  <div class="hotspot" :class="{ 'has-image': !!object.image }" :style="hotspotStyle">
    <img v-if="object.image" :src="object.image" :alt="object.name ?? object.id" />
  </div>
</template>

<style scoped>
.hotspot {
  width: 100%;
  height: 100%;
  border: 1px dashed transparent;
  background: transparent;
}

.hotspot.has-image {
  border: none;
}

.hotspot img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}
</style>
