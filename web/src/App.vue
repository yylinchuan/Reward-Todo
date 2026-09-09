<template>
  <RewardTodoView />
</template>

<script setup>
import RewardTodoView from './views/RewardTodoView.vue';
</script>

<style>
:root {
  color-scheme: light;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}
html, body, #app { min-height: 100%; margin: 0; }
body { min-width: 320px; background: #c8c0b2; }
button, input { font: inherit; }
button:focus-visible, input:focus-visible, summary:focus-visible { outline: 3px solid rgba(168, 54, 45, .45); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
}
</style>
