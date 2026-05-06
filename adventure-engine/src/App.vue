<script setup lang="ts">
import { ref } from 'vue';
import type { Adventure } from './types';
import AdventureGame from './components/AdventureGame.vue';
import cabin from './adventures/cabin.json';

const adventure = ref<Adventure>(cabin as Adventure);
</script>

<template>
  <AdventureGame :adventure="adventure" />
</template>
