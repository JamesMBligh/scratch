<script setup lang="ts">
// Placeholder for items lying on the ground in the current scene. Will eventually
// be wired to a per-scene ground inventory the engine can read/write.
defineProps<{
  sceneName?: string;
}>();
</script>

<template>
  <section class="ground" aria-label="On the ground">
    <header class="panel-header">On the ground</header>
    <div class="panel-body">
      <p class="placeholder">Ground items placeholder{{ sceneName ? ` (${sceneName})` : '' }}</p>
    </div>
  </section>
</template>

<style scoped>
.ground {
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--accent-dim);
  height: 120px;
  flex: 0 0 120px;
}

.panel-header {
  font-size: 0.75rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-dim);
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid var(--accent-dim);
}

.panel-body {
  flex: 1 1 auto;
  padding: 0.6rem 0.85rem;
}

.placeholder {
  margin: 0;
  color: var(--ink-dim);
  font-style: italic;
}
</style>
