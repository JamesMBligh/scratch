<script setup lang="ts">
import { computed } from 'vue';
import type { Adventure } from '../types';

const props = defineProps<{
  inventory: string[];
  items?: Adventure['items'];
}>();

const entries = computed(() =>
  props.inventory.map((id) => ({
    id,
    name: props.items?.[id]?.name ?? id,
    description: props.items?.[id]?.description,
    image: props.items?.[id]?.image,
  })),
);
</script>

<template>
  <section class="inventory" aria-label="Inventory">
    <header class="inv-header">Inventory</header>
    <ul v-if="entries.length > 0" class="items">
      <li v-for="item in entries" :key="item.id" :title="item.description ?? item.name">
        <img v-if="item.image" :src="item.image" :alt="item.name" />
        <span v-else class="item-glyph">◆</span>
        <span class="item-name">{{ item.name }}</span>
      </li>
    </ul>
    <p v-else class="empty">Empty.</p>
  </section>
</template>

<style scoped>
.inventory {
  background: var(--panel);
  border: 1px solid var(--accent-dim);
  padding: 0.5rem 0.75rem;
}

.inv-header {
  font-size: 0.75rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-dim);
  margin-bottom: 0.4rem;
}

.items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.items li {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  background: var(--panel-2);
  border: 1px solid var(--accent-dim);
  padding: 0.25rem 0.5rem;
}

.item-glyph {
  color: var(--accent);
}

.empty {
  color: var(--ink-dim);
  font-style: italic;
  margin: 0;
}
</style>
