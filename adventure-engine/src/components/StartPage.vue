<script setup lang="ts">
import { ref } from 'vue';
import { adventureCatalog, type AdventureCatalogEntry } from '../adventures';
import type { Adventure } from '../types';

const emit = defineEmits<{
  (e: 'start', adventure: Adventure, entry: AdventureCatalogEntry): void;
}>();

const loadingId = ref<string | null>(null);
const error = ref<string | null>(null);

async function play(entry: AdventureCatalogEntry) {
  if (loadingId.value) return;
  loadingId.value = entry.id;
  error.value = null;
  try {
    const adventure = await entry.load();
    emit('start', adventure, entry);
  } catch (err) {
    console.error(err);
    error.value = `Failed to load "${entry.title}".`;
  } finally {
    loadingId.value = null;
  }
}
</script>

<template>
  <main class="start">
    <header class="hero">
      <h1>Adventure Engine</h1>
      <p class="tagline">A small runtime for point-and-click adventures.</p>
    </header>

    <section class="catalog" aria-label="Available adventures">
      <h2>Choose an adventure</h2>
      <p v-if="adventureCatalog.length === 0" class="empty">
        No adventures registered. Add one to <code>src/adventures/index.ts</code>.
      </p>
      <ul v-else class="cards">
        <li v-for="entry in adventureCatalog" :key="entry.id" class="card">
          <h3>{{ entry.title }}</h3>
          <p v-if="entry.author" class="author">by {{ entry.author }}</p>
          <p class="description">{{ entry.description }}</p>
          <button
            type="button"
            :disabled="loadingId !== null"
            @click="play(entry)"
          >
            {{ loadingId === entry.id ? 'Loading…' : 'Play' }}
          </button>
        </li>
      </ul>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </section>
  </main>
</template>

<style scoped>
.start {
  max-width: 900px;
  margin: 0 auto;
  padding: 3rem 1.5rem;
}

.hero {
  text-align: center;
  margin-bottom: 2.5rem;
}

.hero h1 {
  margin: 0;
  font-size: 2.4rem;
  letter-spacing: 0.04em;
  color: var(--hot);
}

.tagline {
  color: var(--ink-dim);
  margin-top: 0.5rem;
}

.catalog h2 {
  font-size: 1rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-dim);
  margin-bottom: 1rem;
}

.cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem;
}

.card {
  background: var(--panel);
  border: 1px solid var(--accent-dim);
  padding: 1rem 1.1rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.card h3 {
  margin: 0;
  color: var(--hot);
  font-size: 1.15rem;
}

.card .author {
  margin: 0;
  font-size: 0.85rem;
  color: var(--ink-dim);
}

.card .description {
  margin: 0 0 0.5rem 0;
  color: var(--ink);
  flex: 1 1 auto;
  line-height: 1.45;
}

.card button {
  align-self: flex-start;
}

.empty {
  color: var(--ink-dim);
  font-style: italic;
}

.error {
  margin-top: 1rem;
  color: #f08080;
}
</style>
