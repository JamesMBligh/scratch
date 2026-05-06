<script setup lang="ts">
// Placeholder for the player's persistent inventory, shown to the right of
// the scene. To be replaced with real inventory UI later.
defineProps<{
  inventory: string[];
}>();
</script>

<template>
  <aside class="side-panel" aria-label="Inventory">
    <header class="panel-header">Inventory</header>
    <div class="panel-body">
      <p class="placeholder">Inventory placeholder</p>
      <p v-if="inventory.length > 0" class="count">
        {{ inventory.length }} item{{ inventory.length === 1 ? '' : 's' }} carried
      </p>
    </div>
  </aside>
</template>

<style scoped>
.side-panel {
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--accent-dim);
  width: 240px;
  flex: 0 0 240px;
}

.panel-header {
  font-size: 0.75rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-dim);
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--accent-dim);
}

.panel-body {
  flex: 1 1 auto;
  padding: 0.75rem 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.placeholder {
  margin: 0;
  color: var(--ink-dim);
  font-style: italic;
}

.count {
  margin: 0;
  color: var(--accent);
  font-size: 0.85rem;
}
</style>
