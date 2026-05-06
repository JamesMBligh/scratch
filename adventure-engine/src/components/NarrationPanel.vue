<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type { NarrationEntry } from '../types';

const props = defineProps<{
  entries: NarrationEntry[];
}>();

const scroller = ref<HTMLElement | null>(null);

watch(
  () => props.entries.length,
  async () => {
    await nextTick();
    if (scroller.value) {
      scroller.value.scrollTop = scroller.value.scrollHeight;
    }
  },
);
</script>

<template>
  <section class="narration" aria-label="Narration log">
    <header class="narration-header">Log</header>
    <div ref="scroller" class="narration-scroll">
      <p v-for="entry in entries" :key="entry.id" class="line" :class="`kind-${entry.kind}`">
        <span v-if="entry.speaker" class="speaker">{{ entry.speaker }}:</span>
        <span class="text">{{ entry.text }}</span>
      </p>
      <p v-if="entries.length === 0" class="empty">…</p>
    </div>
  </section>
</template>

<style scoped>
.narration {
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--accent-dim);
  height: 100%;
  min-height: 0;
}

.narration-header {
  font-size: 0.75rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-dim);
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--accent-dim);
}

.narration-scroll {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 0.75rem 1rem;
  scroll-behavior: smooth;
}

.line {
  margin: 0 0 0.6rem 0;
  line-height: 1.45;
}

.line.kind-system {
  color: var(--accent);
  font-style: italic;
}

.line.kind-dialog {
  color: #fff5d6;
}

.line .speaker {
  color: var(--hot);
  margin-right: 0.4rem;
  font-weight: bold;
}

.empty {
  color: var(--ink-dim);
  font-style: italic;
}
</style>
