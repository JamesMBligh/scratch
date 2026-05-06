<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import type { Adventure } from './types';
import StartPage from './components/StartPage.vue';
import AdventureGame from './components/AdventureGame.vue';

const activeAdventure = shallowRef<Adventure | null>(null);
const sessionKey = ref(0);

function handleStart(adventure: Adventure) {
  activeAdventure.value = adventure;
  sessionKey.value += 1;
}

function handleExit() {
  activeAdventure.value = null;
}
</script>

<template>
  <StartPage v-if="!activeAdventure" @start="handleStart" />
  <AdventureGame
    v-else
    :key="sessionKey"
    :adventure="activeAdventure"
    @exit="handleExit"
  />
</template>
